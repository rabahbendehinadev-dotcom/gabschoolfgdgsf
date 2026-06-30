import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, Loader2, Smartphone, Share, Settings } from "lucide-react";
import {
  getVapidPublicKey,
  reportPushStatus,
  ackPushReminder,
  savePushSubscription,
} from "@workspace/api-client-react/src/generated/api";
import type {
  PushStatusResponse,
  PushStatusInputPermission,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import {
  isPushSupported,
  getNotificationPermission,
  enablePushSubscription,
} from "@/lib/push";

/**
 * Mandatory, professional push opt-in flow shown after login on the public app.
 *
 * It is a small imperative state machine rather than a stack of hooks, because
 * the decision depends on the live device permission (which can change while the
 * tab is open) and the server's reachability status:
 *
 *  - unsupported / push not configured  → render nothing (in-app notifications
 *    keep working; never traps a browser that physically can't do Web Push)
 *  - already enabled (server has a live subscription) or this device already
 *    granted → silently ensure a subscription and hide forever
 *  - iOS Safari not installed to the home screen → install guide (dismissible:
 *    the user literally cannot enable until they install, so we never trap them)
 *  - permission denied → recovery instructions + "I've enabled it" re-check
 *  - permission default → the mandatory, uncloseable modal
 *
 * "Don't nag every login" is honored by persisting a local dismissal for the
 * soft states (iOS / denied), while the server's one-time 7-day reminder
 * (`shouldRemind`) is allowed to override that dismissal exactly once and is
 * then acknowledged so it never fires again.
 */

const DENIED_DISMISS_KEY = "gab-push-denied-dismissed";
const IOS_DISMISS_KEY = "gab-push-ios-dismissed";

type Mode = "hidden" | "mandatory" | "denied" | "ios";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iP(hone|od|ad)/.test(ua)) return true;
  // iPadOS 13+ masquerades as desktop Safari; fall back to touch + Mac.
  return ua.includes("Macintosh") && typeof document !== "undefined" && "ontouchend" in document;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// localStorage can throw (Safari private mode, locked-down browsers). Never let
// a storage failure trap a user inside a dismissible modal.
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore — dismissal just won't persist across reloads */
  }
}

