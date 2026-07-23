import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Users, Video, FolderTree, CreditCard, LogOut,
  ShieldAlert, Activity, BadgeCheck, Banknote, KeyRound, Wrench,
  Megaphone, Bell, BellOff, BellRing, X, Share, PlusSquare, Menu,
  AlertTriangle, GraduationCap, MessageSquare, UserCog, ClipboardList,
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

/* ── Nav structure with sections (Odoo-style) ───────────────────────────── */
const NAV_SECTIONS = [
  {
    section: "Gestion",
    items: [
      { name: "Tableau de bord",      path: "/gab-ctrl-9x",                     icon: LayoutDashboard },
      { name: "Utilisateurs",         path: "/gab-ctrl-9x/users",               icon: Users },
      { name: "Abonnements",          path: "/gab-ctrl-9x/subscriptions",       icon: BadgeCheck },
      { name: "Paiements",            path: "/gab-ctrl-9x/payments",            icon: Banknote },
    ],
  },
  {
    section: "Contenu",
    items: [
      { name: "Cours",                path: "/gab-ctrl-9x/courses",             icon: GraduationCap },
      { name: "Vidéos",               path: "/gab-ctrl-9x/videos",              icon: Video },
      { name: "Catégories",           path: "/gab-ctrl-9x/categories",          icon: FolderTree },
      { name: "Outils",               path: "/gab-ctrl-9x/tools",               icon: Wrench },
      { name: "Cat. d'outils",        path: "/gab-ctrl-9x/tool-categories",     icon: FolderTree },
      { name: "Communauté",           path: "/gab-ctrl-9x/community",           icon: MessageSquare },
    ],
  },
  {
    section: "Configuration",
    items: [
      { name: "Plans tarifaires",     path: "/gab-ctrl-9x/plans",               icon: CreditCard },
      { name: "Alertes abonnement",   path: "/gab-ctrl-9x/subscription-alerts", icon: AlertTriangle },
      { name: "Notifications",        path: "/gab-ctrl-9x/send-notification",   icon: Megaphone },
      { name: "Journal d'activité",   path: "/gab-ctrl-9x/activity-log",        icon: Activity },
      { name: "Mot de passe",         path: "/gab-ctrl-9x/change-password",     icon: KeyRound },
    ],
  },
  {
    section: "Administration",
    items: [
      { name: "Comptes admins",       path: "/gab-ctrl-9x/admins",              icon: UserCog },
      { name: "Journal d'audit admin",path: "/gab-ctrl-9x/admin-audit",         icon: ClipboardList },
    ],
  },
];

/* flat list for breadcrumb lookup */
const NAV_FLAT = NAV_SECTIONS.flatMap(s => s.items);

/* ── Bell button ─────────────────────────────────────────────────────────── */
function BellButton({
  subscribed, loading, subscribe, unsubscribe,
}: {
  subscribed: boolean | null; loading: boolean;
  subscribe: () => void; unsubscribe: () => void;
}) {
  const [hov, setHov] = useState(false);
  const bg  = subscribed ? (hov ? "#FEE2E2" : "#F0FDF4") : (hov ? "#E2E8F0" : "transparent");
  const col = subscribed ? (hov ? "#9F1239" : "#15803D") : "#94A3B8";

  return (
    <button
      type="button"
      title={subscribed ? "Désactiver les notifications" : "Activer les notifications"}
      disabled={loading || subscribed === null}
      onClick={subscribed ? unsubscribe : subscribe}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30, height: 30, borderRadius: 7,
        border: "1px solid " + (subscribed ? (hov ? "#FECDD3" : "#BBF7D0") : "#E2E8F0"),
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        background: bg, color: col, transition: "all 120ms", flexShrink: 0,
      }}
    >
      {loading
        ? <span style={{ width: 11, height: 11, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
        : subscribed ? <BellRing size={13} /> : <BellOff size={13} />}
    </button>
  );
}

