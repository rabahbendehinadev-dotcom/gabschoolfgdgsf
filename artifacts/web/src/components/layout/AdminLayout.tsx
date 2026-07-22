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
  { name: "Tableau de bord",       path: "/gab-ctrl-9x",                     icon: LayoutDashboard },
  { name: "Utilisateurs",          path: "/gab-ctrl-9x/users",               icon: Users },
  { name: "Cours",                 path: "/gab-ctrl-9x/courses",             icon: GraduationCap },
  { name: "Vidéos",                path: "/gab-ctrl-9x/videos",              icon: Video },
  { name: "Outils",                path: "/gab-ctrl-9x/tools",               icon: Wrench },
  { name: "Catégories d'outils",   path: "/gab-ctrl-9x/tool-categories",     icon: FolderTree },
  { name: "Catégories",            path: "/gab-ctrl-9x/categories",          icon: FolderTree },
  { name: "Plans tarifaires",      path: "/gab-ctrl-9x/plans",               icon: CreditCard },
  { name: "Abonnements",           path: "/gab-ctrl-9x/subscriptions",       icon: BadgeCheck },
  { name: "Alertes d'abonnement",  path: "/gab-ctrl-9x/subscription-alerts", icon: AlertTriangle },
  { name: "Notifications",         path: "/gab-ctrl-9x/send-notification",   icon: Megaphone },
  { name: "Communauté GAB",        path: "/gab-ctrl-9x/community",           icon: Users },
  { name: "Journal d'activité",    path: "/gab-ctrl-9x/activity-log",        icon: Activity },
  { name: "Paiements",             path: "/gab-ctrl-9x/payments",            icon: Banknote },
  { name: "Mot de passe",          path: "/gab-ctrl-9x/change-password",     icon: KeyRound },
];

/* ── Bell button (light variant) ─────────────────────────────────────────── */
function BellButton({
  subscribed, loading, subscribe, unsubscribe,
}: {
  subscribed: boolean | null; loading: boolean;
  subscribe: () => void; unsubscribe: () => void;
}) {
  const [hov, setHov] = useState(false);
  const bg = subscribed
    ? (hov ? "#FDF1F1" : "#EFFAF3")
    : (hov ? "#F4F6FA" : "transparent");
  const col = subscribed
    ? (hov ? "#B42318" : "#157347")
    : "#98A2B3";

  return (
    <button
      type="button"
      title={subscribed ? "Désactiver les notifications" : "Activer les notifications"}
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
   ADMIN LAYOUT — Light ERP · French · LTR
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
  )?.name ?? "Administration";

  /* ── Unauthorized ──────────────────────────────────────────────────── */
  if (!admin) {
    return (
      <div className="ad-shell" dir="ltr" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#FDF1F1", border: "1px solid #F2CBCB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ShieldAlert size={30} color="#B42318" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1F2937", marginBottom: 16 }}>Accès non autorisé</h2>
          <Link href="/gab-ctrl-9x/login">
            <button className="ad-btn-primary">Connexion administrateur</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ad-shell" dir="ltr" style={{ display: "flex" }}>

      {/* ══════════════════════════════════════════════════════════
          MOBILE HEADER — light
      ══════════════════════════════════════════════════════════ */}
      <header
        className="md:hidden"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 40, height: 52,
          background: "#FFFFFF", borderBottom: "1px solid #E5EAF2",
          display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
        }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#667085", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F4F6FA")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Menu size={18} />
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: "#1F2937" }}>{currentPageName}</span>
        {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
        {iosDevice && !standalone && (
          <button onClick={dismissIosBanner}
            style={{ width: 30, height: 30, borderRadius: 8, background: "#FFF4EC", color: "#C2570E", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
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
          position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.40)",
          transition: "opacity 200ms", opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? "auto" : "none",
        }}
        aria-hidden="true"
      />

      {/* ══════════════════════════════════════════════════════════
          MOBILE DRAWER — light sidebar (slides from left)
      ══════════════════════════════════════════════════════════ */}
      <div
        ref={drawerRef}
        className="md:hidden"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 51, width: 256,
          background: "#FFFFFF", borderRight: "1px solid #E5EAF2",
          boxShadow: "8px 0 32px rgba(15,23,42,0.12)",
          display: "flex", flexDirection: "column",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        {/* Drawer header */}
        <div style={{ padding: "14px 14px", borderBottom: "1px solid #EEF2F7", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 13.5, color: "#1E293B" }}>GAB School</p>
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{admin.username}</p>
          </div>
          {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
          <button onClick={() => setDrawerOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "#98A2B3", border: "none", background: "transparent", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F4F6FA")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <X size={15} />
          </button>
        </div>

        {pushReady && subscribed === false && (
          <div className="ad-push-hint"><Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>Activez la cloche pour recevoir une alerte à chaque inscription</span></div>
        )}
        {iosDevice && !standalone && (
          <div className="ad-ios-hint"><Share size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>Installez d'abord l'application pour activer les notifications</span></div>
        )}

        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          <NavLinks location={location} onNavigate={() => setDrawerOpen(false)} />
        </nav>

        <div style={{ padding: "8px 8px 14px", borderTop: "1px solid #EEF2F7" }}>
          <button className="ad-sidebar-logout" onClick={() => { setDrawerOpen(false); adminLogout(); }}>
            <LogOut size={14} className="ad-nav-icon" />Se déconnecter
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DESKTOP SIDEBAR — light
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
          <div className="ad-push-hint"><Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>Activez la cloche pour recevoir une alerte à chaque inscription</span></div>
        )}

        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          <NavLinks location={location} />
        </nav>

        <div style={{ padding: "8px 8px 16px", borderTop: "1px solid #EEF2F7" }}>
          <button className="ad-sidebar-logout" onClick={adminLogout}>
            <LogOut size={14} className="ad-nav-icon" />Se déconnecter
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
          iOS BANNER — light
      ══════════════════════════════════════════════════════════ */}
      {showIosBanner && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#FFFFFF", borderTop: "1px solid #E5EAF2", padding: 16, boxShadow: "0 -8px 32px rgba(15,23,42,0.10)" }}>
          <button onClick={dismissIosBanner} style={{ position: "absolute", top: 12, right: 12, color: "#98A2B3", background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={15} />
          </button>
          <div style={{ display: "flex", gap: 12, paddingRight: 28 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#FFF4EC", border: "1px solid #F5CBA8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PlusSquare size={16} color="#F97316" />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#1F2937", marginBottom: 3 }}>Installer le panneau d'administration</p>
              <p style={{ fontSize: 11.5, color: "#667085", lineHeight: 1.5 }}>
                Appuyez sur <Share size={11} style={{ display: "inline", verticalAlign: "middle" }} /> puis <strong style={{ color: "#344054" }}>« Sur l'écran d'accueil »</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
