import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui";
import { LayoutDashboard, Users, Video, FolderTree, CreditCard, LogOut, ShieldAlert, ListVideo, Activity, BadgeCheck } from "lucide-react";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, adminLogout } = useAuth();
  const [location] = useLocation();

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
    { name: "سجل النشاطات", path: "/gab-ctrl-9x/activity-log", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row rtl">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-l border-white/10 bg-card/50 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">لوحة التحكم</h1>
            <p className="text-xs text-muted-foreground">{admin.username}</p>
          </div>
        </div>
        
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
        <div className="p-6 lg:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