/* ── Sidebar nav with grouped sections ──────────────────────────────────── */
function NavLinks({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_SECTIONS.map((group) => (
        <div key={group.section}>
          <div className="ad-nav-section">{group.section}</div>
          {group.items.map((item) => {
            const isActive = item.path === "/gab-ctrl-9x"
              ? location === item.path
              : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div onClick={onNavigate} className={`ad-nav-item${isActive ? " is-active" : ""}`}>
                  <Icon size={14} className="ad-nav-icon" />
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/* ── Brand logo block ────────────────────────────────────────────────────── */
const SIDEBAR_ROLE_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:          { label: "Super Admin",     color: "#7C3AED", bg: "#EDE9FE" },
  subscription_manager: { label: "Sub. Manager",    color: "#0369A1", bg: "#E0F2FE" },
  support:              { label: "Support",         color: "#065F46", bg: "#D1FAE5" },
};

function SidebarBrand({ username, role, pushReady, subscribed, loading, subscribe, unsubscribe }: {
  username: string;
  role?: string | null;
  pushReady: boolean;
  subscribed: boolean | null;
  loading: boolean;
  subscribe: () => void;
  unsubscribe: () => void;
}) {
  const rs = role ? (SIDEBAR_ROLE_STYLES[role] ?? { label: role, color: "#64748B", bg: "#F1F5F9" }) : null;
  return (
    <div className="ad-sidebar-brand">
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em",
          flexShrink: 0, boxShadow: "0 1px 4px rgba(37,99,235,0.35)",
        }}>G</div>
        <div>
          <h1>GAB School</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <p style={{ margin: 0 }}>{username}</p>
            {rs && (
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: rs.bg, color: rs.color, letterSpacing: "0.02em", lineHeight: 1.4 }}>
                {rs.label}
              </span>
            )}
          </div>
        </div>
      </div>
      {pushReady && (
        <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN LAYOUT — Premium ERP · LTR · French
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

  const currentPageName = NAV_FLAT.find(n =>
    n.path === "/gab-ctrl-9x" ? location === n.path : location.startsWith(n.path)
  )?.name ?? "Administration";

  /* ── Unauthorized ──────────────────────────────────────────────────── */
  if (!admin) {
    return (
      <div className="ad-shell" dir="ltr" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#FFF1F2", border: "1px solid #FECDD3", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ShieldAlert size={26} color="#9F1239" />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>Accès non autorisé</h2>
          <p style={{ fontSize: 12.5, color: "#64748B", marginBottom: 18 }}>Veuillez vous connecter pour accéder au panneau.</p>
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
          MOBILE HEADER
      ══════════════════════════════════════════════════════════ */}
      <header
        className="md:hidden"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 40, height: 52,
          background: "#FFFFFF", borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
          boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
        }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          style={{ width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", background: "transparent", border: "1px solid #E2E8F0", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#F1F5F9")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Menu size={16} />
        </button>
        {/* Logo */}
        <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#2563EB,#1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>G</div>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "#0F172A" }}>{currentPageName}</span>
        {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
        {iosDevice && !standalone && (
          <button onClick={dismissIosBanner}
            style={{ width: 30, height: 30, borderRadius: 7, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <PlusSquare size={13} />
          </button>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════
          MOBILE DRAWER OVERLAY
      ══════════════════════════════════════════════════════════ */}
      <div
        className="md:hidden"
        style={{
          position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.35)",
          transition: "opacity 200ms", opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? "auto" : "none",
        }}
        aria-hidden="true"
      />

      {/* ══════════════════════════════════════════════════════════
          MOBILE DRAWER
      ══════════════════════════════════════════════════════════ */}
      <div
        ref={drawerRef}
        className="md:hidden"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 51, width: 260,
          background: "#F1F5F9", borderRight: "1px solid #E2E8F0",
          boxShadow: "8px 0 32px rgba(15,23,42,0.12)",
          display: "flex", flexDirection: "column",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div style={{ padding: "14px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF" }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg,#2563EB,#1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>G</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>GAB School</p>
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{(admin as any).displayName ?? admin.username}</p>
          </div>
          {pushReady && <BellButton subscribed={subscribed} loading={loading} subscribe={subscribe} unsubscribe={unsubscribe} />}
          <button onClick={() => setDrawerOpen(false)}
            style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", border: "1px solid #E2E8F0", background: "transparent", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F1F5F9")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <X size={14} />
          </button>
        </div>

        {pushReady && subscribed === false && (
          <div className="ad-push-hint"><Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>Activez la cloche pour recevoir une alerte à chaque inscription</span></div>
        )}
        {iosDevice && !standalone && (
          <div className="ad-ios-hint"><Share size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>Installez l'app pour activer les notifications</span></div>
        )}

        <nav style={{ flex: 1, padding: "4px 8px 8px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <NavLinks location={location} onNavigate={() => setDrawerOpen(false)} />
        </nav>

        <div style={{ padding: "8px 8px 16px", borderTop: "1px solid #E2E8F0" }}>
          <button className="ad-sidebar-logout" onClick={() => { setDrawerOpen(false); adminLogout(); }}>
            <LogOut size={14} className="ad-nav-icon" />Se déconnecter
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DESKTOP SIDEBAR
      ══════════════════════════════════════════════════════════ */}
      <aside className="ad-sidebar hidden md:flex" style={{ position: "sticky", top: 0, height: "100vh" }}>
        <SidebarBrand
          username={(admin as any).displayName ?? admin.username}
          role={(admin as any).role}
          pushReady={pushReady}
          subscribed={subscribed}
          loading={loading}
          subscribe={subscribe}
          unsubscribe={unsubscribe}
        />

        {pushReady && subscribed === false && (
          <div className="ad-push-hint"><Bell size={12} style={{ flexShrink: 0, marginTop: 1 }} /><span>Activez la cloche pour recevoir une alerte à chaque inscription</span></div>
        )}

        <nav style={{ flex: 1, padding: "4px 8px 8px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <NavLinks location={location} />
        </nav>

        <div style={{ padding: "8px 8px 16px", borderTop: "1px solid #E2E8F0" }}>
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
        <div className="md:pt-0" style={{ maxWidth: 1340, margin: "0 auto", padding: "28px 28px 48px" }}>
          {children}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          iOS BANNER
      ══════════════════════════════════════════════════════════ */}
      {showIosBanner && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#FFFFFF", borderTop: "1px solid #E2E8F0", padding: 16, boxShadow: "0 -8px 32px rgba(15,23,42,0.08)" }}>
          <button onClick={dismissIosBanner} style={{ position: "absolute", top: 12, right: 12, color: "#94A3B8", background: "transparent", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
          <div style={{ display: "flex", gap: 12, paddingRight: 28 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PlusSquare size={16} color="#2563EB" />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", marginBottom: 3 }}>Installer le panneau d'administration</p>
              <p style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5 }}>
                Appuyez sur <Share size={11} style={{ display: "inline", verticalAlign: "middle" }} /> puis <strong style={{ color: "#334155" }}>« Sur l'écran d'accueil »</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
