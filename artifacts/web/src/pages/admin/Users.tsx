import { useState } from "react";
import { useGetAdminUsers, useUpdateAdminUser, useResetUserIp, useDeleteAdminUser } from "@workspace/api-client-react/src/generated/api";
import { AdminUser, UpdateUserInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Search, Edit, RefreshCw, ShieldOff, ShieldCheck, Trash2, MessageCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

const API_BASE = "";

function normalizeWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "213" + digits.slice(1);
  if (!digits.startsWith("213") && digits.length <= 10) return "213" + digits;
  return digits;
}

export function AdminUsers() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const { data: users, refetch } = useGetAdminUsers({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut = useResetUserIp({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteAdminUser({ request: getAdminAuthHeaders() });

  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState<UpdateUserInput>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const filtered = users?.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      isActive: user.isActive,
      phone: (user as typeof user & { phone?: string }).phone ?? undefined,
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
    if (!confirm("هل أنت متأكد من تصفير IP هذا المستخدم؟")) return;
    resetIpMut.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "تم تصفير IP" });
        refetch();
      }
    });
  };

  const handleBlock = async (user: AdminUser) => {
    const action = user.isActive ? "حظر" : "رفع الحظر عن";
    if (!confirm(`هل أنت متأكد من ${action} ${user.username}؟`)) return;
    setLoadingId(user.id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/block`, {
        method: "POST",
        headers: headers as HeadersInit,
      });
      if (!res.ok) throw new Error("فشل الطلب");
      toast({ title: user.isActive ? "تم حظر المستخدم" : "تم رفع الحظر" });
      refetch();
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = (user: AdminUser) => {
    if (!confirm(`هل أنت متأكد من حذف حساب ${user.username} نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setLoadingId(user.id);
    deleteMut.mutate(
      { id: user.id },
      {
        onSuccess: () => {
          toast({ title: "تم حذف المستخدم" });
          refetch();
          setLoadingId(null);
        },
        onError: () => {
          toast({ title: "حدث خطأ", variant: "destructive" });
          setLoadingId(null);
        },
      }
    );
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
                <th className="px-4 py-4">المستخدم</th>
                <th className="px-4 py-4">الهاتف</th>
                <th className="px-4 py-4">الحساب</th>
                <th className="px-4 py-4">الاشتراك</th>
                <th className="px-4 py-4">تاريخ التسجيل</th>
                <th className="px-4 py-4">IP</th>
                <th className="px-4 py-4">الحالة</th>
                <th className="px-4 py-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map(user => {
                const phone = (user as typeof user & { phone?: string }).phone;
                return (
                  <tr key={user.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${!user.isActive ? "opacity-60" : ""}`}>
                    <td className="px-4 py-4">
                      <div className="font-bold">{user.username}</div>
                      <div className="text-muted-foreground text-xs">{user.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      {phone ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-foreground/80" dir="ltr">{phone}</span>
                          <a
                            href={`https://wa.me/${normalizeWhatsApp(phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="فتح واتساب"
                          >
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-500/15 hover:bg-green-500/30 text-green-400 hover:text-green-300 transition-all border border-green-500/20">
                              <MessageCircle className="w-3.5 h-3.5" />
                            </span>
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={user.accountType === "vip" ? "vip" : "secondary"}>{user.accountType}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div>{user.subscriptionType}</div>
                      {user.subscriptionExpiresAt && (
                        <div className="text-xs text-muted-foreground">{formatDate(user.subscriptionExpiresAt)}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-4 text-left">
                      {user.ipAddress ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground shrink-0">١</span>
                            <span className="text-xs font-mono">{user.ipAddress}</span>
                          </div>
                          {(user as typeof user & { ipAddress2?: string }).ipAddress2 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground shrink-0">٢</span>
                              <span className="text-xs font-mono">{(user as typeof user & { ipAddress2?: string }).ipAddress2}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {user.isActive
                        ? <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/20 border-0">نشط</Badge>
                        : <Badge variant="destructive">محظور</Badge>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="icon" title="تعديل" onClick={() => handleEdit(user)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="تصفير IP" onClick={() => handleResetIp(user.id)} disabled={!user.ipAddress || loadingId === user.id}>
                          <RefreshCw className="w-4 h-4 text-blue-400" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={user.isActive ? "حظر المستخدم" : "رفع الحظر"}
                          onClick={() => handleBlock(user)}
                          disabled={loadingId === user.id}
                        >
                          {user.isActive
                            ? <ShieldOff className="w-4 h-4 text-yellow-400" />
                            : <ShieldCheck className="w-4 h-4 text-green-400" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="حذف المستخدم"
                          onClick={() => handleDelete(user)}
                          disabled={loadingId === user.id}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المستخدم: {editingUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>نوع الحساب</Label>
              <select
                className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                value={formData.accountType}
                onChange={e => setFormData({ ...formData, accountType: e.target.value as "vip" | "normal" })}
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
                onChange={e => setFormData({ ...formData, subscriptionType: e.target.value as "demo" | "annual" | "lifetime" })}
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
                onChange={e => setFormData({ ...formData, isActive: e.target.value === "true" })}
              >
                <option value="true">نشط</option>
                <option value="false">موقوف</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف / واتساب</Label>
              <Input
                dir="ltr"
                className="text-left"
                placeholder="0551234567"
                value={formData.phone ?? ""}
                onChange={e => setFormData({ ...formData, phone: e.target.value || undefined })}
              />
              <p className="text-xs text-muted-foreground">مثال: 0551234567 أو 213551234567</p>
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
