import { useState } from "react";
import { useGetAdminCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@workspace/api-client-react/src/generated/api";
import { Category, CreateCategoryInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FolderTree } from "lucide-react";

export function AdminCategories() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  
  const reqOpts = { request: getAdminAuthHeaders() };
  const { data: categories, refetch } = useGetAdminCategories(reqOpts);
  
  const createMut = useCreateCategory({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateCategory({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteCategory({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CreateCategoryInput>({ name: "", slug: "", icon: "" });

  const handleOpen = (cat?: Category) => {
    if (cat) {
      setEditingId(cat.id);
      setFormData({ name: cat.name, slug: cat.slug, icon: cat.icon || "" });
    } else {
      setEditingId(null);
      setFormData({ name: "", slug: "", icon: "" });
    }
    setIsOpen(true);
  };

  const handleSave = () => {
    const action = editingId 
      ? updateMut.mutateAsync({ id: editingId, data: formData })
      : createMut.mutateAsync({ data: formData });

    action.then(() => {
      toast({ title: "تم الحفظ" });
      setIsOpen(false);
      refetch();
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">تصنيفات الهواتف</h1>
        <Button onClick={() => handleOpen()}><Plus className="w-4 h-4 ml-2" /> إضافة تصنيف</Button>
      </div>

      <Card className="border-white/5">
        <table className="w-full text-sm text-right">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4">الاسم</th>
              <th className="px-6 py-4">الرابط (Slug)</th>
              <th className="px-6 py-4 w-32">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {categories?.map(c => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-6 py-4 font-bold flex items-center gap-2"><FolderTree className="w-4 h-4 text-primary" /> {c.name}</td>
                <td className="px-6 py-4 text-muted-foreground" dir="ltr">{c.slug}</td>
                <td className="px-6 py-4 flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleOpen(c)}><Edit className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                    if(confirm('حذف التصنيف؟')) deleteMut.mutate({id: c.id}, {onSuccess:()=>refetch()})
                  }}><Trash2 className="w-4 h-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'تعديل' : 'إضافة'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>الرابط الدائم (Slug)</Label>
              <Input dir="ltr" className="text-left" value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value})} />
            </div>
            <Button className="w-full mt-2" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
