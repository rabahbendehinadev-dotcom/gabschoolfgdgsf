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
  { name: "الإحصائيات",       path: "/gab-ctrl-9x",                    icon: LayoutDashboard },
  { name: "المستخدمين",        path: "/gab-ctrl-9x/users",              icon: Users },
  { name: "الدورات",           path: "/gab-ctrl-9x/courses",            icon: GraduationCap },
  { name: "الفيديوهات",        path: "/gab-ctrl-9x/videos",             icon: Video },
  { name: "الأدوات",           path: "/gab-ctrl-9x/tools",              icon: Wrench },
  { name: "تصنيفات الأدوات",   path: "/gab-ctrl-9x/tool-categories",    icon: FolderTree },
  { name: "التصنيفات",         path: "/gab-ctrl-9x/categories",         icon: FolderTree },
  { name: "خطط الأسعار",       path: "/gab-ctrl-9x/plans",              icon: CreditCard },
  { name: "الاشتراكات",        path: "/gab-ctrl-9x/subscriptions",      icon: BadgeCheck },
  { name: "تنبيهات الاشتراك",  path: "/gab-ctrl-9x/subscription-alerts",icon: AlertTriangle },
  { name: "إرسال إشعار",       path: "/gab-ctrl-9x/send-notification",  icon: Megaphone },
  { name: "Community GAB",     path: "/gab-ctrl-9x/community",          icon: Users },
  { name: "سجل النشاطات",      path: "/gab-ctrl-9x/activity-log",       icon: Activity },
  { name: "طلبات الدفع",       path: "/gab-ctrl-9x/payments",           icon: Banknote },
  { name: "تغيير كلمة المرور", path: "/gab-ctrl-9x/change-password",    icon: KeyRound },
];

