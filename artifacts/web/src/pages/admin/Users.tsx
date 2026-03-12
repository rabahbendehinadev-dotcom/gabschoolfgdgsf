import { useState } from "react";
import { useGetAdminUsers, useUpdateAdminUser, useResetUserIp } from "@workspace/api-client-react/src/generated/api";
import { AdminUser, UpdateUserInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Search, Edit, RefreshCw, ShieldOff, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function AdminUsers() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const { data: users, refetch } = useGetAdminUsers({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut = useResetUserIp({ request: getAdminAuthHeaders() });

  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState<UpdateUserInput>({});

  const filtered = users?.filter(u => u.username.includes(search) || u.email.includes(search));

  const handleEdit = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      isActive: user.isActive,
    });
  };

  const handleSave = () => {
    if (!editingUser) return;
    updateMut.mutate(
      { id: editingUser.id, data: formData },
      {
        onSuccess: () => {
          toast({ title: "تم الحفظ" });
          setEditingUser(null);
          refetch();
        }
      }
    );
  };

  const handleResetIp = (id: number) => {
    if(!confirm("هل أنت متأكد من تصفير IP هذا المستخدم؟")) return;
    resetIpMut.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "تم تصفير IP" });
        refetch();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">إدارة المستخدمين</h1>
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الإيميل..." className="pl-4 pr-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="text-xs text-muted-foreground bg-white/5 border-b border-white/10 uppercase">
              <tr>
                <th className="px-6 py-4">المستخدم</th>
                <th className="px-6 py-4">الحساب</th>
                <th className="px-6 py-4">الاشتراك</th>
                <th className="px-6 py-4">تاريخ التسجيل</th>
                <th className="px-6 py-4">IP الحالي</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map(user => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <div className="font-bold">{user.username}</div>
                    <div className="text-muted-foreground text-xs">{user.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={user.accountType === 'vip' ? 'vip' : 'secondary'}>{user.accountType}</Badge>
                  </td>
                  <td className="px-6 py-4">{user.subscriptionType}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4 text-xs font-mono text-left">{user.ipAddress || 'لم يسجل دخول'}</td>
                  <td className="px-6 py-4">
                    {user.isActive ? <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/20 border-0">نشط</Badge> : <Badge variant="destructive">موقوف</Badge>}
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="تصفير IP" onClick={() => handleResetIp(user.id)} disabled={!user.ipAddress}>
                      <RefreshCw className="w-4 h-4 text-blue-400" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المستخدم {editingUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>نوع الحساب</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                value={formData.accountType}
                onChange={e => setFormData({...formData, accountType: e.target.value as any})}
              >
                <option value="normal">عادي</option>
                <option value="vip">VIP</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>خطة الاشتراك</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                value={formData.subscriptionType}
                onChange={e => setFormData({...formData, subscriptionType: e.target.value as any})}
              >
                <option value="demo">تجريبي</option>
                <option value="annual">سنوي</option>
                <option value="lifetime">مدى الحياة</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>حالة الحساب</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                value={formData.isActive ? "true" : "false"}
                onChange={e => setFormData({...formData, isActive: e.target.value === "true"})}
              >
                <option value="true">نشط</option>
                <option value="false">موقوف</option>
              </select>
            </div>
            <Button className="w-full mt-4" onClick={handleSave} disabled={updateMut.isPending}>
              حفظ التغييرات
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
