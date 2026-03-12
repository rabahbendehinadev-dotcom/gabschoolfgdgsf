import { useState } from "react";
import { useGetAdminVideos, useCreateVideo, useUpdateVideo, useDeleteVideo, useGetAdminCategories } from "@workspace/api-client-react/src/generated/api";
import { AdminVideo, CreateVideoInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Video as VideoIcon } from "lucide-react";

export function AdminVideos() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  
  const reqOpts = { request: getAdminAuthHeaders() };
  const { data: videos, refetch } = useGetAdminVideos(reqOpts);
  const { data: categories } = useGetAdminCategories(reqOpts);
  
  const createMut = useCreateVideo({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateVideo({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteVideo({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const defaultForm = { title: "", description: "", thumbnailUrl: "", driveEmbedUrl: "", categoryId: 0, isVipOnly: false, isVisible: true };
  const [formData, setFormData] = useState<CreateVideoInput>(defaultForm as any);

  const handleOpen = (video?: AdminVideo) => {
    if (video) {
      setEditingId(video.id);
      setFormData({
        title: video.title, description: video.description, thumbnailUrl: video.thumbnailUrl,
        driveEmbedUrl: video.driveEmbedUrl, categoryId: video.categoryId, isVipOnly: video.isVipOnly, isVisible: video.isVisible
      });
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
      toast({ title: "تم الحفظ بنجاح" });
      setIsOpen(false);
      refetch();
    }).catch(() => toast({ variant: "destructive", title: "حدث خطأ" }));
  };

  const handleDelete = (id: number) => {
    if(!confirm("حذف الفيديو؟")) return;
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
              <img src={v.thumbnailUrl} className="w-full h-full object-cover opacity-80" alt={v.title} />
              {!v.isVisible && <div className="absolute inset-0 bg-background/80 flex items-center justify-center font-bold text-destructive backdrop-blur-sm">مخفي</div>}
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex gap-2 mb-2">
                <Badge variant="outline" className="text-xs">{v.categoryName}</Badge>
                {v.isVipOnly && <Badge variant="vip" className="text-xs">VIP</Badge>}
              </div>
              <h3 className="font-bold line-clamp-1 mb-1">{v.title}</h3>
              <div className="mt-auto pt-4 flex gap-2 border-t border-white/5">
                <Button variant="secondary" className="flex-1 text-xs" onClick={() => handleOpen(v)}><Edit className="w-3 h-3 ml-1"/> تعديل</Button>
                <Button variant="destructive" size="icon" onClick={() => handleDelete(v.id)}><Trash2 className="w-4 h-4"/></Button>
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
                <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>الوصف</Label>
                <textarea className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>رابط الصورة (Thumbnail)</Label>
                <Input dir="ltr" className="text-left" value={formData.thumbnailUrl} onChange={e => setFormData({...formData, thumbnailUrl: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>رابط تضمين جوجل درايف (Embed URL)</Label>
                <Input dir="ltr" className="text-left" value={formData.driveEmbedUrl} onChange={e => setFormData({...formData, driveEmbedUrl: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <select className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm" value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: parseInt(e.target.value)})}>
                  <option value={0} disabled>اختر تصنيف</option>
                  {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-4 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isVipOnly} onChange={e => setFormData({...formData, isVipOnly: e.target.checked})} className="rounded bg-black border-white/20 text-primary w-4 h-4" />
                  <span className="text-sm">خاص بحسابات VIP فقط</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isVisible} onChange={e => setFormData({...formData, isVisible: e.target.checked})} className="rounded bg-black border-white/20 text-primary w-4 h-4" />
                  <span className="text-sm">مرئي للطلاب</span>
                </label>
              </div>
            </div>
            <Button className="w-full mt-4" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
