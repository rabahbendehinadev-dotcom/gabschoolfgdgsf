import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, X, Loader2 } from "lucide-react";
import {
  getVapidPublicKey,
  useSavePushSubscription,
} from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { isPushSupported, getNotificationPermission, enablePushSubscription } from "@/lib/push";

const DISMISS_KEY = "gab-push-optin-dismissed";

/**
 * Professional, opt-in push prompt shown AFTER login. It only appears when:
 *  - a user is signed in,
 *  - the browser supports Web Push,
 *  - permission has not yet been decided (still "default"),
 *  - the user has not dismissed it before, and
 *  - the server actually has VAPID configured (publicKey present).
 * Otherwise it renders nothing, so unsupported environments (dev iframe, iOS
 * web) silently fall back to in-app notifications only.
 */
export function PushOptInCard() {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const savePush = useSavePushSubscription({ request: getAuthHeaders() });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setVisible(false);
      return;
    }
    if (!isPushSupported()) return;
    if (getNotificationPermission() !== "default") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    (async () => {
      try {
        const { publicKey } = await getVapidPublicKey();
        if (!cancelled && publicKey) setVisible(true);
      } catch {
        /* push not configured on the server — stay hidden */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const { publicKey } = await getVapidPublicKey();
      if (!publicKey) {
        dismiss();
        return;
      }
      const sub = await enablePushSubscription(publicKey);
      if (!sub) {
        toast({
          title: "لم يتم التفعيل",
          description: "تعذّر تفعيل الإشعارات. يمكنك تفعيلها لاحقاً من إعدادات المتصفح.",
          variant: "destructive",
        });
        setVisible(false);
        return;
      }
      await savePush.mutateAsync({ data: sub });
      localStorage.setItem(DISMISS_KEY, "1");
      setVisible(false);
      toast({
        title: "تم تفعيل الإشعارات ✅",
        description: "ستصلك الآن أحدث الدروس وتنبيهات المجتمع أولاً بأول.",
      });
    } catch {
      toast({
        title: "حدث خطأ",
        description: "تعذّر تفعيل الإشعارات الآن، حاول مرة أخرى لاحقاً.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          dir="rtl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed inset-x-3 z-[60] mx-auto max-w-md rounded-3xl border border-primary/20 bg-white/95 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl bottom-[calc(82px+env(safe-area-inset-bottom))] lg:bottom-6"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="إغلاق"
            className="absolute left-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 pl-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100">
              <BellRing className="h-6 w-6 text-orange-500" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-bold leading-snug text-foreground">
                فعّل الإشعارات
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                فعّل الإشعارات لتصلك الدروس الجديدة وتنبيهات المجتمع.
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <Button onClick={enable} disabled={busy} className="flex-1 gap-2 rounded-xl">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              تفعيل
            </Button>
            <Button
              variant="ghost"
              onClick={dismiss}
              disabled={busy}
              className="rounded-xl text-muted-foreground"
            >
              لاحقاً
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
