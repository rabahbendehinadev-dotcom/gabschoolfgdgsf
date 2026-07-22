import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import {
  LayoutDashboard, Users, Video, FolderTree, CreditCard, LogOut,
  ShieldAlert, Activity, BadgeCheck, Banknote, KeyRound, Wrench,
  Megaphone, Bell, BellOff, BellRing, X, Share, PlusSquare, Menu, AlertTriangle, GraduationCap,
} from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function useAdminPush(adminToken: string | null) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const authHeader = useCallback(
    (): Record<string, string> => (adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    [adminToken],
  );

  const checkStatus = useCallback(async () => {
    if (!adminToken || !("PushManager" in window)) return;
    try {
      const r = await fetch("/api/admin/push/status", { headers: authHeader() });
      if (r.ok) setSubscribed(((await r.json()) as { subscribed: boolean }).subscribed);
    } catch { /* ignore */ }
  }, [adminToken, authHeader]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const subscribe = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const keyRes = await fetch("/api/admin/push/vapid-key", { headers: authHeader() });
      if (!keyRes.ok) return;
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const saveRes = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }),
      });
      if (saveRes.ok) setSubscribed(true);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [adminToken, authHeader]);

  const unsubscribe = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/push/subscribe", {
          method: "DELETE",
          headers: { ...authHeader(), "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [adminToken, authHeader]);

  return { subscribed, loading, subscribe, unsubscribe };
}

const NAV = [
  { name: "الإحصائيات",       path: "/gab-ctrl-9x",                   icon: LayoutDashboard },
  { name: "المستخدمين",        path: "/gab-ctrl-9x/users",             icon: Users },
  { name: "الدورات",           path: "/gab-ctrl-9x/courses",           icon: GraduationCap },
  { name: "الفيديوهات",        path: "/gab-ctrl-9x/videos",            icon: Video },
  { name: "الأدوات",           path: "/gab-ctrl-9x/tools",             icon: Wrench },
  { name: "تصنيفات الأدوات",   path: "/gab-ctrl-9x/tool-categories",   icon: FolderTree },
  { name: "التصنيفات",         path: "/gab-ctrl-9x/categories",        icon: FolderTree },
  { name: "خطط الأسعار",       path: "/gab-ctrl-9x/plans",             icon: CreditCard },
  { name: "الاشتراكات",        path: "/gab-ctrl-9x/subscriptions",     icon: BadgeCheck },
  { name: "تنبيهات الاشتراك",  path: "/gab-ctrl-9x/subscription-alerts", icon: AlertTriangle },
  { name: "إرسال إشعار",       path: "/gab-ctrl-9x/send-notification", icon: Megaphone },
  { name: "Community GAB",     path: "/gab-ctrl-9x/community",         icon: Users },
  { name: "سجل النشاطات",      path: "/gab-ctrl-9x/activity-log",      icon: Activity },
  { name: "طلبات الدفع",       path: "/gab-ctrl-9x/payments",          icon: Banknote },
  { name: "تغيير كلمة المرور", path: "/gab-ctrl-9x/change-password",   icon: KeyRound },
];

