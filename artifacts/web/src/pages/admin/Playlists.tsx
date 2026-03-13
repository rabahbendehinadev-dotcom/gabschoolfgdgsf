import { useState } from "react";
import {
  useGetAdminPlaylists, useCreatePlaylist, useUpdatePlaylist, useDeletePlaylist,
  useGetAdminCategories
} from "@workspace/api-client-react/src/generated/api";
import { Playlist, CreatePlaylistInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, ListVideo, Eye, EyeOff } from "lucide-react";

export function AdminPlaylists() {
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

  const defaultForm: CreatePlaylistInput = { title: "", description: "", categoryId: 0, sortOrder: 0, isVisible: true };
  const [formData, setFormData] = useState<CreatePlaylistInput>(defaultForm);

  const handleOpen = (playlist?: Playlist) => {
    if (playlist) {
      setEditingId(playlist.id);
      setFormData({ title: playlist.title, description: playlist.description, categoryId: playlist.categoryId, sortOrder: playlist.sortOrder, isVisible: playlist.isVisible });
    } else {
      setEditingId(null);
      setFormData({ ...defaultForm, categoryId: categories?.[0]?.id || 0 });
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: formData })
      : createMut.mutateAsync({ data: formData });

    action.then(() => {
      toast({ title: editingId ? "تم تحديث السلسلة" : "تم إنشاء السلسلة", className: "bg-green-600 text-white border-none" });
      refetch();
      setIsOpen(false);
    }).catch(() => toast({ variant: "destructive", title: "حدث خطأ" }));
  };

  const handleDelete = (id: number) => {
    if (!confirm("هل تريد حذف هذه السلسلة؟ سيتم فصل الفيديوهات المرتبطة بها.")) return;
    deleteMut.mutate({ id }, {
      onSuccess: () => { toast({ title: "تم الحذف" }); refetch(); },
      onError: () => toast({ variant: "destructive", title: "فشل الحذف" }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إدارة سلاسل الدروس</h1>
          <p className="text-muted-foreground text-sm mt-1">جمّع الفيديوهات في سلاسل (Part 1, 2, 3...)</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2">
          <Plus className="w-4 h-4" /> سلسلة جديدة
        </Button>
      </div>

      <div className="grid gap-4">
        {(playlists ?? []).map(playlist => (
          <Card key={playlist.id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <ListVideo className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg">{playlist.title}</h3>
                    <Badge variant="secondary" className="text-xs">{playlist.categoryName}</Badge>
                    {!playlist.isVisible && <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-400"><EyeOff className="w-3 h-3 ml-1" /> مخفي</Badge>}
                    <Badge variant="outline" className="text-xs">{playlist.videos.length} فيديو</Badge>
                  </div>
                  {playlist.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-1">{playlist.description}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {playlist.videos.map(v => (
                      <span key={v.id} className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-0.5">
                        {v.partNumber ? `الجزء ${v.partNumber}` : "—"} · {v.title}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => handleOpen(playlist)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(playlist.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {(playlists ?? []).length === 0 && (
          <Card className="glass-card p-12 text-center">
            <ListVideo className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">لا توجد سلاسل بعد. أنشئ سلسلة وارتب فيها الفيديوهات.</p>
          </Card>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg bg-background border border-white/10">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل السلسلة" : "سلسلة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>اسم السلسلة</Label>
              <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="مثال: شرح فول بياس iPhone X" />
            </div>
            <div className="space-y-2">
              <Label>الوصف (اختياري)</Label>
              <textarea className="flex min-h-[70px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.description ?? ""} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <select className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                  value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: parseInt(e.target.value) })}>
                  <option value={0} disabled>اختر تصنيف</option>
                  {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>الترتيب</Label>
                <Input type="number" value={formData.sortOrder ?? 0} onChange={e => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="visible" checked={formData.isVisible ?? true}
                onChange={e => setFormData({ ...formData, isVisible: e.target.checked })}
                className="w-4 h-4 accent-primary" />
              <Label htmlFor="visible">مرئية للمستخدمين</Label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1" disabled={!formData.title || !formData.categoryId}>
                {editingId ? "حفظ التغييرات" : "إنشاء السلسلة"}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
