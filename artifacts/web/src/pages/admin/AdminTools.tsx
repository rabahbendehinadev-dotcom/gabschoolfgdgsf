import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { compressImageForUpload } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash2, Wrench, Eye, EyeOff,
  Crown, KeyRound, Lock, CheckCircle2, Loader2,
  ExternalLink, ImagePlus, X, FolderTree,
} from "lucide-react";

/* ── types ───────────────────────────────────────────────────────── */

interface ToolCategory { id: number; name: string; sortOrder: number; isVisible: boolean; }

interface AdminTool {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  accessType: "free" | "password" | "vip" | "vip_password";
  downloadUrl: string;
  hasPassword: boolean;
  isPublished: boolean;
  os: string | null;
  sortOrder: number;
}

interface ToolForm {
  name: string;
  description: string;
  imageUrl: string;
  categoryId: number | null;
  accessType: "free" | "password" | "vip" | "vip_password";
  password: string;
  downloadUrl: string;
  isPublished: boolean;
  os: string[];
  sortOrder: number;
}

const OS_OPTIONS = ["Windows", "macOS", "All"];

const EMPTY_FORM: ToolForm = {
  name: "", description: "", imageUrl: "", categoryId: null,
  accessType: "free", password: "", downloadUrl: "",
  isPublished: true, os: [], sortOrder: 0,
};

