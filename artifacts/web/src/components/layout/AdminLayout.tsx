import { ReactNode, useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { LayoutDashboard, Users, Video, FolderTree, CreditCard, LogOut, ShieldAlert, ListVideo, Activity, BadgeCheck, Banknote, KeyRound, Megaphone, Bell, BellOff, BellRing, X, Share, PlusSquare } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function useAdminPush(adminToken: string | null) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const authHeader = useCallback((): Record<string, string> =>
    adminToken ? { Authorization: `Bearer ${adminToken}` } : {}, [adminToken]);

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

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, adminLogout } = useAuth();
  const [location] = useLocation();
  const [iosBannerDismissed, setIosBannerDismissed] = useState(() => {
    try { return localStorage.getItem("admin-ios-banner-dismissed") === "1"; } catch { return false; }
  });

  const adminToken = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  const pushSupported = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;
  const { subscribed, loading, subscribe, unsubscribe } = useAdminPush(admin ? adminToken : null);

  const showIosBanner = !iosBannerDismissed && isIosSafari() && !isStandalone();

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

  const nav = [
    { name: "الإحصائيات", path: "/gab-ctrl-9x", icon: LayoutDashboard },
    { name: "المستخدمين", path: "/gab-ctrl-9x/users", icon: Users },
    { name: "الفيديوهات", path: "/gab-ctrl-9x/videos", icon: Video },
    { name: "التصنيفات", path: "/gab-ctrl-9x/categories", icon: FolderTree },
    { name: "السلاسل", path: "/gab-ctrl-9x/playlists", icon: ListVideo },
    { name: "خطط الأسعار", path: "/gab-ctrl-9x/plans", icon: CreditCard },
    { name: "الاشتراكات", path: "/gab-ctrl-9x/subscriptions", icon: BadgeCheck },
    { name: "إرسال إشعار", path: "/gab-ctrl-9x/send-notification", icon: Megaphone },
    { name: "سجل النشاطات", path: "/gab-ctrl-9x/activity-log", icon: Activity },
    { name: "طلبات الدفع", path: "/gab-ctrl-9x/payments", icon: Banknote },
    { name: "تغيير كلمة المرور", path: "/gab-ctrl-9x/change-password", icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row rtl">
      {/* iOS "Add to Home Screen" banner */}
      {showIosBanner && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-white/10 p-4 shadow-2xl">
          <button
            className="absolute top-3 left-3 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setIosBannerDismissed(true);
              try { localStorage.setItem("admin-ios-banner-dismissed", "1"); } catch { /* */ }
            }}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-3 pr-1 pl-8">
            <div className="mt-0.5 w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <PlusSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm mb-1">ثبّت التطبيق على شاشتك الرئيسية</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                اضغط على أيقونة المشاركة <Share className="inline w-3.5 h-3.5 mx-0.5 -mt-0.5" /> في أسفل Safari
                ثم اختر <strong>"Add to Home Screen"</strong> — ستفتح لوحة التحكم بدون شريط Safari.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-full md:w-64 border-l border-white/10 bg-card/50 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg leading-tight">لوحة التحكم</h1>
            <p className="text-xs text-muted-foreground">{admin.username}</p>
          </div>
          {/* Push notification bell for admin */}
          {pushSupported && (
            <button
              type="button"
              title={subscribed ? "إلغاء إشعارات التسجيل" : "تفعيل إشعارات التسجيل"}
              disabled={loading || subscribed === null}
              onClick={subscribed ? unsubscribe : subscribe}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
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
          )}
        </div>

        {/* Push subscription hint */}
        {pushSupported && subscribed === false && (
          <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400 flex items-start gap-2">
            <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>اضغط على جرس الإشعارات ↑ لتلقّي تنبيه عند كل تسجيل جديد</span>
          </div>
        )}

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {nav.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-foreground/70 hover:bg-white/5 hover:text-foreground"
                }`}>
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={adminLogout}>
            <LogOut className="w-5 h-5 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-black/20">
        <div className="p-4 md:p-6 lg:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
