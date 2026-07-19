import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FolderTree, Loader2, Eye, EyeOff, Link } from "lucide-react";

interface ToolCategory {
  id: number;
  name: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
}

interface CatForm {
  name: string;
  sortOrder: number;
  isVisible: boolean;
}

const EMPTY: CatForm = { name: "", sortOrder: 0, isVisible: true };

export function AdminToolCategories() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ToolCategory | null>(null);
  const [form, setForm] = useState<CatForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: cats = [], isLoading } = useQuery<ToolCategory[]>({
    queryKey: ["admin-tool-categories"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/admin/tool-categories`, { headers: getAdminAuthHeaders()?.headers });
      if (!res.ok) throw new Error("فشل التحميل");
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-tool-categories"] });

  const createMut = useMutation({
    mutationFn: async (data: CatForm) => {
      const res = await fetch(`${base}/api/admin/tool-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "خطأ");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "تمت إضافة التصنيف" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CatForm }) => {
      const res = await fetch(`${base}/api/admin/tool-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "خطأ");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "تم تحديث التصنيف" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${base}/api/admin/tool-categories/${id}`, {
        method: "DELETE", headers: getAdminAuthHeaders()?.headers,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "خطأ");
    },
    onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "تم حذف التصنيف" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleVisible = (cat: ToolCategory) =>
    updateMut.mutate({ id: cat.id, data: { name: cat.name, sortOrder: cat.sortOrder, isVisible: !cat.isVisible } });

  function openCreate() { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  function openEdit(cat: ToolCategory) {
    setEditing(cat);
    setForm({ name: cat.name, sortOrder: cat.sortOrder, isVisible: cat.isVisible });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "اسم التصنيف مطلوب", variant: "destructive" }); return;
    }
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FolderTree className="w-7 h-7 text-primary" />
            إدارة تصنيفات الأدوات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cats.length} تصنيف — الترتيب هنا هو نفسه الذي يراه المستخدم
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" />
          تصنيف جديد
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : cats.length === 0 ? (
        <Card className="glass-card p-16 text-center">
          <FolderTree className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">لا توجد تصنيفات بعد</h3>
          <p className="text-muted-foreground mb-6 text-sm">أضف تصنيفاً لتنظيم أدواتك</p>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> أضف تصنيف
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cats.map((cat, idx) => (
            <Card key={cat.id} className="glass-card p-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base">{cat.name}</span>
                    {!cat.isVisible && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-orange-500/10 text-orange-400 border-orange-500/20">
                        <EyeOff className="w-3 h-3" /> مخفي
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">ترتيب العرض: {cat.sortOrder}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleVisible(cat)}
                    title={cat.isVisible ? "إخفاء التصنيف" : "إظهار التصنيف"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      cat.isVisible
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-red-500/10 hover:text-red-400"
                        : "bg-muted/30 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
                    }`}
                  >
                    {cat.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(cat)} className="gap-1">
                    <Edit className="w-3.5 h-3.5" /> تعديل
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteId(cat.id)}
                    className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" /> حذف
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Info note */}
      {cats.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-muted/20 border border-border px-4 py-3 text-sm text-muted-foreground">
          <Link className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            التصنيفات تُعرض للمستخدم بنفس ترتيب الرقم — غيّر رقم "ترتيب العرض" لتحديد الترتيب.
            التصنيفات المخفية لا تظهر في الموقع لكن الأدوات المرتبطة بها تبقى متاحة.
          </span>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start">
              <FolderTree className="w-5 h-5 text-primary" />
              {editing ? "تعديل التصنيف" : "إضافة تصنيف جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>اسم التصنيف <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: صيانة، تصميم، برمجة..."
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>ترتيب العرض</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">الرقم الأصغر يظهر أولاً</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-3">
              <div>
                <Label className="text-sm font-medium">ظاهر للمستخدمين</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.isVisible ? "يظهر في تبويبات الأدوات" : "مخفي من الموقع"}
                </p>
              </div>
              <Switch checked={form.isVisible} onCheckedChange={v => setForm(f => ({ ...f, isVisible: v }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending} className="flex-1 gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "حفظ التعديلات" : "إضافة التصنيف"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-start text-destructive">حذف التصنيف</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            هل أنت متأكد؟ الأدوات المرتبطة بهذا التصنيف لن تُحذف لكن ستفقد تصنيفها.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
              disabled={deleteMut.isPending} className="flex-1 gap-2">
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              حذف
            </Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
