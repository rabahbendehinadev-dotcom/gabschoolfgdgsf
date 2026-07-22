import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
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
    } catch { /* ignore */ } finally { setLoading(false); }
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
    } catch { /* ignore */ } finally { setLoading(false); }
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

/* ── Bell button (dark-sidebar variant) ─────────────────────────────────── */
function BellButton({
  subscribed, loading, subscribe, unsubscribe,
}: {
  subscribed: boolean | null; loading: boolean;
  subscribe: () => void; unsubscribe: () => void;
}) {
  const [hov, setHov] = useState(false);
  const bg = subscribed
    ? (hov ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.15)")
    : (hov ? "rgba(255,255,255,0.08)" : "transparent");
  const col = subscribed
    ? (hov ? "#F87171" : "#4ADE80")
    : "#5B6478";

  return (
    <button
      type="button"
      title={subscribed ? "إلغاء الإشعارات" : "تفعيل الإشعارات"}
      disabled={loading || subscribed === null}
      onClick={subscribed ? unsubscribe : subscribe}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: bg, color: col, transition: "all 120ms",
      }}
    >
      {loading
        ? <span style={{ width: 12, height: 12, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
        : subscribed ? <BellRing size={14} /> : <BellOff size={14} />}
    </button>
  );
}

/* ── NavLinks component ──────────────────────────────────────────────────── */
function NavLinks({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => {
        const isActive = item.path === "/gab-ctrl-9x"
          ? location === item.path
          : location.startsWith(item.path);
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
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN LAYOUT
═══════════════════════════════════════════════════════════════════════════ */
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
    const h = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setDrawerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
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

  /* ── Unauthorized ──────────────────────────────────────────────────── */
  if (!admin) {
    return (
      <div className="ad-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#FEF2F2", border: "1px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ShieldAlert size={30} color="#DC2626" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>غير مصرح لك بالدخول</h2>
          <Link href="/gab-ctrl-9x/login">
            <button className="ad-btn-primary">تسجيل دخول الإدارة</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ad-shell rtl" style={{ display: "flex" }}>

      {/* ══════════════════════════════════════════════════════════
          MOBILE HEADER
      ══════════════════════════════════════════════════════════ */}
      <header
        className="md:hidden"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 40, height: 52,
          background: "#17191E", borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
        }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#5B6478", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Menu size={18} />
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: "#F1F5F9" }}>{currentPageName}</span>
        {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
        {iosDevice && !standalone && (
          <button onClick={dismissIosBanner}
            style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(249,115,22,0.15)", color: "#FB923C", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <PlusSquare size={14} />
          </button>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════
          MOBILE DRAWER OVERLAY
      ══════════════════════════════════════════════════════════ */}
      <div
        className="md:hidden"
        style={{
          position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.60)",
          transition: "opacity 200ms", opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? "auto" : "none",
        }}
        aria-hidden="true"
      />

      {/* ══════════════════════════════════════════════════════════
          MOBILE DRAWER — dark sidebar
      ══════════════════════════════════════════════════════════ */}
      <div
        ref={drawerRef}
        className="md:hidden"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 51, width: 256,
          background: "#17191E", borderLeft: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        {/* Drawer header */}
        <div style={{ padding: "14px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 13.5, color: "#F1F5F9" }}>GAB School</p>
            <p style={{ fontSize: 11, color: "#5B6478", marginTop: 1 }}>{admin.username}</p>
          </div>
          {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
          <button onClick={() => setDrawerOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "#4B5563", border: "none", background: "transparent", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <X size={15} />
          </button>
        </div>

        {pushReady && subscribed === false && (
          <div className="ad-push-hint"><Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>اضغط على الجرس لتلقّي إشعار عند كل تسجيل جديد</span></div>
        )}
        {iosDevice && !standalone && (
          <div className="ad-ios-hint"><Share size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>ثبّت التطبيق أولاً لتفعيل الإشعارات</span></div>
        )}

        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          <NavLinks location={location} onNavigate={() => setDrawerOpen(false)} />
        </nav>

        <div style={{ padding: "8px 8px 14px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button className="ad-sidebar-logout" onClick={() => { setDrawerOpen(false); adminLogout(); }}>
            <LogOut size={14} className="ad-nav-icon" />تسجيل الخروج
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DESKTOP SIDEBAR — dark navy
      ══════════════════════════════════════════════════════════ */}
      <aside className="ad-sidebar hidden md:flex">
        <div className="ad-sidebar-brand">
          <div>
            <h1>GAB School</h1>
            <p>{admin.username}</p>
          </div>
          {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
        </div>

        {pushReady && subscribed === false && (
          <div className="ad-push-hint"><Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>اضغط على الجرس لتلقّي إشعار عند كل تسجيل</span></div>
        )}

        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          <NavLinks location={location} />
        </nav>

        <div style={{ padding: "8px 8px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button className="ad-sidebar-logout" onClick={adminLogout}>
            <LogOut size={14} className="ad-nav-icon" />تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════ */}
      <main
        className="flex-1 min-w-0 overflow-y-auto"
        style={{ paddingTop: 52, minHeight: "100vh" }}
      >
        <div className="md:pt-0" style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 24px 40px" }}>
          {children}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          iOS BANNER
      ══════════════════════════════════════════════════════════ */}
      {showIosBanner && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#17191E", borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16, boxShadow: "0 -8px 32px rgba(0,0,0,0.4)" }}>
          <button onClick={dismissIosBanner} style={{ position: "absolute", top: 12, left: 12, color: "#4B5563", background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={15} />
          </button>
          <div style={{ display: "flex", gap: 12, paddingLeft: 28 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PlusSquare size={16} color="#F97316" />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#F1F5F9", marginBottom: 3 }}>ثبّت لوحة التحكم</p>
              <p style={{ fontSize: 11.5, color: "#5B6478", lineHeight: 1.5 }}>
                اضغط <Share size={11} style={{ display: "inline", verticalAlign: "middle" }} /> ثم <strong style={{ color: "#94A3B8" }}>"Add to Home Screen"</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
