import { useState, useRef } from "react";
import { useGetAdminVideos, useCreateVideo, useUpdateVideo, useDeleteVideo, useGetAdminCategories, useGetAdminPlaylists, useCreatePlaylist } from "@workspace/api-client-react/src/generated/api";
import { AdminVideo, CreateVideoInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Upload, ImageIcon, X, Loader2, ListVideo } from "lucide-react";

export function AdminVideos() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const reqOpts = { request: getAdminAuthHeaders() };
  const { data: videos, refetch } = useGetAdminVideos(reqOpts);
  const { data: categories } = useGetAdminCategories(reqOpts);
  const { data: playlists, refetch: refetchPlaylists } = useGetAdminPlaylists(reqOpts);

  const createMut = useCreateVideo({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateVideo({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteVideo({ request: getAdminAuthHeaders() });
  const createPlaylistMut = useCreatePlaylist({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [quickPlaylist, setQuickPlaylist] = useState(false);
  const [quickPlaylistTitle, setQuickPlaylistTitle] = useState("");
  const [quickPlaylistCategoryId, setQuickPlaylistCategoryId] = useState<number>(0);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const handleQuickCreatePlaylist = async () => {
    if (!quickPlaylistTitle || !quickPlaylistCategoryId) return;
    setCreatingPlaylist(true);
    try {
      const playlist = await createPlaylistMut.mutateAsync({
        data: { title: quickPlaylistTitle, categoryId: quickPlaylistCategoryId, isVisible: true, sortOrder: 0 }
      });
      await refetchPlaylists();
      setFormData(f => ({ ...f, playlistId: playlist.id }));
      setQuickPlaylist(false);
      setQuickPlaylistTitle("");
      toast({ title: `تم إنشاء السلسلة "${playlist.title}"`, className: "bg-green-600 text-white border-none" });
    } catch {
      toast({ variant: "destructive", title: "فشل إنشاء السلسلة" });
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const defaultForm: CreateVideoInput = { title: "", description: "", thumbnailUrl: "", driveEmbedUrl: "", categoryId: 0, accessType: "normal", isVipOnly: false, isVisible: true, playlistId: null, partNumber: null, softwareLink: null };
  const [formData, setFormData] = useState<CreateVideoInput>(defaultForm);

  const normalizeThumbnailUrl = (url: string) => {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.pathname + parsed.search;
      }
    } catch { /* not absolute URL, return as-is */ }
    return url;
  };

  const handleOpen = (video?: AdminVideo) => {
    if (video) {
      setEditingId(video.id);
      const thumbUrl = normalizeThumbnailUrl(video.thumbnailUrl || "");
      setFormData({
        title: video.title, description: video.description, thumbnailUrl: thumbUrl,
        driveEmbedUrl: video.driveEmbedUrl, categoryId: video.categoryId,
        accessType: (video.accessType as "visitor" | "normal" | "vip") || "normal",
        isVipOnly: video.isVipOnly, isVisible: video.isVisible,
        playlistId: video.playlistId ?? null, partNumber: video.partNumber ?? null,
        softwareLink: video.softwareLink ?? null,
      });
      setPreviewUrl(thumbUrl);
    } else {
      setEditingId(null);
      setFormData({ ...defaultForm, categoryId: categories?.[0]?.id || 0 });
      setPreviewUrl("");
    }
    setIsOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    setUploading(true);
    try {
      const step1 = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!step1.ok) throw new Error("فشل طلب رابط الرفع");

      const { uploadURL, objectPath } = await step1.json() as { uploadURL: string; objectPath: string };

      const step2 = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!step2.ok) throw new Error("فشل رفع الصورة إلى التخزين");

      const serveUrl = `/api/storage${objectPath}`;
      setFormData(prev => ({ ...prev, thumbnailUrl: serveUrl }));
      setPreviewUrl(serveUrl);
      toast({ title: "تم رفع الصورة بنجاح" });
    } catch {
      toast({ variant: "destructive", title: "فشل رفع الصورة" });
      setPreviewUrl("");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeThumbnail = () => {
    setPreviewUrl("");
    setFormData(prev => ({ ...prev, thumbnailUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = () => {
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: formData })
      : createMut.mutateAsync({ data: formData });

    action.then(() => {
      toast({ title: "تم الحفظ بنجاح" });
      setIsOpen(false);
      refetch();
    }).catch(() => toast({ variant: "destructive", title: "حدث خطأ" }));
  };

  const handleDelete = (id: number) => {
    if (!confirm("حذف الفيديو؟")) return;
    deleteMut.mutate({ id }, { onSuccess: () => { toast({ title: "تم الحذف" }); refetch(); } });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">إدارة الفيديوهات</h1>
        <Button onClick={() => handleOpen()}><Plus className="w-4 h-4 ml-2" /> إضافة فيديو</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {videos?.map(v => (
          <Card key={v.id} className="border-white/5 bg-card overflow-hidden flex flex-col">
            <div className="aspect-video relative bg-black">
              {v.thumbnailUrl
                ? <img src={v.thumbnailUrl} className="w-full h-full object-cover opacity-80" alt={v.title} />
                : <div className="w-full h-full flex items-center justify-center text-foreground/20"><ImageIcon className="w-12 h-12" /></div>
              }
              {!v.isVisible && <div className="absolute inset-0 bg-background/80 flex items-center justify-center font-bold text-destructive backdrop-blur-sm">مخفي</div>}
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex gap-2 mb-2">
                <Badge variant="outline" className="text-xs">{v.categoryName}</Badge>
                {v.accessType === "vip" && <Badge variant="vip" className="text-xs">VIP</Badge>}
                {v.accessType === "visitor" && <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">مجاني</Badge>}
              </div>
              <h3 className="font-bold line-clamp-1 mb-1">{v.title}</h3>
              <div className="mt-auto pt-4 flex gap-2 border-t border-white/5">
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => handleOpen(v)}><Edit className="w-3 h-3 ml-1" /> تعديل</Button>
                <Button variant="destructive" size="icon" onClick={() => handleDelete(v.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'تعديل الفيديو' : 'إضافة فيديو جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>العنوان</Label>
                <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>الوصف</Label>
                <textarea className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </div>

              {/* Thumbnail */}
              <div className="space-y-3 col-span-2">
                <Label>صورة الغلاف (Thumbnail)</Label>

                {/* Direct URL input */}
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    className="text-left text-sm"
                    placeholder="الصق رابط صورة مباشر (https://...) أو ارفع ملف أدناه"
                    value={formData.thumbnailUrl || ""}
                    onChange={e => {
                      const v = e.target.value;
                      setFormData(prev => ({ ...prev, thumbnailUrl: v }));
                      setPreviewUrl(v);
                    }}
                  />
                  {formData.thumbnailUrl && (
                    <button onClick={removeThumbnail} className="shrink-0 w-9 h-9 rounded-md bg-white/5 border border-white/10 text-foreground/50 hover:text-destructive hover:border-destructive/40 flex items-center justify-center transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Image preview */}
                {previewUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
                    <img
                      src={previewUrl}
                      alt="preview"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {uploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                ) : null}

                {/* File upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl p-4 text-foreground/40 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50 text-sm"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? "جاري الرفع..." : "أو ارفع صورة من جهازك (PNG, JPG, WEBP — 5MB)"}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label>رابط تضمين جوجل درايف (Embed URL)</Label>
                <Input dir="ltr" className="text-left" value={formData.driveEmbedUrl} onChange={e => setFormData({ ...formData, driveEmbedUrl: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="flex items-center gap-1.5">
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-semibold">VIP</span>
                  رابط تحميل البرنامج (للـ VIP فقط)
                </Label>
                <Input dir="ltr" className="text-left" placeholder="https://..." value={formData.softwareLink ?? ""} onChange={e => setFormData({ ...formData, softwareLink: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <select className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm" value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: parseInt(e.target.value) })}>
                  <option value={0} disabled>اختر تصنيف</option>
                  {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><ListVideo className="w-3.5 h-3.5 text-primary" /> السلسلة (اختياري)</Label>
                  <button
                    type="button"
                    onClick={() => { setQuickPlaylist(q => !q); setQuickPlaylistCategoryId(formData.categoryId || categories?.[0]?.id || 0); setQuickPlaylistTitle(""); }}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> سلسلة جديدة
                  </button>
                </div>

                {/* Quick create playlist */}
                {quickPlaylist && (
                  <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                    <p className="text-xs text-primary font-medium">إنشاء سلسلة جديدة سريعاً</p>
                    <Input
                      placeholder="اسم السلسلة مثلاً: Full Bypass 5S to X"
                      value={quickPlaylistTitle}
                      onChange={e => setQuickPlaylistTitle(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <select className="flex h-9 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                      value={quickPlaylistCategoryId}
                      onChange={e => setQuickPlaylistCategoryId(parseInt(e.target.value))}>
                      <option value={0} disabled>اختر التصنيف</option>
                      {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleQuickCreatePlaylist}
                        disabled={!quickPlaylistTitle || !quickPlaylistCategoryId || creatingPlaylist}>
                        {creatingPlaylist ? <Loader2 className="w-3 h-3 animate-spin" /> : "إنشاء وتحديد"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setQuickPlaylist(false)}>إلغاء</Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <select className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={formData.playlistId ?? ""}
                    onChange={e => setFormData({ ...formData, playlistId: e.target.value ? parseInt(e.target.value) : null })}>
                    <option value="">بدون سلسلة</option>
                    {playlists?.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <Input type="number" min="1" placeholder="رقم الجزء: 1، 2، 3..."
                    value={formData.partNumber ?? ""}
                    disabled={!formData.playlistId}
                    onChange={e => setFormData({ ...formData, partNumber: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
                {formData.playlistId && (
                  <p className="text-xs text-muted-foreground">أدخل رقم الجزء: 1 للأول، 2 للثاني، وهكذا</p>
                )}
              </div>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>مستوى الوصول</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={formData.accessType || "normal"}
                    onChange={e => {
                      const at = e.target.value as "visitor" | "normal" | "vip";
                      setFormData({ ...formData, accessType: at, isVipOnly: at === "vip" });
                    }}
                  >
                    <option value="visitor">زائر (مجاني للجميع)</option>
                    <option value="normal">عادي (مشتركون فقط)</option>
                    <option value="vip">VIP (حسابات VIP فقط)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isVisible} onChange={e => setFormData({ ...formData, isVisible: e.target.checked })} className="rounded bg-black border-white/20 text-primary w-4 h-4" />
                  <span className="text-sm">مرئي للطلاب</span>
                </label>
              </div>
            </div>
            <Button className="w-full mt-4" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending || uploading}>
              {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
