import { useState, useEffect } from "react";
import { useGetAdminUsers, useUpdateAdminUser, useResetUserIp, useDeleteAdminUser, useGetAdminNotificationStats, useSendUserTestPush, useGetAdminPlaylists } from "@workspace/api-client-react/src/generated/api";
import { AdminUser, UpdateUserInput, GetAdminUsersNotifications } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useToast } from "@/hooks/use-toast";
import { Search, Edit, RefreshCw, ShieldOff, ShieldCheck, Trash2, MessageCircle, KeyRound, Eye, EyeOff, BellRing, BellOff, Clock, Send, Loader2, GraduationCap, Check } from "lucide-react";
import { formatDate } from "@/lib/utils";

const API_BASE = "";

// New phone numbers are already saved as full E.164 digits (with country
// code) via libphonenumber-js. This fallback only exists so legacy
// Algeria-only records (stored as local "0X..." or bare "213X...") still
// produce a working wa.me link.
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
  const testPushMut = useSendUserTestPush({ request: getAdminAuthHeaders() });

  const { data: allPlaylists } = useGetAdminPlaylists({ request: getAdminAuthHeaders() });

  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState<UpdateUserInput>({});
  const [userCourseIds, setUserCourseIds] = useState<number[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [resetPwUser, setResetPwUser] = useState<AdminUser | null>(null);
  const [resetPwForm, setResetPwForm] = useState({ newPassword: "", confirmPassword: "" });
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError] = useState("");
  const [resetPwSuccess, setResetPwSuccess] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetIpConfirmId, setResetIpConfirmId] = useState<number | null>(null);

  const filtered = users?.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleTestPush = async (user: AdminUser) => {
    setTestingId(user.id);
    try {
      const r = await testPushMut.mutateAsync({ id: user.id });
      if (r.attempted === 0) {
        toast({
          title: "لا يوجد اشتراك فعّال",
          description: `${user.username} لا يملك جهازًا مُسجّلًا — اطلب منه إعادة تفعيل الإشعارات.`,
          variant: "destructive",
        });
      } else if (r.success > 0) {
        toast({
          title: "تم إرسال الإشعار التجريبي ✅",
          description: `وصل إلى ${r.success} من ${r.attempted} جهاز.`,
        });
      } else {
        toast({
          title: "فشل وصول الإشعار",
          description: "رفضت الأجهزة المُسجّلة الإشعار — اطلب من المستخدم إعادة التفعيل.",
          variant: "destructive",
        });
      }
      refetch();
    } catch {
      toast({ title: "تعذّر إرسال الإشعار التجريبي", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleEdit = async (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      isActive: user.isActive,
      phone: (user as typeof user & { phone?: string }).phone ?? undefined,
    });
    setUserCourseIds([]);
    setCoursesLoading(true);
    try {
      const headers = getAdminAuthHeaders().headers as Record<string, string>;
      const res = await fetch(`/api/admin/users/${user.id}/courses`, { headers });
      if (res.ok) setUserCourseIds(await res.json());
    } catch { /* ignore */ }
    finally { setCoursesLoading(false); }
  };

  const toggleCourse = (id: number) => {
    setUserCourseIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      const headers = getAdminAuthHeaders().headers as Record<string, string>;
      await fetch(`/api/admin/users/${editingUser.id}/courses`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(userCourseIds),
      });
    } catch { /* ignore */ }
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
    setResetIpConfirmId(id);
  };

  const confirmResetIp = () => {
    if (!resetIpConfirmId) return;
    resetIpMut.mutate({ id: resetIpConfirmId }, {
      onSuccess: () => {
        toast({ title: "تم تصفير IP" });
        refetch();
        setResetIpConfirmId(null);
      },
      onError: () => {
        toast({ title: "حدث خطأ", variant: "destructive" });
        setResetIpConfirmId(null);
      },
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

      {/* ── Mobile card list (hidden on md+) ── */}
      <div className="md:hidden space-y-3">
        {filtered?.map(user => {
          const phone = (user as typeof user & { phone?: string }).phone;
          return (
            <Card key={user.id} className={`border-white/5 p-4 space-y-3 ${!user.isActive ? "opacity-60" : ""}`}>
              {/* Name + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{user.username}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {user.isActive
                    ? <Badge className="bg-green-500/20 text-green-500 border-0 text-xs">نشط</Badge>
                    : <Badge variant="destructive" className="text-xs">محظور</Badge>}
                </div>
              </div>

              {/* Account + subscription */}
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant={user.accountType === "vip" ? "vip" : "secondary"} className="text-xs">{user.accountType}</Badge>
                <span className="text-xs text-muted-foreground">{user.subscriptionType}</span>
                {user.subscriptionExpiresAt && (
                  <span className="text-xs text-muted-foreground">· {formatDate(user.subscriptionExpiresAt)}</span>
                )}
              </div>

              {/* Phone */}
              {phone ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground/80 flex-1" dir="ltr">{phone}</span>
                  <a href={`https://wa.me/${normalizeWhatsApp(phone)}`} target="_blank" rel="noopener noreferrer">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/15 hover:bg-green-500/30 text-green-400 border border-green-500/20 transition-all">
                      <MessageCircle className="w-4 h-4" />
                    </span>
                  </a>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">لا يوجد رقم هاتف</div>
              )}

              {/* Date + push */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatDate(user.createdAt)}</span>
                {user.pushState === "enabled" && (
                  <Badge className="bg-green-500/15 text-green-400 border-0 gap-1 text-xs"><BellRing className="w-3 h-3" /> إشعارات</Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-1 pt-1 border-t border-white/5">
                <Button variant="ghost" size="icon" title="تعديل" className="h-9 w-9" onClick={() => handleEdit(user)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" title="تغيير كلمة المرور" className="h-9 w-9" onClick={() => { setResetPwUser(user); setResetPwForm({ newPassword: "", confirmPassword: "" }); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); }}>
                  <KeyRound className="w-4 h-4 text-purple-400" />
                </Button>
                <Button variant="ghost" size="icon" title="تصفير IP" className="h-9 w-9" onClick={() => handleResetIp(user.id)} disabled={user.ipCount === 0 || loadingId === user.id}>
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                </Button>
                <Button variant="ghost" size="icon" title="إرسال إشعار تجريبي" className="h-9 w-9" onClick={() => handleTestPush(user)} disabled={testingId === user.id}>
                  {testingId === user.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    : <Send className="w-4 h-4 text-emerald-400" />}
                </Button>
                <Button variant="ghost" size="icon" title={user.isActive ? "حظر" : "رفع الحظر"} className="h-9 w-9" onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                  {user.isActive
                    ? <ShieldOff className="w-4 h-4 text-yellow-400" />
                    : <ShieldCheck className="w-4 h-4 text-green-400" />}
                </Button>
                <Button variant="ghost" size="icon" title="حذف" className="h-9 w-9" onClick={() => handleDelete(user)} disabled={loadingId === user.id}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </Card>
          );
        })}
        {filtered?.length === 0 && (
          <div className="text-center text-muted-foreground py-10 text-sm">لا يوجد مستخدمون</div>
        )}
      </div>

      {/* ── Desktop table (hidden on mobile) ── */}
      <Card className="border-white/5 overflow-hidden hidden md:block">
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
                <th className="px-4 py-4 sticky left-0 z-10 border-r border-gray-200" style={{ backgroundColor: "var(--color-card)" }}>إجراءات</th>
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
                      <div className="flex flex-col gap-1">
                        {user.pushState === "enabled" ? (
                          <Badge className="bg-green-500/15 text-green-400 hover:bg-green-500/15 border-0 gap-1">
                            <BellRing className="w-3 h-3" /> مفعّلة
                          </Badge>
                        ) : user.pushState === "denied" ? (
                          <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/15 border-0 gap-1" title="المستخدم رفض إذن الإشعارات في المتصفح">
                            <BellOff className="w-3 h-3" /> رُفِض الإذن
                          </Badge>
                        ) : user.pushState === "broken" ? (
                          <Badge className="bg-red-500/15 text-red-400 hover:bg-red-500/15 border-0 gap-1" title="كان مشتركًا لكن توقّف وصول الإشعارات — بحاجة لإعادة التفعيل">
                            <BellOff className="w-3 h-3" /> معطّلة
                          </Badge>
                        ) : user.pushState === "missing" ? (
                          <Badge className="bg-orange-500/15 text-orange-400 hover:bg-orange-500/15 border-0 gap-1" title="مُنح الإذن لكن لا يوجد اشتراك صالح — سيُعاد إنشاؤه عند الدخول التالي">
                            <BellOff className="w-3 h-3" /> ناقصة
                          </Badge>
                        ) : (
                          <Badge className="bg-white/5 text-muted-foreground border-0 gap-1" title="لم يُفعّل الإشعارات بعد / غير مدعوم">
                            <BellOff className="w-3 h-3" /> غير مفعّلة
                          </Badge>
                        )}
                        {user.lastPushTestAt && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="آخر إشعار تجريبي">
                            <Send className="w-2.5 h-2.5" /> {formatDate(user.lastPushTestAt)}
                          </span>
                        )}
                      </div>
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
                    <td className="px-4 py-4 sticky left-0 z-10 border-r border-gray-200" style={{ backgroundColor: "var(--color-card)" }}>
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
                        <Button variant="ghost" size="icon" title="إرسال إشعار تجريبي" onClick={() => handleTestPush(user)} disabled={testingId === user.id}>
                          {testingId === user.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            : <Send className="w-4 h-4 text-emerald-400" />}
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={formData.isActive ? "true" : "false"}
                onChange={e => setFormData({ ...formData, isActive: e.target.value === "true" })}
              >
                <option value="true">نشط</option>
                <option value="false">موقوف</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف / واتساب</Label>
              <PhoneNumberInput
                value={formData.phone ?? undefined}
                onChange={value => setFormData({ ...formData, phone: value || undefined })}
                placeholder="5X XX XX XX XX"
              />
              <p className="text-xs text-muted-foreground">اختر الدولة وأدخل رقمًا دوليًا صحيحًا</p>
            </div>

            {/* Courses section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <GraduationCap className="w-4 h-4 text-muted-foreground" />
                الدورات الممنوحة
              </Label>
              {coursesLoading ? (
                <div className="flex h-10 items-center justify-center rounded-md border border-input bg-background">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : !allPlaylists || allPlaylists.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">لا توجد دورات متاحة</p>
              ) : (
                <div className="rounded-md border border-gray-200 bg-white max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {allPlaylists.map(pl => {
                    const selected = userCourseIds.includes(pl.id);
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => toggleCourse(pl.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-right transition-colors ${selected ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-gray-50"}`}
                      >
                        <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-gray-300"}`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="flex-1 truncate text-gray-800 font-medium">{pl.title || `دورة #${pl.id}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {userCourseIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{userCourseIds.length} دورة محددة</p>
              )}
            </div>

            <Button className="w-full mt-4" onClick={handleSave} disabled={updateMut.isPending}>
              حفظ التغييرات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetIpConfirmId !== null} onOpenChange={(o) => { if (!o) setResetIpConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد تصفير IP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من تصفير عناوين IP لهذا المستخدم؟ سيتمكن من تسجيل الدخول من أي جهاز جديد.
            </p>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={confirmResetIp}
                disabled={resetIpMut.isPending}
              >
                {resetIpMut.isPending ? "جاري التصفير..." : "تأكيد التصفير"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setResetIpConfirmId(null)}
                disabled={resetIpMut.isPending}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