export function NotificationGate() {
  const { user, getAuthHeaders, bootstrapped } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("hidden");
  const [busy, setBusy] = useState(false);

  // Cache the VAPID key ("" once we know push isn't configured) and remember
  // whether the server's one-time reminder is what surfaced the current modal.
  const vapidRef = useRef<string | null>(null);
  const remindRef = useRef(false);
  const initedFor = useRef<number | null>(null);

  const report = useCallback(
    async (
      permission: PushStatusInputPermission,
      supported: boolean,
    ): Promise<PushStatusResponse | null> => {
      try {
        return await reportPushStatus({ permission, supported }, getAuthHeaders());
      } catch {
        return null;
      }
    },
    [getAuthHeaders],
  );

  const getVapid = useCallback(async (): Promise<string | null> => {
    if (vapidRef.current !== null) return vapidRef.current || null;
    try {
      const { publicKey } = await getVapidPublicKey();
      vapidRef.current = publicKey || "";
      return publicKey || null;
    } catch {
      vapidRef.current = "";
      return null;
    }
  }, []);

  const subscribeAndSave = useCallback(async (): Promise<boolean> => {
    const key = await getVapid();
    if (!key) return false;
    const sub = await enablePushSubscription(key);
    if (!sub) return false;
    try {
      // The server stamps permission=granted/supported telemetry on save.
      await savePushSubscription(sub, getAuthHeaders());
      return true;
    } catch {
      return false;
    }
  }, [getVapid, getAuthHeaders]);

  const ackReminderIfNeeded = useCallback(() => {
    if (!remindRef.current) return;
    remindRef.current = false;
    ackPushReminder(getAuthHeaders()).catch(() => {});
  }, [getAuthHeaders]);

  // Decide what (if anything) to show, once per signed-in user.
  useEffect(() => {
    if (!bootstrapped || !user) {
      setMode("hidden");
      initedFor.current = null;
      return;
    }
    if (initedFor.current === user.id) return;
    initedFor.current = user.id;

    let cancelled = false;
    (async () => {
      const supported = isPushSupported();

      // Happy path: this device already granted — make sure it is subscribed
      // and recorded, then never show any UI.
      if (supported && getNotificationPermission() === "granted") {
        await subscribeAndSave();
        if (!cancelled) setMode("hidden");
        return;
      }

      const localPerm: PushStatusInputPermission = supported
        ? (getNotificationPermission() as PushStatusInputPermission)
        : "unsupported";

      const status = await report(localPerm, supported);
      if (cancelled) return;

      if (status?.enabled || !supported) {
        setMode("hidden");
        return;
      }

      // Push must actually be configured on the server to be enable-able.
      const key = await getVapid();
      if (cancelled) return;
      if (!key) {
        setMode("hidden");
        return;
      }

      const remind = !!status?.shouldRemind;
      remindRef.current = remind;

      if (isIOS() && !isStandalone()) {
        const dismissed = safeGetItem(IOS_DISMISS_KEY) === "1";
        setMode(!dismissed || remind ? "ios" : "hidden");
        return;
      }

      const perm = getNotificationPermission();
      if (perm === "denied") {
        const dismissed = safeGetItem(DENIED_DISMISS_KEY) === "1";
        setMode(!dismissed || remind ? "denied" : "hidden");
        return;
      }

      // perm === "default": the mandatory, uncloseable decision point.
      setMode("mandatory");
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapped, user, report, subscribeAndSave, getVapid]);

  const finishEnabled = useCallback(() => {
    remindRef.current = false;
    setMode("hidden");
    toast({
      title: "تم تفعيل الإشعارات ✅",
      description: "ستصلك الآن أحدث الدروس والإعلانات المهمة أولاً بأول.",
    });
  }, [toast]);

  // Mandatory modal: the only path forward is to grant.
  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await subscribeAndSave();
      if (ok) {
        await report("granted", true);
        finishEnabled();
        return;
      }
      // enablePushSubscription returns null for BOTH a denial and a silent
      // failure, so re-read the live permission to tell them apart.
      const perm = getNotificationPermission();
      if (perm === "denied") {
        await report("denied", true);
        setMode("denied");
      } else {
        await report("default", true);
        toast({
          title: "لم يتم التفعيل بعد",
          description: "اضغط على \"تفعيل الإشعارات\" ثم اختر \"السماح\".",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  }, [subscribeAndSave, report, finishEnabled, toast]);

  // Denied recovery: the user fixed the browser setting, then taps re-check.
  const handleRecheck = useCallback(async () => {
    setBusy(true);
    try {
      const perm = getNotificationPermission();
      if (perm !== "granted") {
        toast({
          title: "الإشعارات لا تزال معطّلة",
          description: "فعّل الإشعارات لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة.",
          variant: "destructive",
        });
        return;
      }
      const ok = await subscribeAndSave();
      if (ok) {
        await report("granted", true);
        finishEnabled();
      } else {
        toast({
          title: "تعذّر إكمال التفعيل",
          description: "حاول مرة أخرى بعد قليل.",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  }, [subscribeAndSave, report, finishEnabled, toast]);

  const dismissDenied = useCallback(() => {
    safeSetItem(DENIED_DISMISS_KEY, "1");
    ackReminderIfNeeded();
    setMode("hidden");
  }, [ackReminderIfNeeded]);

  const dismissIos = useCallback(() => {
    safeSetItem(IOS_DISMISS_KEY, "1");
    ackReminderIfNeeded();
    setMode("hidden");
  }, [ackReminderIfNeeded]);

  const backdrop =
    "fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md";
  const panel =
    "relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_rgba(15,23,42,0.45)]";

  return (
    <AnimatePresence>
      {mode !== "hidden" && (
        <motion.div
          key="gate"
          dir="rtl"
          className={backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={panel}
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            {mode === "mandatory" && (
              <div className="flex flex-col items-center px-6 pb-7 pt-9 text-center">
                <span className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/30">
                  <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/40" />
                  <BellRing className="h-10 w-10 text-white" />
                </span>
                <h2 className="text-xl font-extrabold leading-snug text-slate-900">
                  لا تفوت الدروس الجديدة والإعلانات المهمة
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
                  فعّل الإشعارات لتصلك أحدث الدروس وإعلانات المنصة فور نشرها، مباشرة على جهازك.
                </p>
                <Button
                  onClick={handleEnable}
                  disabled={busy}
                  className="mt-7 h-14 w-full rounded-2xl bg-gradient-to-l from-amber-500 to-orange-500 text-base font-bold shadow-lg shadow-orange-500/25 hover:from-amber-600 hover:to-orange-600"
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "✅ تفعيل الإشعارات"
                  )}
                </Button>
                <p className="mt-3 text-xs text-slate-400">
                  ستظهر نافذة من المتصفح، اختر "السماح" لإتمام التفعيل.
                </p>
              </div>
            )}

            {mode === "denied" && (
              <div className="flex flex-col items-center px-6 pb-7 pt-9 text-center">
                <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-red-500 shadow-lg shadow-red-500/30">
                  <Settings className="h-10 w-10 text-white" />
                </span>
                <h2 className="text-xl font-extrabold leading-snug text-slate-900">
                  الإشعارات معطّلة في المتصفح
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
                  لتفعيلها مجدداً، افتح إعدادات الموقع في متصفحك واسمح بالإشعارات:
                </p>
                <ol className="mt-4 w-full space-y-2 rounded-2xl bg-slate-50 p-4 text-right text-sm text-slate-600">
                  <li>١. اضغط على رمز القفل 🔒 بجانب عنوان الموقع.</li>
                  <li>٢. ابحث عن "الإشعارات" (Notifications).</li>
                  <li>٣. غيّر الإعداد إلى "السماح" (Allow).</li>
                  <li>٤. ارجع إلى هنا واضغط الزر بالأسفل.</li>
                </ol>
                <Button
                  onClick={handleRecheck}
                  disabled={busy}
                  className="mt-6 h-14 w-full rounded-2xl text-base font-bold"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "لقد قمت بالتفعيل"}
                </Button>
                <button
                  type="button"
                  onClick={dismissDenied}
                  className="mt-3 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600"
                >
                  لاحقاً
                </button>
              </div>
            )}

            {mode === "ios" && (
              <div className="flex flex-col items-center px-6 pb-7 pt-9 text-center">
                <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500 shadow-lg shadow-blue-500/30">
                  <Smartphone className="h-10 w-10 text-white" />
                </span>
                <h2 className="text-xl font-extrabold leading-snug text-slate-900">
                  ثبّت التطبيق لتفعيل الإشعارات
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
                  على الآيفون، تصلك الإشعارات بعد إضافة المنصة إلى الشاشة الرئيسية:
                </p>
                <ol className="mt-4 w-full space-y-2 rounded-2xl bg-slate-50 p-4 text-right text-sm text-slate-600">
                  <li className="flex items-center justify-end gap-2">
                    <span>١. اضغط زر المشاركة</span>
                    <Share className="h-4 w-4 text-blue-500" />
                  </li>
                  <li>٢. اختر "إضافة إلى الشاشة الرئيسية".</li>
                  <li>٣. افتح المنصة من الأيقونة الجديدة.</li>
                  <li>٤. فعّل الإشعارات عند ظهور الطلب.</li>
                </ol>
                <button
                  type="button"
                  onClick={dismissIos}
                  className="mt-6 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700"
                >
                  فهمت، لاحقاً
                </button>
              </div>
            )}

            <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-orange-400/10 blur-2xl" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