function BellButton({
  subscribed, loading, subscribe, unsubscribe, size = "md",
}: {
  subscribed: boolean | null;
  loading: boolean;
  subscribe: () => void;
  unsubscribe: () => void;
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "w-8 h-8" : "w-8 h-8";
  return (
    <button
      type="button"
      title={subscribed ? "إلغاء إشعارات التسجيل" : "تفعيل إشعارات التسجيل"}
      disabled={loading || subscribed === null}
      onClick={subscribed ? unsubscribe : subscribe}
      className={`${cls} rounded-lg flex items-center justify-center transition-colors shrink-0 ${
        subscribed
          ? "bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500"
          : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      }`}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : subscribed ? (
        <BellRing className="w-4 h-4" />
      ) : (
        <BellOff className="w-4 h-4" />
      )}
    </button>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, adminLogout } = useAuth();
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [iosBannerDismissed, setIosBannerDismissed] = useState(() => {
    try { return localStorage.getItem("admin-ios-banner-dismissed") === "1"; } catch { return false; }
  });

  const adminToken =
    typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;

  const pushSupported =
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "serviceWorker" in navigator;

  const iosDevice = typeof window !== "undefined" && isIosSafari();
  const standalone = typeof window !== "undefined" && isStandalone();
  const pushReady = pushSupported && (!iosDevice || standalone);

  const { subscribed, loading, subscribe, unsubscribe } = useAdminPush(
    admin ? adminToken : null,
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [drawerOpen]);

  useEffect(() => { setDrawerOpen(false); }, [location]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const showIosBanner = !iosBannerDismissed && iosDevice && !standalone;

  const dismissIosBanner = () => {
    setIosBannerDismissed(true);
    try { localStorage.setItem("admin-ios-banner-dismissed", "1"); } catch { /* */ }
  };

  const currentPageName =
    NAV.find((n) =>
      n.path === "/gab-ctrl-9x"
        ? location === n.path
        : location.startsWith(n.path),
    )?.name ?? "لوحة التحكم";

  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">غير مصرح لك بالدخول</h2>
          <Link href="/gab-ctrl-9x/login">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">تسجيل دخول الإدارة</Button>
          </Link>
        </div>
      </div>
    );
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {NAV.map((item) => {
        const isActive =
          item.path === "/gab-ctrl-9x"
            ? location === item.path
            : location.startsWith(item.path);
        const Icon = item.icon;
        return (
          <Link key={item.path} href={item.path}>
            <div
              onClick={onNavigate}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
                isActive
                  ? "bg-orange-50 text-orange-600 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {isActive && (
                <span className="absolute right-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-orange-500" />
              )}
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-orange-500" : "text-gray-400"}`} />
              <span>{item.name}</span>
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 rtl">

      {/* ══ MOBILE HEADER ══════════════════════════════════════════════ */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="flex-1 font-semibold text-sm text-gray-900 truncate">{currentPageName}</span>
        {pushReady && (
          <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} size="sm" />
        )}
        {iosDevice && !standalone && (
          <button
            onClick={dismissIosBanner}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50 text-orange-500 shrink-0"
          >
            <PlusSquare className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* ══ MOBILE DRAWER OVERLAY ═══════════════════════════════════════ */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* ══ MOBILE DRAWER PANEL ════════════════════════════════════════ */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed top-0 right-0 bottom-0 z-50 w-64 bg-white flex flex-col shadow-xl border-l border-gray-200 transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">لوحة التحكم</p>
            <p className="text-xs text-gray-400 truncate">{admin.username}</p>
          </div>
          {pushReady && (
            <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} size="sm" />
          )}
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {pushReady && subscribed === false && (
          <div className="mx-3 mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
            <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>اضغط على الجرس لتلقّي تنبيه عند كل تسجيل جديد</span>
          </div>
        )}

        {iosDevice && !standalone && (
          <div className="mx-3 mt-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 flex items-start gap-2">
            <Share className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>ثبّت التطبيق أولاً لتفعيل الإشعارات</span>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavLinks onNavigate={() => setDrawerOpen(false)} />
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => { setDrawerOpen(false); adminLogout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* ══ DESKTOP LAYOUT ═════════════════════════════════════════════ */}
      <div className="flex min-h-screen">

        {/* ── Desktop Sidebar ── */}
        <aside className="hidden md:flex w-56 shrink-0 border-l border-gray-200 bg-white flex-col">
          {/* Brand */}
          <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-gray-900 text-sm leading-tight">GAB School</h1>
              <p className="text-xs text-gray-400 mt-0.5">{admin.username}</p>
            </div>
            {pushReady && (
              <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />
            )}
          </div>

          {pushReady && subscribed === false && (
            <div className="mx-3 mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
              <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>اضغط على الجرس لتلقّي إشعار عند كل تسجيل جديد</span>
            </div>
          )}

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            <NavLinks />
          </nav>

          <div className="p-3 border-t border-gray-100">
            <button
              type="button"
              onClick={adminLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto bg-gray-50 pt-14 md:pt-0 min-w-0">
          <div className="p-4 md:p-6 lg:p-8 max-w-screen-xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* ══ iOS Banner ════════════════════════════════════════════════ */}
      {showIosBanner && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 p-4 shadow-lg">
          <button
            className="absolute top-3 left-3 text-gray-400 hover:text-gray-600"
            onClick={dismissIosBanner}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 pr-1 pl-8">
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
              <PlusSquare className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 mb-1">ثبّت لوحة التحكم على شاشتك</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                اضغط <Share className="inline w-3 h-3 mx-0.5" /> ثم <strong>"Add to Home Screen"</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
