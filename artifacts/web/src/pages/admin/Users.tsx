import { useState } from "react";
import { useGetAdminUsers, useUpdateAdminUser, useResetUserIp, useDeleteAdminUser, useGetAdminNotificationStats } from "@workspace/api-client-react/src/generated/api";
import { AdminUser, UpdateUserInput, GetAdminUsersNotifications } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Search, Edit, RefreshCw, ShieldOff, ShieldCheck, Trash2, MessageCircle, KeyRound, Eye, EyeOff, BellRing, BellOff, Clock } from "lucide-react";
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
  const [notifFilter, setNotifFilter] = useState<GetAdminUsersNotifications | "all">("all");
  const { data: users, refetch } = useGetAdminUsers(
    notifFilter === "all" ? undefined : { notifications: notifFilter },
    { request: getAdminAuthHeaders() },
  );
  const { data: notifStats } = useGetAdminNotificationStats({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut = useResetUserIp({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteAdminUser({ request: getAdminAuthHeaders() });

  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState<UpdateUserInput>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [resetPwUser, setResetPwUser] = useState<AdminUser | null>(null);
  const [resetPwForm, setResetPwForm] = useState({ newPassword: "", confirmPassword: "" });
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError] = useState("");
  const [resetPwSuccess, setResetPwSuccess] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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

  const handleResetPassword = async () => {
    setResetPwError("");
    setResetPwSuccess("");
    if (resetPwForm.newPassword !== resetPwForm.confirmPassword) {
      setResetPwError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (resetPwForm.newPassword.length < 6) {
      setResetPwError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setResetPwLoading(true);
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE}/api/admin/users/${resetPwUser!.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPwForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "حدث خطأ");
      setResetPwSuccess("تم تغيير كلمة المرور بنجاح");
      setResetPwForm({ newPassword: "", confirmPassword: "" });
    } catch (err: unknown) {
      setResetPwError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setResetPwLoading(false);
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-white/5 text-foreground border-0 px-3 py-1.5 text-xs">
            الإجمالي: <span className="font-bold mr-1">{notifStats?.total ?? "—"}</span>
          </Badge>
          <Badge className="bg-green-500/15 text-green-400 hover:bg-green-500/15 border-0 px-3 py-1.5 text-xs gap-1">
            <BellRing className="w-3 h-3" /> مفعّلة: <span className="font-bold mr-1">{notifStats?.enabled ?? "—"}</span>
          </Badge>
          <Badge className="bg-red-500/15 text-red-400 hover:bg-red-500/15 border-0 px-3 py-1.5 text-xs gap-1">
            <BellOff className="w-3 h-3" /> غير مفعّلة: <span className="font-bold mr-1">{notifStats?.disabled ?? "—"}</span>
          </Badge>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          {([
            { v: "all", label: "الكل" },
            { v: "enabled", label: "مفعّلة" },
            { v: "disabled", label: "غير مفعّلة" },
          ] as const).map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setNotifFilter(opt.v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                notifFilter === opt.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
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
                <th className="px-4 py-4">الإشعارات</th>
                <th className="px-4 py-4">آخر إشعار</th>
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
                      {user.accountType === "vip" ? (
                        <div className="space-y-1">
                          <Badge className={`border-0 font-mono ${user.ipCount >= 2 ? "bg-red-500/15 text-red-400 hover:bg-red-500/15" : "bg-amber-500/15 text-amber-500 hover:bg-amber-500/15"}`}>
                            {user.ipCount} / 2
                          </Badge>
                          {user.ipAddress && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground shrink-0">١</span>
                              <span className="text-xs font-mono">{user.ipAddress}</span>
                            </div>
                          )}
                          {user.ipAddress2 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground shrink-0">٢</span>
                              <span className="text-xs font-mono">{user.ipAddress2}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs" title="غير مقيّد — التقييد للحسابات VIP فقط">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {user.pushEnabled ? (
                        <Badge className="bg-green-500/15 text-green-400 hover:bg-green-500/15 border-0 gap-1">
                          <BellRing className="w-3 h-3" /> مفعّلة
                        </Badge>
                      ) : user.pushPermission === "denied" ? (
                        <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/15 border-0 gap-1" title="المستخدم رفض إذن الإشعارات في المتصفح">
                          <BellOff className="w-3 h-3" /> رُفِض الإذن
                        </Badge>
                      ) : user.pushSupported ? (
                        <Badge className="bg-red-500/15 text-red-400 hover:bg-red-500/15 border-0 gap-1">
                          <BellOff className="w-3 h-3" /> غير مفعّلة
                        </Badge>
                      ) : (
                        <Badge className="bg-white/5 text-muted-foreground border-0 gap-1" title="جهاز/متصفح لا يدعم الإشعارات">
                          <BellOff className="w-3 h-3" /> غير مدعومة
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-muted-foreground">
                      {user.lastNotifiedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDate(user.lastNotifiedAt)}
                        </span>
                      ) : "—"}
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
                        <Button variant="ghost" size="icon" title="تغيير كلمة المرور" onClick={() => { setResetPwUser(user); setResetPwForm({ newPassword: "", confirmPassword: "" }); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); }}>
                          <KeyRound className="w-4 h-4 text-purple-400" />
                        </Button>
                        <Button variant="ghost" size="icon" title="تصفير IP" onClick={() => handleResetIp(user.id)} disabled={user.ipCount === 0 || loadingId === user.id}>
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

      <Dialog open={!!resetPwUser} onOpenChange={(o) => { if (!o) { setResetPwUser(null); setResetPwError(""); setResetPwSuccess(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور: {resetPwUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showResetPw ? "text" : "password"}
                  placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                  value={resetPwForm.newPassword}
                  onChange={e => setResetPwForm({ ...resetPwForm, newPassword: e.target.value })}
                  className="pl-10"
                />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowResetPw(v => !v)}>
                  {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>تأكيد كلمة المرور</Label>
              <div className="relative">
                <Input
                  type={showResetConfirm ? "text" : "password"}
                  placeholder="أعد إدخال كلمة المرور"
                  value={resetPwForm.confirmPassword}
                  onChange={e => setResetPwForm({ ...resetPwForm, confirmPassword: e.target.value })}
                  className="pl-10"
                />
                <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowResetConfirm(v => !v)}>
                  {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {resetPwError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{resetPwError}</p>
            )}
            {resetPwSuccess && (
              <p className="text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">{resetPwSuccess}</p>
            )}
            <Button className="w-full" onClick={handleResetPassword} disabled={resetPwLoading}>
              {resetPwLoading ? "جاري الحفظ..." : "تغيير كلمة المرور"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                onChange={e => setFormData({ ...formData, subscriptionType: e.target.value as "demo" | "monthly" | "annual" | "lifetime" })}
              >
                <option value="demo">تجريبي</option>
                <option value="monthly">شهري</option>
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
