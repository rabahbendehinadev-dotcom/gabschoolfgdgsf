import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, GraduationCap, Upload, X, Loader2, Eye, EyeOff, ImageIcon } from "lucide-react";
import { useGetAdminPlaylists, useGetAdminCategories, useCreatePlaylist, useUpdatePlaylist, useDeletePlaylist } from "@workspace/api-client-react/src/generated/api";

interface CourseForm {
  title: string;
  description: string;
  imageUrl: string;
  categoryId: number;
  sortOrder: number;
  isVisible: boolean;
}

const DEFAULT_FORM: CourseForm = {
  title: "", description: "", imageUrl: "",
  categoryId: 0, sortOrder: 0, isVisible: true,
};

export function AdminCourses() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const reqOpts = { request: getAdminAuthHeaders() };

  const { data: playlists, refetch } = useGetAdminPlaylists(reqOpts);
  const { data: categories } = useGetAdminCategories(reqOpts);
  const createMut = useCreatePlaylist({ request: getAdminAuthHeaders() });
  const updateMut = useUpdatePlaylist({ request: getAdminAuthHeaders() });
  const deleteMut = useDeletePlaylist({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CourseForm>(DEFAULT_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleOpen = (pl?: typeof playlists extends (infer T)[] | undefined ? T : never) => {
    if (pl) {
      setEditingId(pl.id);
      setForm({
        title: pl.title,
        description: pl.description ?? "",
        imageUrl: (pl as typeof pl & { imageUrl?: string | null }).imageUrl ?? "",
        categoryId: pl.categoryId,
        sortOrder: pl.sortOrder,
        isVisible: pl.isVisible,
      });
    } else {
      setEditingId(null);
      setForm({ ...DEFAULT_FORM, categoryId: categories?.[0]?.id ?? 0 });
    }
    setIsOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const step1 = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!step1.ok) throw new Error("فشل طلب رابط الرفع");
      const { uploadURL, objectPath } = await step1.json() as { uploadURL: string; objectPath: string };
      const step2 = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!step2.ok) throw new Error("فشل رفع الصورة");
      const serveUrl = `/api/storage${objectPath}`;
      setForm(prev => ({ ...prev, imageUrl: serveUrl }));
      toast({ title: "✅ تم رفع الصورة", className: "bg-green-600 text-white border-none" });
    } catch {
      toast({ variant: "destructive", title: "فشل رفع الصورة" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "اسم الدورة مطلوب" });
      return;
    }
    if (!form.categoryId) {
      toast({ variant: "destructive", title: "يجب اختيار تصنيف" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl || null,
      categoryId: form.categoryId,
      sortOrder: form.sortOrder,
      isVisible: form.isVisible,
    };
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: payload as Parameters<typeof updateMut.mutateAsync>[0]["data"] })
      : createMut.mutateAsync({ data: payload as Parameters<typeof createMut.mutateAsync>[0]["data"] });

    action
      .then(() => {
        toast({ title: editingId ? "تم تحديث الدورة" : "تم إنشاء الدورة", className: "bg-green-600 text-white border-none" });
        refetch();
        setIsOpen(false);
      })
      .catch(() => toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ" }));
  };

  const handleDelete = (id: number, title: string) => {
    if (!confirm(`حذف دورة "${title}"؟ سيتم فصل الدروس المرتبطة بها.`)) return;
    deleteMut.mutate({ id }, {
      onSuccess: () => { toast({ title: "تم الحذف" }); refetch(); },
      onError: () => toast({ variant: "destructive", title: "فشل الحذف" }),
    });
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            إدارة الدورات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            أضف دوراتك وخصّص صورها — تظهر تلقائياً في صفحة الدورات
          </p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="w-4 h-4" />
          دورة جديدة
        </Button>
      </div>

      {/* Courses list */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(playlists ?? []).map(pl => {
          const imageUrl = (pl as typeof pl & { imageUrl?: string | null }).imageUrl;
          return (
            <Card key={pl.id} className="glass-card overflow-hidden">
              {/* Thumbnail */}
              <div className="relative aspect-video bg-muted/40 overflow-hidden">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={pl.title}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <GraduationCap className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                {!pl.isVisible && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-lg">
                    <EyeOff className="w-3 h-3" />
                    مخفي
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-lg">
                  {pl.videos?.length ?? 0} درس
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-bold text-base leading-snug mb-1 line-clamp-1">{pl.title}</h3>
                {pl.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{pl.description}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 gap-1.5" onClick={() => handleOpen(pl)}>
                    <Edit className="w-3.5 h-3.5" />
                    تعديل
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(pl.id, pl.title)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {(playlists ?? []).length === 0 && (
          <div className="col-span-full">
            <Card className="glass-card p-14 text-center">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد دورات بعد. أضف أول دورة!</p>
            </Card>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg bg-background border border-white/10 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل الدورة" : "دورة جديدة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Image upload */}
            <div className="space-y-2">
              <Label>صورة الدورة</Label>
              {form.imageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
                  <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, imageUrl: "" }))}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-2 border border-dashed border-white/20 rounded-xl p-8 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {uploading
                    ? <Loader2 className="w-7 h-7 animate-spin" />
                    : <ImageIcon className="w-7 h-7" />
                  }
                  <span className="text-sm">{uploading ? "جاري الرفع..." : "اضغط لرفع صورة الدورة"}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              {!form.imageUrl && !uploading && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-muted-foreground">أو</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}
              {!form.imageUrl && (
                <Input
                  placeholder="الصق رابط صورة مباشر (https://...)"
                  dir="ltr" className="text-left text-sm"
                  value={form.imageUrl}
                  onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                />
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>اسم الدورة *</Label>
              <Input
                placeholder="مثال: دورة الفلاش والديكوداك"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>وصف الدورة</Label>
              <textarea
                className="flex min-h-[70px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="وصف مختصر عن محتوى الدورة..."
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Category + Sort */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>التصنيف *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                  value={form.categoryId}
                  onChange={e => setForm(p => ({ ...p, categoryId: parseInt(e.target.value) }))}
                >
                  <option value={0} disabled>اختر تصنيف</option>
                  {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>الترتيب</Label>
                <Input
                  type="number" min={0}
                  value={form.sortOrder}
                  onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Visibility */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox" checked={form.isVisible}
                onChange={e => setForm(p => ({ ...p, isVisible: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm flex items-center gap-1.5">
                {form.isVisible ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                {form.isVisible ? "مرئية للطلاب" : "مخفية"}
              </span>
            </label>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "حفظ التغييرات" : "إنشاء الدورة")}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
