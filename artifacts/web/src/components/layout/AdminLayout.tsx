import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import {
  LayoutDashboard, Users, Video, FolderTree, CreditCard, LogOut,
  ShieldAlert, ListVideo, Activity, BadgeCheck, Banknote, KeyRound,
  Megaphone, Bell, BellOff, BellRing, X, Share, PlusSquare, Menu, AlertTriangle,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────────────────────────────── */

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

/* ─── push hook ───────────────────────────────────────────────────────── */

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

/* ─── nav items ───────────────────────────────────────────────────────── */

const NAV = [
  { name: "الإحصائيات",       path: "/gab-ctrl-9x",                   icon: LayoutDashboard },
  { name: "المستخدمين",        path: "/gab-ctrl-9x/users",             icon: Users },
  { name: "الفيديوهات",        path: "/gab-ctrl-9x/videos",            icon: Video },
  { name: "التصنيفات",         path: "/gab-ctrl-9x/categories",        icon: FolderTree },
  { name: "السلاسل",           path: "/gab-ctrl-9x/playlists",         icon: ListVideo },
  { name: "خطط الأسعار",       path: "/gab-ctrl-9x/plans",             icon: CreditCard },
  { name: "الاشتراكات",        path: "/gab-ctrl-9x/subscriptions",        icon: BadgeCheck },
  { name: "تنبيهات الاشتراك", path: "/gab-ctrl-9x/subscription-alerts", icon: AlertTriangle },
  { name: "إرسال إشعار",       path: "/gab-ctrl-9x/send-notification",   icon: Megaphone },
  { name: "Community GAB",     path: "/gab-ctrl-9x/community",         icon: Users },
  { name: "سجل النشاطات",      path: "/gab-ctrl-9x/activity-log",      icon: Activity },
  { name: "طلبات الدفع",       path: "/gab-ctrl-9x/payments",          icon: Banknote },
  { name: "تغيير كلمة المرور", path: "/gab-ctrl-9x/change-password",   icon: KeyRound },
];

/* ─── bell button (shared) ────────────────────────────────────────────── */

function BellButton({
  subscribed, loading, subscribe, unsubscribe, size = "md",
}: {
  subscribed: boolean | null;
  loading: boolean;
  subscribe: () => void;
  unsubscribe: () => void;
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "w-8 h-8" : "w-9 h-9";
  return (
    <button
      type="button"
      title={subscribed ? "إلغاء إشعارات التسجيل" : "تفعيل إشعارات التسجيل"}
      disabled={loading || subscribed === null}
      onClick={subscribed ? unsubscribe : subscribe}
      className={`${cls} rounded-xl flex items-center justify-center transition-colors shrink-0 ${
        subscribed
          ? "bg-green-500/20 text-green-400 hover:bg-red-500/20 hover:text-red-400"
          : "bg-white/5 text-muted-foreground hover:bg-primary/20 hover:text-primary"
      }`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : subscribed ? (
        <BellRing className="w-4 h-4" />
      ) : (
        <BellOff className="w-4 h-4" />
      )}
    </button>
  );
}

/* ─── layout ──────────────────────────────────────────────────────────── */

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

  /* iOS push only works once installed; on plain Safari show "install first" */
  const pushReady = pushSupported && (!iosDevice || standalone);

  const { subscribed, loading, subscribe, unsubscribe } = useAdminPush(
    admin ? adminToken : null,
  );

  /* close drawer on outside tap */
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

  /* close drawer on navigation */
  useEffect(() => { setDrawerOpen(false); }, [location]);

  /* lock body scroll when drawer open */
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const showIosBanner = !iosBannerDismissed && iosDevice && !standalone;

  const dismissIosBanner = () => {
    setIosBannerDismissed(true);
    try { localStorage.setItem("admin-ios-banner-dismissed", "1"); } catch { /* */ }
  };

  /* current page label for mobile header */
  const currentPageName =
    NAV.find((n) =>
      n.path === "/gab-ctrl-9x"
        ? location === n.path
        : location.startsWith(n.path),
    )?.name ?? "لوحة التحكم";

  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <ShieldAlert className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">غير مصرح لك بالدخول</h2>
          <Link href="/gab-ctrl-9x/login">
            <Button>تسجيل دخول الإدارة</Button>
          </Link>
        </div>
      </div>
    );
  }

  /* ── nav link (reused in sidebar + drawer) ── */
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
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-foreground/70 hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="font-medium">{item.name}</span>
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background rtl">

      {/* ══ MOBILE HEADER (hidden on md+) ══════════════════════════════ */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-card/95 backdrop-blur-xl border-b border-white/10 flex items-center gap-3 px-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:bg-white/5 hover:text-foreground transition-colors shrink-0"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
        </button>

        <span className="flex-1 font-bold text-base truncate">{currentPageName}</span>

        {/* Bell — only if push is ready on this device */}
        {pushReady && (
          <BellButton
            subscribed={subscribed}
            loading={loading}
            subscribe={subscribe}
            unsubscribe={unsubscribe}
            size="sm"
          />
        )}

        {/* iOS: show install icon if not standalone */}
        {iosDevice && !standalone && (
          <button
            onClick={dismissIosBanner}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/20 text-primary shrink-0"
            title="ثبّت التطبيق"
          >
            <PlusSquare className="w-4 h-4" />
          </button>
        )}
      </header>

      {/* ══ MOBILE DRAWER ═══════════════════════════════════════════════ */}
      {/* Overlay */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* Panel slides from right */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed top-0 right-0 bottom-0 z-50 w-72 bg-card flex flex-col shadow-2xl border-l border-white/10 transition-transform duration-300 ease-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold leading-tight">لوحة التحكم</p>
            <p className="text-xs text-muted-foreground truncate">{admin.username}</p>
          </div>

          {/* Bell in drawer header */}
          {pushReady && (
            <BellButton
              subscribed={subscribed}
              loading={loading}
              subscribe={subscribe}
              unsubscribe={unsubscribe}
              size="sm"
            />
          )}

          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Push hint: subscribe */}
        {pushReady && subscribed === false && (
          <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400 flex items-start gap-2">
            <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>اضغط على جرس الإشعارات ↑ لتلقّي تنبيه عند كل تسجيل جديد</span>
          </div>
        )}

        {/* iOS: push requires standalone */}
        {iosDevice && !standalone && (
          <div className="mx-4 mt-3 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-400 flex items-start gap-2">
            <Share className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              لتفعيل الإشعارات: ثبّت التطبيق أولاً —
              اضغط <Share className="inline w-3 h-3 mx-0.5" /> ثم <strong>"Add to Home Screen"</strong>
            </span>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLinks onNavigate={() => setDrawerOpen(false)} />
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-white/10">
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => { setDrawerOpen(false); adminLogout(); }}
          >
            <LogOut className="w-5 h-5 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </div>

      {/* ══ DESKTOP + MOBILE CONTENT AREA ══════════════════════════════ */}
      <div className="flex min-h-screen">

        {/* ── Desktop Sidebar (hidden on mobile) ── */}
        <aside className="hidden md:flex w-64 shrink-0 border-l border-white/10 bg-card/50 backdrop-blur-xl flex-col">
          <div className="p-6 border-b border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg leading-tight">لوحة التحكم</h1>
              <p className="text-xs text-muted-foreground">{admin.username}</p>
            </div>
            {pushReady && (
              <BellButton
                subscribed={subscribed}
                loading={loading}
                subscribe={subscribe}
                unsubscribe={unsubscribe}
              />
            )}
          </div>

          {/* Push subscription hints on desktop */}
          {pushReady && subscribed === false && (
            <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400 flex items-start gap-2">
              <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>اضغط على الجرس ↑ لتلقّي إشعار عند كل تسجيل جديد</span>
            </div>
          )}

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <NavLinks />
          </nav>

          <div className="p-4 border-t border-white/10">
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={adminLogout}
            >
              <LogOut className="w-5 h-5 ml-2" />
              تسجيل الخروج
            </Button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto bg-black/20 pt-14 md:pt-0 min-w-0">
          <div className="p-4 md:p-6 lg:p-10 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* ══ iOS "Add to Home Screen" banner (bottom, dismissible) ══════ */}
      {showIosBanner && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-white/10 p-4 shadow-2xl">
          <button
            className="absolute top-3 left-3 text-muted-foreground hover:text-foreground"
            onClick={dismissIosBanner}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-3 pr-1 pl-8">
            <div className="mt-0.5 w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <PlusSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm mb-1">ثبّت لوحة التحكم على شاشتك</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                اضغط على أيقونة المشاركة{" "}
                <Share className="inline w-3.5 h-3.5 mx-0.5 -mt-0.5" /> في Safari
                ثم <strong>"Add to Home Screen"</strong> — ستفتح بدون شريط Safari
                وتشتغل الإشعارات.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
