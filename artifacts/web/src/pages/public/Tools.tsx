import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Download, Search, Wrench, Lock, Crown, KeyRound,
  CheckCircle2, Monitor, Apple, Globe, Package,
  LogIn, GraduationCap, Sparkles, Eye, EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PublicTool {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  accessType: "free" | "password" | "vip" | "vip_password";
  os: string | null;
}

interface PublicCategory {
  id: number;
  name: string;
  sortOrder: number;
}

const ACCESS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  free: { label: "مجاني", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  password: { label: "بكلمة مرور", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: <KeyRound className="w-3 h-3" /> },
  vip: { label: "VIP فقط", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <Crown className="w-3 h-3" /> },
  vip_password: { label: "بكلمة مرور / VIP مجاناً", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: <Lock className="w-3 h-3" /> },
};

function OsIcon({ os }: { os: string | null }) {
  if (!os) return null;
  const lower = os.toLowerCase();
  if (lower.includes("mac") || lower.includes("apple")) return <Apple className="w-3.5 h-3.5" />;
  if (lower.includes("win")) return <Monitor className="w-3.5 h-3.5" />;
  return <Globe className="w-3.5 h-3.5" />;
}

function ToolCard({ tool, onDownload }: { tool: PublicTool; onDownload: (tool: PublicTool) => void }) {
  const access = ACCESS_LABELS[tool.accessType] ?? ACCESS_LABELS.free;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl overflow-hidden flex flex-col group hover:border-primary/30 transition-all duration-300"
    >
      <div className="relative aspect-video bg-muted/10 overflow-hidden flex items-center justify-center">
        {tool.imageUrl ? (
          <img
            src={tool.imageUrl}
            alt={tool.name}
            className="max-w-[70%] max-h-[70%] object-contain group-hover:scale-105 transition-transform duration-500 drop-shadow-sm"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
            <Wrench className="w-12 h-12 text-primary/30" />
          </div>
        )}
        <div className="absolute top-2 end-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${access.color}`}>
            {access.icon}
            {access.label}
          </span>
        </div>
        {tool.categoryName && (
          <div className="absolute top-2 start-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-background/70 border border-border text-muted-foreground backdrop-blur-sm">
              {tool.categoryName}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-bold text-base leading-snug line-clamp-1">{tool.name}</h3>
        {tool.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{tool.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-2 flex-wrap">
          {tool.os && (
            <span className="flex items-center gap-1">
              <OsIcon os={tool.os} />
              {tool.os}
            </span>
          )}
          {tool.version && (
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5" />
              v{tool.version}
            </span>
          )}
          {tool.fileSizeMb && (
            <span className="flex items-center gap-1">
              <Download className="w-3.5 h-3.5" />
              {tool.fileSizeMb}
            </span>
          )}
        </div>

        <Button
          onClick={() => onDownload(tool)}
          className="w-full mt-3 rounded-xl gap-2 shadow-md shadow-primary/20"
          size="sm"
        >
          <Download className="w-4 h-4" />
          تحميل الأداة
        </Button>
      </div>
    </motion.div>
  );
}

type ModalState =
  | { type: "none" }
  | { type: "password"; tool: PublicTool }
  | { type: "upgrade"; tool: PublicTool };

export function Tools() {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: tools = [], isLoading } = useQuery<PublicTool[]>({
    queryKey: ["tools"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/tools`, getAuthHeaders());
      if (!res.ok) throw new Error("فشل تحميل الأدوات");
      return res.json();
    },
  });

  const { data: apiCategories = [] } = useQuery<PublicCategory[]>({
    queryKey: ["tool-categories-public"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/tool-categories`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filtered = tools.filter(t => {
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.categoryName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || t.categoryId === categoryFilter;
    return matchSearch && matchCat;
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ toolId, pwd }: { toolId: number; pwd?: string }) => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/tools/${toolId}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders()?.headers },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw { status: res.status, ...data };
      return data as { signedUrl: string };
    },
    onSuccess: (data) => {
      setModal({ type: "none" });
      setPassword("");
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.open(`${base}${data.signedUrl}`, "_blank");
    },
    onError: (err: { requiresPassword?: boolean; requiresVip?: boolean; requiresAuth?: boolean; message?: string }) => {
      if (err.requiresPassword) {
        toast({ title: "كلمة المرور غير صحيحة", description: "تحقق من كلمة المرور وأعد المحاولة", variant: "destructive" });
        return;
      }
      toast({ title: "خطأ", description: err.message ?? "حدث خطأ غير متوقع", variant: "destructive" });
    },
  });

  const isVip = user?.accountType === "vip";

  function handleDownload(tool: PublicTool) {
    // الترتيب الصحيح:
    // 1. مجاني → تحميل مباشر
    // 2. VIP نشط → تحميل مباشر بغض النظر عن نوع الأداة
    // 3. الأداة فيها كود (password / vip_password) → نافذة الكود أولاً للجميع
    // 4. الأداة VIP فقط (بدون كود) → نافذة الترقية (زائر أو مسجّل عادي)

    if (tool.accessType === "free") {
      downloadMutation.mutate({ toolId: tool.id });
      return;
    }

    // VIP نشط يتجاوز كل الحواجز
    if (isVip) {
      downloadMutation.mutate({ toolId: tool.id });
      return;
    }

    // الأداة فيها كود → نافذة إدخال الكود أولاً (حتى للزائر بدون حساب)
    if (tool.accessType === "password" || tool.accessType === "vip_password") {
      setModal({ type: "password", tool });
      return;
    }

    // الأداة VIP فقط (بدون كود) → نافذة الترقية
    setModal({ type: "upgrade", tool });
  }

  function handlePasswordSubmit() {
    if (modal.type !== "password") return;
    downloadMutation.mutate({ toolId: modal.tool.id, pwd: password });
  }

  return (
    <div className="min-h-screen" dir="rtl">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-b from-primary/10 via-background to-background pb-8 pt-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            <Wrench className="w-4 h-4" />
            مكتبة الأدوات
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
            TEST DEPLOY 123
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
            مجموعة من الأدوات والبرامج المنتقاة بعناية لمساعدتك في مسيرتك التعليمية والمهنية
          </p>

          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن أداة..."
              className="pe-10 h-12 rounded-2xl bg-background/60 backdrop-blur border-border/60 text-base"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-16">
        {/* Category Tabs — only shown if categories exist in DB */}
        {apiCategories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-8 no-scrollbar">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-all ${
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25"
                  : "bg-background/60 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              جميع التصنيفات
            </button>
            {apiCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-all ${
                  categoryFilter === cat.id
                    ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25"
                    : "bg-background/60 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Tools Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-muted/30" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-muted/30 rounded w-3/4" />
                  <div className="h-3 bg-muted/30 rounded w-full" />
                  <div className="h-3 bg-muted/30 rounded w-2/3" />
                  <div className="h-9 bg-muted/30 rounded-xl mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <Wrench className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا توجد أدوات</h3>
            <p className="text-muted-foreground">
              {search || categoryFilter !== "all" ? "لم يتطابق أي بحث مع نتائج الأدوات" : "لم تُضف أي أدوات بعد"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <AnimatePresence>
              {filtered.map(tool => (
                <ToolCard key={tool.id} tool={tool} onDownload={handleDownload} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* CTA for guests */}
        {!user && tools.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-16 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-8 text-center"
          >
            <Sparkles className="w-10 h-10 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">احصل على وصول كامل</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              سجّل الدخول أو اشترك في عضوية VIP للحصول على وصول لجميع الأدوات الحصرية
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/subscribe">
                <Button size="lg" className="rounded-2xl gap-2 shadow-lg shadow-primary/25">
                  <Crown className="w-5 h-5" />
                  اشترك الآن
                </Button>
              </Link>
              <Link href="/courses">
                <Button size="lg" variant="outline" className="rounded-2xl gap-2 border-border hover:border-primary/40">
                  <GraduationCap className="w-5 h-5" />
                  مشاهدة الدورات
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="ghost" className="rounded-2xl gap-2">
                  <LogIn className="w-5 h-5" />
                  تسجيل الدخول
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </div>

      {/* Password Modal */}
      <Dialog open={modal.type === "password"} onOpenChange={open => { if (!open) { setModal({ type: "none" }); setPassword(""); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start">
              <KeyRound className="w-5 h-5 text-primary" />
              {modal.type === "password" ? modal.tool.name : ""}
            </DialogTitle>
            <DialogDescription className="text-start">
              {modal.type === "password" && modal.tool.accessType === "vip_password"
                ? "أدخل كلمة مرور الأداة للتحميل مباشرة، أو رقّ حسابك إلى VIP للوصول الفوري بدون كلمة مرور."
                : "هذه الأداة محمية بكلمة مرور. أدخل كلمة المرور للمتابعة."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePasswordSubmit()}
                placeholder="أدخل كلمة المرور..."
                className="pe-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handlePasswordSubmit}
                disabled={!password || downloadMutation.isPending}
                className="flex-1 gap-2"
              >
                {downloadMutation.isPending ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                تحميل
              </Button>
              <Button variant="outline" onClick={() => { setModal({ type: "none" }); setPassword(""); }}>
                إلغاء
              </Button>
            </div>

            {/* خيار الترقية — يظهر فقط لأدوات vip_password */}
            {modal.type === "password" && modal.tool.accessType === "vip_password" && (
              <div className="pt-1 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center mb-2">أو احصل على وصول فوري بدون كلمة مرور</p>
                <Link href="/subscribe" onClick={() => { setModal({ type: "none" }); setPassword(""); }}>
                  <Button variant="outline" className="w-full gap-2 rounded-xl border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50">
                    <Crown className="w-4 h-4" />
                    ترقية الحساب إلى VIP
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Modal (VIP) — يظهر لكل من ليس VIP، زائر أو مسجّل */}
      <Dialog open={modal.type === "upgrade"} onOpenChange={open => { if (!open) setModal({ type: "none" }); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start">
              <Crown className="w-5 h-5 text-amber-400" />
              محتوى حصري لأعضاء VIP
            </DialogTitle>
            <DialogDescription className="text-start">
              {modal.type === "upgrade" ? `"${modal.tool.name}"` : ""} متاحة فقط لأعضاء VIP. رقّ حسابك للوصول إلى جميع الأدوات والمحتوى الحصري.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Link href="/subscribe" onClick={() => setModal({ type: "none" })}>
              <Button className="w-full gap-2 rounded-xl shadow-md shadow-primary/20">
                <Crown className="w-4 h-4" />
                ترقية الحساب إلى VIP
              </Button>
            </Link>
            <Link href="/courses" onClick={() => setModal({ type: "none" })}>
              <Button variant="outline" className="w-full gap-2 rounded-xl border-border hover:border-primary/40">
                <GraduationCap className="w-4 h-4" />
                مشاهدة الدورات المتوفرة
              </Button>
            </Link>
            {/* زر تسجيل الدخول — مرئي للزوار فقط */}
            {!user && (
              <Link href="/login" onClick={() => setModal({ type: "none" })}>
                <Button variant="ghost" className="w-full gap-2 rounded-xl">
                  <LogIn className="w-4 h-4" />
                  تسجيل الدخول
                </Button>
              </Link>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