function BellButton({ subscribed, loading, subscribe, unsubscribe }: {
  subscribed: boolean | null; loading: boolean;
  subscribe: () => void; unsubscribe: () => void;
}) {
  return (
    <button
      type="button"
      title={subscribed ? "إلغاء الإشعارات" : "تفعيل الإشعارات"}
      disabled={loading || subscribed === null}
      onClick={subscribed ? unsubscribe : subscribe}
      style={{
        width: 30, height: 30,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8, transition: "all 130ms",
        background: subscribed ? "#F0FDF4" : "transparent",
        color: subscribed ? "#166534" : "#9CA3AF",
        border: subscribed ? "1px solid #86EFAC" : "1px solid transparent",
      }}
    >
      {loading
        ? <span style={{ width: 13, height: 13, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
        : subscribed ? <BellRing size={14} /> : <BellOff size={14} />}
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

  const adminToken = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  const pushSupported = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;
  const iosDevice = typeof window !== "undefined" && isIosSafari();
  const standalone = typeof window !== "undefined" && isStandalone();
  const pushReady = pushSupported && (!iosDevice || standalone);
  const { subscribed, loading, subscribe, unsubscribe } = useAdminPush(admin ? adminToken : null);

  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setDrawerOpen(false);
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

  const currentPageName = NAV.find(n =>
    n.path === "/gab-ctrl-9x" ? location === n.path : location.startsWith(n.path)
  )?.name ?? "لوحة التحكم";

  if (!admin) {
    return (
      <div className="min-h-screen ad-shell flex items-center justify-center">
        <div className="text-center space-y-4">
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "#FFF1F2", border: "1px solid #FECDD3", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <ShieldAlert size={28} color="#DC2626" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>غير مصرح لك بالدخول</h2>
          <Link href="/gab-ctrl-9x/login">
            <Button className="ad-btn-primary">تسجيل دخول الإدارة</Button>
          </Link>
        </div>
      </div>
    );
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {NAV.map((item) => {
        const isActive = item.path === "/gab-ctrl-9x" ? location === item.path : location.startsWith(item.path);
        const Icon = item.icon;
        return (
          <Link key={item.path} href={item.path}>
            <div onClick={onNavigate} className={`ad-nav-item${isActive ? " is-active" : ""}`}>
              <Icon size={15} className="ad-nav-icon" />
              <span>{item.name}</span>
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen ad-shell rtl">

      {/* ── Mobile header ────────────────────────────────────── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 40, height: 52,
        background: "#ffffff", borderBottom: "1px solid #DDE1EA",
        display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
      }} className="md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F3F4F6")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Menu size={18} />
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#0F172A" }}>{currentPageName}</span>
        {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
        {iosDevice && !standalone && (
          <button onClick={dismissIosBanner} style={{ width: 30, height: 30, borderRadius: 8, background: "#FFF4EC", color: "#F97316", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <PlusSquare size={14} />
          </button>
        )}
      </header>

      {/* ── Mobile drawer overlay ─────────────────────────────── */}
      <div
        className="md:hidden"
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", transition: "opacity 200ms", opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? "auto" : "none" }}
        aria-hidden="true"
      />
      {/* ── Mobile drawer panel ───────────────────────────────── */}
      <div
        ref={drawerRef}
        className="md:hidden"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 51, width: 252,
          background: "#ffffff", borderLeft: "1.5px solid #DDE1EA",
          boxShadow: "-4px 0 24px rgba(15,23,42,0.10)",
          display: "flex", flexDirection: "column",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #F0F2F6", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>GAB School</p>
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{admin.username}</p>
          </div>
          {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
          <button onClick={() => setDrawerOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", border: "none", background: "transparent", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        {pushReady && subscribed === false && (
          <div style={{ margin: "10px 12px 0", padding: "8px 12px", borderRadius: 8, background: "#FFFBEB", border: "1px solid #FDE68A", display: "flex", gap: 7, fontSize: 11, color: "#92400E" }}>
            <Bell size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>اضغط على الجرس لتلقّي إشعار عند كل تسجيل جديد</span>
          </div>
        )}
        {iosDevice && !standalone && (
          <div style={{ margin: "10px 12px 0", padding: "8px 12px", borderRadius: 8, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", gap: 7, fontSize: 11, color: "#1E40AF" }}>
            <Share size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>ثبّت التطبيق أولاً لتفعيل الإشعارات</span>
          </div>
        )}

        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          <NavLinks onNavigate={() => setDrawerOpen(false)} />
        </nav>
        <div style={{ padding: "10px 10px", borderTop: "1px solid #F0F2F6" }}>
          <button type="button" onClick={() => { setDrawerOpen(false); adminLogout(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, fontSize: 13, color: "#DC2626", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#FFF1F2")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <LogOut size={14} />تسجيل الخروج
          </button>
        </div>
      </div>

      {/* ── Desktop layout ────────────────────────────────────── */}
      <div style={{ display: "flex", minHeight: "100vh" }}>

        {/* Sidebar */}
        <aside className="hidden md:flex ad-sidebar" style={{ width: 220, flexShrink: 0, flexDirection: "column" }}>
          {/* Brand */}
          <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid #F0F2F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontWeight: 700, fontSize: 13.5, color: "#0F172A", lineHeight: 1.2 }}>GAB School</h1>
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{admin.username}</p>
            </div>
            {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
          </div>

          {pushReady && subscribed === false && (
            <div style={{ margin: "10px 12px 0", padding: "8px 11px", borderRadius: 8, background: "#FFFBEB", border: "1px solid #FDE68A", display: "flex", gap: 6, fontSize: 11, color: "#92400E" }}>
              <Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>اضغط على الجرس لتلقّي إشعار عند كل تسجيل جديد</span>
            </div>
          )}

          <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            <NavLinks />
          </nav>

          <div style={{ padding: "10px 10px", borderTop: "1px solid #F0F2F6" }}>
            <button type="button" onClick={adminLogout}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, fontSize: 13, color: "#DC2626", background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#FFF1F2")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <LogOut size={14} />تسجيل الخروج
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto" style={{ paddingTop: 0, background: "transparent" }}>
          <div className="pt-14 md:pt-0" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px 16px" }}>
            <div className="p-4 md:p-6 lg:p-8">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* ── iOS Banner ─────────────────────────────────────────── */}
      {showIosBanner && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#ffffff", borderTop: "1px solid #E4E7ED", padding: 16, boxShadow: "0 -4px 20px rgba(15,23,42,0.08)" }}>
          <button onClick={dismissIosBanner} style={{ position: "absolute", top: 12, left: 12, color: "#9CA3AF", background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={15} />
          </button>
          <div style={{ display: "flex", gap: 12, paddingLeft: 28 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#FFF4EC", border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PlusSquare size={16} color="#F97316" />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", marginBottom: 3 }}>ثبّت لوحة التحكم على شاشتك</p>
              <p style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5 }}>
                اضغط <Share size={11} style={{ display: "inline", verticalAlign: "middle" }} /> ثم <strong>"Add to Home Screen"</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