const ACCESS_OPTIONS = [
  { value: "free",         label: "مجاني",            icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
  { value: "password",     label: "بكلمة مرور",       icon: <KeyRound    className="w-4 h-4 text-blue-400"    /> },
  { value: "vip",          label: "VIP فقط",          icon: <Crown       className="w-4 h-4 text-amber-400"   /> },
  { value: "vip_password", label: "VIP + كلمة مرور", icon: <Lock        className="w-4 h-4 text-purple-400"  /> },
];

const ACCESS_BADGE: Record<string, string> = {
  free:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  password:     "bg-blue-500/15   text-blue-400    border-blue-500/30",
  vip:          "bg-amber-500/15  text-amber-400   border-amber-500/30",
  vip_password: "bg-purple-500/15 text-purple-400  border-purple-500/30",
};

const ACCESS_LABEL: Record<string, string> = {
  free: "مجاني", password: "بكلمة مرور", vip: "VIP فقط", vip_password: "VIP + كلمة مرور",
};

/* ── OS multi-select chip component ─────────────────────────────── */
function OsMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    if (opt === "All") { onChange(["All"]); return; }
    const next = value.filter(v => v !== "All");
    if (next.includes(opt)) onChange(next.filter(v => v !== opt));
    else onChange([...next, opt]);
  };
  return (
    <div className="flex gap-2 flex-wrap">
      {OS_OPTIONS.map(opt => {
        const active = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              active
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-muted/20 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────── */
export function AdminTools() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editing, setEditing]           = useState<AdminTool | null>(null);
  const [form, setForm]                 = useState<ToolForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteId, setDeleteId]         = useState<number | null>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  /* ── data ── */
  const { data: tools = [], isLoading } = useQuery<AdminTool[]>({
    queryKey: ["admin-tools"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/admin/tools`, { headers: getAdminAuthHeaders()?.headers });
      if (!res.ok) throw new Error("فشل تحميل الأدوات");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<ToolCategory[]>({
    queryKey: ["admin-tool-categories"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/admin/tool-categories`, { headers: getAdminAuthHeaders()?.headers });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-tools"] });

  /* ── mutations ── */
  const buildBody = (data: ToolForm) => ({
    name: data.name,
    description: data.description,
    imageUrl: data.imageUrl || null,
    categoryId: data.categoryId ?? null,
    accessType: data.accessType,
    password: data.password || null,
    downloadUrl: data.downloadUrl,
    isPublished: data.isPublished,
    os: data.os.length ? data.os.join(",") : null,
    sortOrder: data.sortOrder,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ToolForm) => {
      const res = await fetch(`${base}/api/admin/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(buildBody(data)),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "خطأ");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "تمت إضافة الأداة" }); },
    onError:   (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ToolForm }) => {
      const body: Record<string, unknown> = buildBody(data);
      if (!data.password) delete body.password;
      const res = await fetch(`${base}/api/admin/tools/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "خطأ");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "تم تحديث الأداة" }); },
    onError:   (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${base}/api/admin/tools/${id}`, {
        method: "DELETE", headers: getAdminAuthHeaders()?.headers,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "خطأ");
    },
    onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "تم حذف الأداة" }); },
    onError:   (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  /* ── image upload ── */
  async function handleImageFile(original: File) {
    if (!original.type.startsWith("image/")) {
      toast({ title: "نوع الملف غير مدعوم", variant: "destructive" }); return;
    }
    setImgUploading(true);
    try {
      const file = await compressImageForUpload(original);
      const step1 = await fetch(`${base}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!step1.ok) throw new Error("فشل الحصول على رابط الرفع");
      const { uploadURL, objectPath } = await step1.json() as { uploadURL: string; objectPath: string };
      const step2 = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!step2.ok) throw new Error("فشل رفع الصورة");
      setForm(f => ({ ...f, imageUrl: `${base}/api/storage${objectPath}` }));
    } catch (e) {
      toast({ title: "خطأ في رفع الصورة", description: (e as Error).message, variant: "destructive" });
    } finally { setImgUploading(false); }
  }

  /* ── dialog helpers ── */
  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setShowPassword(false); setDialogOpen(true); }

  function openEdit(tool: AdminTool) {
    setEditing(tool);
    setForm({
      name:        tool.name,
      description: tool.description,
      imageUrl:    tool.imageUrl ?? "",
      categoryId:  tool.categoryId,
      accessType:  tool.accessType,
      password:    "",
      downloadUrl: tool.downloadUrl,
      isPublished: tool.isPublished,
      os:          tool.os ? tool.os.split(",").map(s => s.trim()).filter(Boolean) : [],
      sortOrder:   tool.sortOrder,
    });
    setShowPassword(false);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.downloadUrl.trim()) {
      toast({ title: "الاسم ورابط التحميل مطلوبان", variant: "destructive" }); return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else         createMutation.mutate(form);
  }

  const isPending     = createMutation.isPending || updateMutation.isPending;
  const needsPassword = form.accessType === "password" || form.accessType === "vip_password";

  /* ── render ── */
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wrench className="w-7 h-7 text-primary" />
            إدارة الأدوات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tools.length} أداة</p>
        </div>
        <Button onClick={openCreate} className="gap-2 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" /> أداة جديدة
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : tools.length === 0 ? (
        <Card className="glass-card p-16 text-center">
          <Wrench className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">لا توجد أدوات بعد</h3>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> أضف أداة</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tools.map(tool => (
            <Card key={tool.id} className="glass-card p-4">
              <div className="flex items-start gap-4">
                {tool.imageUrl ? (
                  <img src={tool.imageUrl} alt={tool.name}
                    className="w-16 h-16 rounded-xl object-contain flex-shrink-0 border border-border p-1 bg-muted/10" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-muted/30 flex items-center justify-center flex-shrink-0 border border-border">
                    <Wrench className="w-7 h-7 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-base">{tool.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ACCESS_BADGE[tool.accessType]}`}>
                      {ACCESS_LABEL[tool.accessType]}
                    </span>
                    {tool.categoryName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-muted/30 text-muted-foreground">
                        <FolderTree className="w-3 h-3" />{tool.categoryName}
                      </span>
                    )}
                    {!tool.isPublished && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-orange-500/10 text-orange-400 border-orange-500/20">
                        <EyeOff className="w-3 h-3" /> مخفي
                      </span>
                    )}
                    {tool.hasPassword && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-slate-500/10 text-slate-400 border-slate-500/20">
                        <KeyRound className="w-3 h-3" /> لها كلمة مرور
                      </span>
                    )}
                  </div>
                  {tool.description && <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{tool.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {tool.os && <span>{tool.os}</span>}
                    <span className="flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{tool.downloadUrl}</span>
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(tool)} className="gap-1">
                    <Edit className="w-3.5 h-3.5" /> تعديل
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteId(tool.id)}
                    className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" /> حذف
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start">
              <Wrench className="w-5 h-5 text-primary" />
              {editing ? "تعديل الأداة" : "إضافة أداة جديدة"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">

            {/* Name */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>اسم الأداة <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: CCleaner Pro" />
            </div>

            {/* Description */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="وصف مختصر عن الأداة..." rows={3} className="resize-none" />
            </div>

            {/* Image upload */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>صورة الأداة</Label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
              {form.imageUrl ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-border group bg-muted/10 flex items-center justify-center">
                    <img src={form.imageUrl} alt="معاينة" className="max-w-[80%] max-h-[80%] object-contain" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}
                    disabled={imgUploading} className="gap-2">
                    {imgUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    تغيير الصورة
                  </Button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imgUploading}
                  className="flex flex-col items-center justify-center gap-2 w-full h-28 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground">
                  {imgUploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <ImagePlus className="w-6 h-6" />}
                  <span className="text-sm">{imgUploading ? "جاري الرفع..." : "اضغط لرفع صورة"}</span>
                </button>
              )}
            </div>

            {/* Download URL */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>رابط التحميل <span className="text-destructive">*</span></Label>
              <Input value={form.downloadUrl} onChange={e => setForm(f => ({ ...f, downloadUrl: e.target.value }))} placeholder="https://..." />
              <p className="text-xs text-muted-foreground">هذا الرابط سري ولن يُعرض للمستخدمين مباشرة</p>
            </div>

            {/* Category dropdown */}
            <div className="space-y-1.5">
              <Label>التصنيف</Label>
              {categories.length === 0 ? (
                <Link href="/gab-ctrl-9x/tool-categories">
                  <Button variant="outline" size="sm" className="gap-2 w-full justify-start text-muted-foreground">
                    <FolderTree className="w-4 h-4" />
                    أضف تصنيفات أولاً
                  </Button>
                </Link>
              ) : (
                <Select
                  value={form.categoryId !== null ? String(form.categoryId) : "none"}
                  onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? null : Number(v) }))}
                >
                  <SelectTrigger><SelectValue placeholder="اختر تصنيفاً..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><span className="text-muted-foreground">بدون تصنيف</span></SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* OS multi-select */}
            <div className="space-y-1.5">
              <Label>نظام التشغيل</Label>
              <OsMultiSelect value={form.os} onChange={v => setForm(f => ({ ...f, os: v }))} />
            </div>

            {/* Access Type */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>مستوى الوصول</Label>
              <Select value={form.accessType} onValueChange={v => setForm(f => ({ ...f, accessType: v as ToolForm["accessType"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">{opt.icon}{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Password */}
            {needsPassword && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>
                  كلمة المرور
                  {editing?.hasPassword && <span className="text-muted-foreground text-xs mr-2">(اتركها فارغة للإبقاء على الحالية)</span>}
                </Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editing?.hasPassword ? "••••••••" : "أدخل كلمة المرور..."} className="pe-10" />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Sort Order + Published */}
            <div className="space-y-1.5">
              <Label>ترتيب العرض</Label>
              <Input type="number" value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} placeholder="0" />
              <p className="text-xs text-muted-foreground">الرقم الأصغر يظهر أولاً</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-3">
              <div>
                <Label className="text-sm font-medium">حالة النشر</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.isPublished ? "مرئي للزوار" : "مخفي عن الزوار"}
                </p>
              </div>
              <Switch checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending || imgUploading} className="flex-1 gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "حفظ التعديلات" : "إضافة الأداة"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="text-start text-destructive">حذف الأداة</DialogTitle></DialogHeader>
          <p className="text-muted-foreground text-sm">هل أنت متأكد من حذف هذه الأداة؟ لا يمكن التراجع.</p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending} className="flex-1 gap-2">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              حذف
            </Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
