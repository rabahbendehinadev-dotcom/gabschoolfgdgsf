import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetAdminUsers, useUpdateAdminUser, useResetUserIp,
  useDeleteAdminUser, useGetAdminNotificationStats,
  useSendUserTestPush, useGetAdminPlaylists,
} from "@workspace/api-client-react/src/generated/api";
import type { AdminUser, UpdateUserInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useToast } from "@/hooks/use-toast";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  Search, Edit, RefreshCw, ShieldOff, ShieldCheck, Trash2,
  MessageCircle, KeyRound, Eye, EyeOff, BellRing, BellOff,
  Clock, Send, Loader2, GraduationCap, Check, ChevronUp,
  ChevronDown, ChevronsUpDown, Users, Crown, XCircle,
  AlertTriangle, UserCheck, UserX, Sparkles, BookOpen,
  Filter, CheckSquare, Square, MoreHorizontal, Download,
  RefreshCcw, X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type NotifFilter = "all" | "enabled" | "disabled";

type ExtendedAdminUser = AdminUser & {
  fullName: string | null;
  lastVisitAt: string | null;
  deviceCount: number;
  courses: { playlistId: number; title: string }[];
  subscriptionStartedAt: string | null;
};

interface UserStats {
  total: number;
  vip: number;
  expired: number;
  expiringSoon: number;
  nonVip: number;
  newUsers: number;
  blocked: number;
  perCourse: { playlistId: number; title: string; count: number }[];
}

type StatusFilter = "all" | "vip" | "nonvip" | "expired" | "expiring" | "active" | "blocked" | "new";
type SortField = "createdAt" | "username" | "lastVisitAt" | "subscriptionExpiresAt";

const API_BASE = "";
const PAGE_SIZE = 25;

function normalizeWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "213" + digits.slice(1);
  if (!digits.startsWith("213") && digits.length <= 10) return "213" + digits;
  return digits;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `${mins}د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}س`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}ي`;
  const months = Math.floor(days / 30);
  return `${months}ش`;
}

function isActiveVip(u: ExtendedAdminUser) {
  return u.accountType === "vip" && (!u.subscriptionExpiresAt || new Date(u.subscriptionExpiresAt) > new Date());
}
function isExpiredVip(u: ExtendedAdminUser) {
  return u.accountType === "vip" && !!u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt) < new Date();
}
function isExpiringSoon(u: ExtendedAdminUser) {
  if (!u.subscriptionExpiresAt) return false;
  const exp = new Date(u.subscriptionExpiresAt);
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return exp >= now && exp <= soon;
}

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc" | "desc" }) {
  if (sortBy !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
}

const STATUS_FILTERS: { v: StatusFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { v: "all",      label: "الكل",             icon: <Users className="w-3.5 h-3.5" />,       color: "" },
  { v: "vip",      label: "VIP نشط",           icon: <Crown className="w-3.5 h-3.5" />,       color: "text-amber-400" },
  { v: "expired",  label: "منتهي",             icon: <XCircle className="w-3.5 h-3.5" />,     color: "text-red-400" },
  { v: "expiring", label: "قريب الانتهاء",     icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-orange-400" },
  { v: "nonvip",   label: "غير VIP",           icon: <UserCheck className="w-3.5 h-3.5" />,   color: "text-blue-400" },
  { v: "active",   label: "نشط",              icon: <CheckSquare className="w-3.5 h-3.5" />,  color: "text-green-400" },
  { v: "blocked",  label: "محظور",             icon: <UserX className="w-3.5 h-3.5" />,       color: "text-red-400" },
  { v: "new",      label: "مستخدم جديد",       icon: <Sparkles className="w-3.5 h-3.5" />,    color: "text-purple-400" },
];

const BULK_ACTIONS = [
  { v: "grant_vip",             label: "منح VIP (365 يوم)" },
  { v: "revoke_vip",            label: "إلغاء VIP" },
  { v: "extend_subscription",   label: "تمديد 30 يوم" },
  { v: "grant_course",          label: "منح دورة..." },
  { v: "revoke_course",         label: "إلغاء دورة..." },
  { v: "reset_ip",              label: "تصفير IP" },
  { v: "block",                 label: "حظر" },
  { v: "unblock",               label: "رفع الحظر" },
];

export function AdminUsers() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  // ── Core data ──────────────────────────────────────────────
  const { data: rawUsers, refetch, isFetching } = useGetAdminUsers(
    undefined, { request: getAdminAuthHeaders() },
  );
  const users = rawUsers as ExtendedAdminUser[] | undefined;
  const { data: notifStats } = useGetAdminNotificationStats({ request: getAdminAuthHeaders() });
  const { data: allPlaylists } = useGetAdminPlaylists({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut = useResetUserIp({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteAdminUser({ request: getAdminAuthHeaders() });
  const testPushMut = useSendUserTestPush({ request: getAdminAuthHeaders() });

  // ── Rich stats from dedicated endpoint ─────────────────────
  const [stats, setStats] = useState<UserStats | null>(null);
  const fetchStats = useCallback(() => {
    const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
    fetch("/api/admin/users/stats", { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, [getAdminAuthHeaders]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Filter / sort / page state ─────────────────────────────
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [notifFilter, setNotifFilter] = useState<GetAdminUsersNotifications | "all">("all");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── Modal states ───────────────────────────────────────────
  const [editingUser, setEditingUser] = useState<ExtendedAdminUser | null>(null);
  const [formData, setFormData] = useState<UpdateUserInput>({});
  const [userCourseIds, setUserCourseIds] = useState<number[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [resetPwUser, setResetPwUser] = useState<ExtendedAdminUser | null>(null);
  const [resetPwForm, setResetPwForm] = useState({ newPassword: "", confirmPassword: "" });
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError] = useState("");
  const [resetPwSuccess, setResetPwSuccess] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetIpConfirmId, setResetIpConfirmId] = useState<number | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);

  // ── Bulk action state ──────────────────────────────────────
  const [bulkAction, setBulkAction] = useState("");
  const [bulkPlaylistId, setBulkPlaylistId] = useState<number | "">("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Derived: filtered + sorted + paginated ─────────────────
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filtered = useMemo(() => {
    if (!users) return [];
    let r = users;

    if (courseFilter !== "all") {
      r = r.filter(u => u.courses.some(c => c.playlistId === courseFilter));
    }

    if (statusFilter === "vip")      r = r.filter(u => isActiveVip(u));
    else if (statusFilter === "expired")  r = r.filter(u => isExpiredVip(u));
    else if (statusFilter === "expiring") r = r.filter(u => isExpiringSoon(u));
    else if (statusFilter === "nonvip")   r = r.filter(u => u.accountType !== "vip");
    else if (statusFilter === "active")   r = r.filter(u => u.isActive);
    else if (statusFilter === "blocked")  r = r.filter(u => !u.isActive);
    else if (statusFilter === "new")      r = r.filter(u => new Date(u.createdAt) >= monthAgo);

    if (notifFilter === "enabled")  r = r.filter(u => u.pushEnabled);
    else if (notifFilter === "disabled") r = r.filter(u => !u.pushEnabled);

    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(u =>
        u.username.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.phone && u.phone.includes(s)) ||
        (u.fullName && u.fullName.toLowerCase().includes(s)) ||
        String(u.id).includes(s)
      );
    }

    const sorted = [...r].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "username")             cmp = a.username.localeCompare(b.username, "ar");
      else if (sortBy === "createdAt")       cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === "lastVisitAt")     cmp = (a.lastVisitAt ?? "").localeCompare(b.lastVisitAt ?? "");
      else if (sortBy === "subscriptionExpiresAt") cmp = (a.subscriptionExpiresAt ?? "").localeCompare(b.subscriptionExpiresAt ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [users, courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, courseFilter, statusFilter]);

  // ── Sort toggle ─────────────────────────────────────────────
  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  // ── Selection ───────────────────────────────────────────────
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAllPage() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      paginated.forEach(u => next.add(u.id));
      return next;
    });
  }
  function deselectAll() { setSelectedIds(new Set()); }
  const allPageSelected = paginated.length > 0 && paginated.every(u => selectedIds.has(u.id));

  // ── Bulk action ─────────────────────────────────────────────
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const needsPlaylist = bulkAction === "grant_course" || bulkAction === "revoke_course";
    if (needsPlaylist && !bulkPlaylistId) {
      toast({ title: "اختر دورة أولاً", variant: "destructive" }); return;
    }
    setBulkLoading(true);
    try {
      const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
      const body: Record<string, unknown> = {
        action: bulkAction,
        userIds: [...selectedIds],
      };
      if (needsPlaylist) body.playlistId = Number(bulkPlaylistId);
      if (bulkAction === "extend_subscription") body.days = 30;
      if (bulkAction === "grant_vip") body.days = 365;

      const res = await fetch("/api/admin/users/bulk-action", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; affected?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "فشل التنفيذ");
      toast({ title: `✅ تم تطبيق العملية على ${data.affected ?? selectedIds.size} مستخدم` });
      deselectAll();
      setBulkAction("");
      refetch();
      fetchStats();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "حدث خطأ", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Export CSV ──────────────────────────────────────────────
  function handleExport() {
    const rows = (selectedIds.size > 0 ? filtered.filter(u => selectedIds.has(u.id)) : filtered);
    const headers = ["ID", "اسم المستخدم", "البريد", "الهاتف", "الحساب", "الاشتراك", "الانتهاء", "الحالة", "الدورات", "آخر دخول", "تاريخ التسجيل"];
    const csv = [
      headers.join(","),
      ...rows.map(u => [
        u.id,
        u.username,
        u.email,
        u.phone ?? "",
        u.accountType,
        u.subscriptionType,
        u.subscriptionExpiresAt ?? "",
        u.isActive ? "نشط" : "محظور",
        u.courses.map(c => c.title).join(" | "),
        u.lastVisitAt ?? "",
        u.createdAt,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Existing handlers (preserved) ──────────────────────────
  const handleTestPush = async (user: ExtendedAdminUser) => {
    setTestingId(user.id);
    try {
      const r = await testPushMut.mutateAsync({ id: user.id });
      if (r.attempted === 0) {
        toast({ title: "لا يوجد اشتراك فعّال", description: `${user.username} لا يملك جهازًا مُسجّلًا`, variant: "destructive" });
      } else if (r.success > 0) {
        toast({ title: "تم إرسال الإشعار التجريبي ✅", description: `وصل إلى ${r.success} من ${r.attempted} جهاز` });
      } else {
        toast({ title: "فشل وصول الإشعار", description: "رفضت الأجهزة المُسجّلة الإشعار", variant: "destructive" });
      }
      refetch();
    } catch {
      toast({ title: "تعذّر إرسال الإشعار التجريبي", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleEdit = async (user: ExtendedAdminUser) => {
    setEditingUser(user);
    setFormData({
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      isActive: user.isActive,
      phone: (user as ExtendedAdminUser & { phone?: string }).phone ?? undefined,
    });
    setUserCourseIds([]);
    setCoursesLoading(true);
    try {
      const headers = getAdminAuthHeaders()?.headers as Record<string, string>;
      const res = await fetch(`/api/admin/users/${user.id}/courses`, { headers });
      if (res.ok) setUserCourseIds(await res.json() as number[]);
    } catch { /* ignore */ }
    finally { setCoursesLoading(false); }
  };

  const toggleCourse = (id: number) => {
    setUserCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      const headers = getAdminAuthHeaders()?.headers as Record<string, string>;
      await fetch(`/api/admin/users/${editingUser.id}/courses`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(userCourseIds),
      });
    } catch { /* ignore */ }
    updateMut.mutate({ id: editingUser.id, data: formData }, {
      onSuccess: () => { toast({ title: "تم الحفظ" }); setEditingUser(null); refetch(); fetchStats(); },
    });
  };

  const confirmResetIp = () => {
    if (!resetIpConfirmId) return;
    resetIpMut.mutate({ id: resetIpConfirmId }, {
      onSuccess: () => { toast({ title: "تم تصفير IP" }); refetch(); setResetIpConfirmId(null); },
      onError: () => { toast({ title: "حدث خطأ", variant: "destructive" }); setResetIpConfirmId(null); },
    });
  };

  const handleBlock = async (user: ExtendedAdminUser) => {
    const action = user.isActive ? "حظر" : "رفع الحظر عن";
    if (!confirm(`هل أنت متأكد من ${action} ${user.username}؟`)) return;
    setLoadingId(user.id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/block`, { method: "POST", headers: headers as HeadersInit });
      if (!res.ok) throw new Error("فشل الطلب");
      toast({ title: user.isActive ? "تم حظر المستخدم" : "تم رفع الحظر" });
      refetch(); fetchStats();
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
    finally { setLoadingId(null); }
  };

  const handleResetPassword = async () => {
    setResetPwError(""); setResetPwSuccess("");
    if (resetPwForm.newPassword !== resetPwForm.confirmPassword) { setResetPwError("كلمتا المرور غير متطابقتين"); return; }
    if (resetPwForm.newPassword.length < 6) { setResetPwError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setResetPwLoading(true);
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE}/api/admin/users/${resetPwUser!.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPwForm.newPassword }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) throw new Error(data.message || "حدث خطأ");
      setResetPwSuccess("تم تغيير كلمة المرور بنجاح");
      setResetPwForm({ newPassword: "", confirmPassword: "" });
    } catch (err: unknown) {
      setResetPwError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally { setResetPwLoading(false); }
  };

  const handleDelete = (user: ExtendedAdminUser) => {
    if (!confirm(`هل أنت متأكد من حذف حساب ${user.username} نهائيًا؟ لا يمكن التراجع.`)) return;
    setLoadingId(user.id);
    deleteMut.mutate({ id: user.id }, {
      onSuccess: () => { toast({ title: "تم حذف المستخدم" }); refetch(); fetchStats(); setLoadingId(null); },
      onError: () => { toast({ title: "حدث خطأ", variant: "destructive" }); setLoadingId(null); },
    });
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  const courseStats = stats?.perCourse ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5" dir="rtl">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} مستخدم{filtered.length !== (users?.length ?? 0) ? ` من ${users?.length ?? 0}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetch(); fetchStats(); }} disabled={isFetching} className="gap-1.5 h-9">
              <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              تحديث
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-9">
              <Download className="w-3.5 h-3.5" />
              تصدير CSV
            </Button>
          </div>
        </div>

        {/* ── STAT CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          <StatCard label="الإجمالي"     value={stats?.total ?? "—"}     icon={<Users className="w-4 h-4" />}          color="text-foreground"       onClick={() => { setStatusFilter("all"); setCourseFilter("all"); }} />
          <StatCard label="VIP نشط"      value={stats?.vip ?? "—"}       icon={<Crown className="w-4 h-4" />}          color="text-amber-400"        onClick={() => setStatusFilter("vip")} />
          <StatCard label="غير VIP"      value={stats?.nonVip ?? "—"}    icon={<UserCheck className="w-4 h-4" />}      color="text-blue-400"         onClick={() => setStatusFilter("nonvip")} />
          <StatCard label="منتهي"        value={stats?.expired ?? "—"}   icon={<XCircle className="w-4 h-4" />}        color="text-red-400"          onClick={() => setStatusFilter("expired")} />
          <StatCard label="قريب الانتهاء" value={stats?.expiringSoon ?? "—"} icon={<AlertTriangle className="w-4 h-4" />} color="text-orange-400"    onClick={() => setStatusFilter("expiring")} />
          <StatCard label="جديد (30ي)"   value={stats?.newUsers ?? "—"}  icon={<Sparkles className="w-4 h-4" />}       color="text-purple-400"       onClick={() => setStatusFilter("new")} />
          <StatCard label="محظور"        value={stats?.blocked ?? "—"}   icon={<UserX className="w-4 h-4" />}          color="text-red-500"          onClick={() => setStatusFilter("blocked")} />
          <StatCard label="إشعارات مفعّلة" value={notifStats?.enabled ?? "—"} icon={<BellRing className="w-4 h-4" />} color="text-green-400"       onClick={() => setNotifFilter("enabled")} />
        </div>

        {/* ── COURSE FILTER TABS ─────────────────────────────── */}
        {allPlaylists && allPlaylists.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-1">
              <BookOpen className="w-3.5 h-3.5" />الدورة:
            </span>
            <CourseTab
              active={courseFilter === "all"}
              label="جميع الدورات"
              count={users?.length}
              onClick={() => setCourseFilter("all")}
            />
            {allPlaylists.map(pl => {
              const sc = courseStats.find(s => s.playlistId === pl.id);
              return (
                <CourseTab
                  key={pl.id}
                  active={courseFilter === pl.id}
                  label={pl.title}
                  count={sc?.count}
                  onClick={() => setCourseFilter(pl.id)}
                />
              );
            })}
          </div>
        )}

        {/* ── FILTER BAR ─────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-56">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الإيميل أو الهاتف أو الكود..."
              className="pl-4 pr-9 h-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Status filters */}
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.v}
                type="button"
                onClick={() => setStatusFilter(f.v)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === f.v ? "bg-primary text-primary-foreground" : `text-muted-foreground hover:text-foreground ${f.color}`
                }`}
              >
                {f.icon}{f.label}
              </button>
            ))}
          </div>

          {/* Notification filter */}
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            {(["all", "enabled", "disabled"] as const).map(v => (
              <button key={v} type="button" onClick={() => setNotifFilter(v)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  notifFilter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "enabled" ? <BellRing className="w-3 h-3" /> : v === "disabled" ? <BellOff className="w-3 h-3" /> : null}
                {v === "all" ? "الكل" : v === "enabled" ? "إشعارات" : "بدون"}
              </button>
            ))}
          </div>
        </div>

        {/* ── BULK ACTION BAR ────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5">
            <span className="text-sm font-medium text-primary">{selectedIds.size} محدد</span>
            <button type="button" onClick={deselectAll} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" />إلغاء
            </button>
            <div className="h-4 w-px bg-white/20" />
            <select
              className="h-8 rounded-lg border border-white/10 bg-background px-2 text-xs text-foreground"
              value={bulkAction}
              onChange={e => setBulkAction(e.target.value)}
            >
              <option value="">اختر عملية...</option>
              {BULK_ACTIONS.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
            {(bulkAction === "grant_course" || bulkAction === "revoke_course") && (
              <select
                className="h-8 rounded-lg border border-white/10 bg-background px-2 text-xs text-foreground"
                value={bulkPlaylistId}
                onChange={e => setBulkPlaylistId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">اختر الدورة...</option>
                {allPlaylists?.map(pl => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
              </select>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={handleBulkAction} disabled={!bulkAction || bulkLoading}>
              {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تطبيق"}
            </Button>
          </div>
        )}

        {/* ── TABLE (desktop) / CARDS (mobile) ───────────────── */}

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {paginated.map(user => {
            const phone = user.phone;
            const vip = isActiveVip(user);
            const expired = isExpiredVip(user);
            return (
              <Card
                key={user.id}
                className={`border-white/5 p-4 space-y-3 cursor-pointer transition-colors hover:bg-white/[0.04] ${!user.isActive ? "opacity-60" : ""} ${selectedIds.has(user.id) ? "ring-1 ring-primary/40 bg-primary/5" : ""}`}
                onClick={() => toggleSelect(user.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div onClick={e => { e.stopPropagation(); toggleSelect(user.id); }} className="shrink-0 cursor-pointer">
                      {selectedIds.has(user.id)
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <button type="button" className="font-bold truncate text-right hover:text-primary transition-colors" onClick={e => { e.stopPropagation(); setDetailUserId(user.id); }}>
                        {user.username}
                      </button>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={vip ? "vip" : "secondary"} className="text-xs">
                      {vip ? "VIP" : expired ? "منتهي" : "عادي"}
                    </Badge>
                    {user.isActive
                      ? <Badge className="bg-green-500/20 text-green-500 border-0 text-xs">نشط</Badge>
                      : <Badge variant="destructive" className="text-xs">محظور</Badge>}
                  </div>
                </div>
                {user.courses.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.courses.map(c => (
                      <span key={c.playlistId} className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">{c.title}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {user.lastVisitAt && <span>آخر دخول: {timeAgo(user.lastVisitAt)}</span>}
                  <span>مسجّل: {formatDate(user.createdAt)}</span>
                </div>
                <div className="flex gap-1 pt-1 border-t border-white/5" onClick={e => e.stopPropagation()}>
                  <ActionBtn title="تفاصيل" onClick={() => setDetailUserId(user.id)}><Eye className="w-3.5 h-3.5 text-primary" /></ActionBtn>
                  <ActionBtn title="تعديل" onClick={() => handleEdit(user)}><Edit className="w-3.5 h-3.5" /></ActionBtn>
                  <ActionBtn title="تغيير كلمة المرور" onClick={() => { setResetPwUser(user); setResetPwForm({ newPassword: "", confirmPassword: "" }); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); }}><KeyRound className="w-3.5 h-3.5 text-purple-400" /></ActionBtn>
                  <ActionBtn title="تصفير IP" onClick={() => setResetIpConfirmId(user.id)} disabled={user.ipCount === 0}><RefreshCw className="w-3.5 h-3.5 text-blue-400" /></ActionBtn>
                  <ActionBtn title={user.isActive ? "حظر" : "رفع الحظر"} onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                    {user.isActive ? <ShieldOff className="w-3.5 h-3.5 text-yellow-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-green-400" />}
                  </ActionBtn>
                  <ActionBtn title="حذف" onClick={() => handleDelete(user)} disabled={loadingId === user.id}><Trash2 className="w-3.5 h-3.5 text-red-400" /></ActionBtn>
                </div>
              </Card>
            );
          })}
          {paginated.length === 0 && (
            <div className="text-center text-muted-foreground py-16 text-sm">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
              لا يوجد مستخدمون مطابقون للفلاتر
            </div>
          )}
        </div>

        {/* Desktop table */}
        <Card className="border-white/5 overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="text-[11px] text-muted-foreground bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <button type="button" onClick={allPageSelected ? deselectAll : selectAllPage} className="text-muted-foreground hover:text-foreground">
                      {allPageSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort("username")}>
                    <div className="flex items-center gap-1">المستخدم <SortIcon field="username" sortBy={sortBy} sortDir={sortDir} /></div>
                  </th>
                  <th className="px-3 py-3">الهاتف</th>
                  <th className="px-3 py-3">الدورات</th>
                  <th className="px-3 py-3">الحساب</th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort("subscriptionExpiresAt")}>
                    <div className="flex items-center gap-1">الاشتراك <SortIcon field="subscriptionExpiresAt" sortBy={sortBy} sortDir={sortDir} /></div>
                  </th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort("lastVisitAt")}>
                    <div className="flex items-center gap-1">آخر دخول <SortIcon field="lastVisitAt" sortBy={sortBy} sortDir={sortDir} /></div>
                  </th>
                  <th className="px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                    <div className="flex items-center gap-1">التسجيل <SortIcon field="createdAt" sortBy={sortBy} sortDir={sortDir} /></div>
                  </th>
                  <th className="px-3 py-3">الأجهزة</th>
                  <th className="px-3 py-3">IP</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3 sticky left-0 z-10 bg-card border-r border-white/5">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(user => {
                  const phone = user.phone;
                  const vip = isActiveVip(user);
                  const expired = isExpiredVip(user);
                  const expiring = isExpiringSoon(user);
                  const selected = selectedIds.has(user.id);
                  return (
                    <tr
                      key={user.id}
                      className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${!user.isActive ? "opacity-60" : ""} ${selected ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => toggleSelect(user.id)} className="text-muted-foreground hover:text-foreground">
                          {selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setDetailUserId(user.id)} className="text-right hover:text-primary transition-colors">
                          <div className="font-semibold whitespace-nowrap">{user.username}</div>
                          <div className="text-muted-foreground text-xs truncate max-w-[160px]">{user.email}</div>
                          {user.fullName && <div className="text-muted-foreground text-[11px] truncate max-w-[160px]">{user.fullName}</div>}
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono" dir="ltr">{phone}</span>
                            <a href={`https://wa.me/${normalizeWhatsApp(phone)}`} target="_blank" rel="noopener noreferrer"
                              className="w-6 h-6 rounded-full bg-green-500/15 hover:bg-green-500/30 text-green-400 flex items-center justify-center transition-all border border-green-500/20">
                              <MessageCircle className="w-3 h-3" />
                            </a>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {user.courses.length === 0
                            ? <span className="text-xs text-muted-foreground">—</span>
                            : user.courses.map(c => (
                              <span key={c.playlistId} className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary whitespace-nowrap w-fit">{c.title}</span>
                            ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={vip ? "vip" : "secondary"} className="whitespace-nowrap text-xs">
                          {vip ? "VIP" : expired ? "منتهي" : user.accountType}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs whitespace-nowrap">
                          <span className="text-muted-foreground">{user.subscriptionType}</span>
                          {user.subscriptionExpiresAt && (
                            <div className={`mt-0.5 font-medium ${expired ? "text-destructive" : expiring ? "text-orange-400" : "text-green-400"}`}>
                              {formatDate(user.subscriptionExpiresAt)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {user.lastVisitAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                                <Clock className="w-3 h-3" />{timeAgo(user.lastVisitAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{formatDate(user.lastVisitAt)}</TooltipContent>
                          </Tooltip>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className={`text-xs font-mono ${user.pushState === "enabled" ? "text-green-400" : "text-muted-foreground"}`}>
                            {user.deviceCount > 0 ? `${user.deviceCount} جهاز` : "—"}
                          </span>
                          {user.pushState === "enabled" && <BellRing className="w-3 h-3 text-green-400" />}
                          {user.pushState === "denied" && <BellOff className="w-3 h-3 text-amber-400" />}
                          {user.pushState === "broken" && <BellOff className="w-3 h-3 text-red-400" />}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {user.accountType === "vip" ? (
                          <div className="space-y-0.5">
                            <Badge className={`border-0 font-mono text-[10px] ${user.ipCount >= 2 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-500"}`}>
                              {user.ipCount}/2
                            </Badge>
                            {user.ipAddress && <div className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{user.ipAddress}</div>}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {user.isActive
                          ? <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/20 border-0 text-xs whitespace-nowrap">نشط</Badge>
                          : <Badge variant="destructive" className="text-xs whitespace-nowrap">محظور</Badge>}
                      </td>
                      <td className="px-3 py-3 sticky left-0 z-10 bg-card border-r border-white/5">
                        <div className="flex items-center gap-0.5 whitespace-nowrap">
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailUserId(user.id)}><Eye className="w-3.5 h-3.5 text-primary" /></Button>
                          </TooltipTrigger><TooltipContent>تفاصيل</TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(user)}><Edit className="w-3.5 h-3.5" /></Button>
                          </TooltipTrigger><TooltipContent>تعديل</TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setResetPwUser(user); setResetPwForm({ newPassword: "", confirmPassword: "" }); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); }}>
                              <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                            </Button>
                          </TooltipTrigger><TooltipContent>تغيير كلمة المرور</TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setResetIpConfirmId(user.id)} disabled={user.ipCount === 0}>
                              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                            </Button>
                          </TooltipTrigger><TooltipContent>تصفير IP</TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleTestPush(user)} disabled={testingId === user.id}>
                              {testingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Send className="w-3.5 h-3.5 text-emerald-400" />}
                            </Button>
                          </TooltipTrigger><TooltipContent>إشعار تجريبي</TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                              {user.isActive ? <ShieldOff className="w-3.5 h-3.5 text-yellow-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-green-400" />}
                            </Button>
                          </TooltipTrigger><TooltipContent>{user.isActive ? "حظر" : "رفع الحظر"}</TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(user)} disabled={loadingId === user.id}>
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </Button>
                          </TooltipTrigger><TooltipContent>حذف</TooltipContent></Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      لا يوجد مستخدمون مطابقون للفلاتر المحددة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-sm text-muted-foreground">
              <span>صفحة {page} من {totalPages} — {filtered.length} نتيجة</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(1)} disabled={page === 1}>«</Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const pg = start + i;
                  return pg <= totalPages ? (
                    <button key={pg} type="button" onClick={() => setPage(pg)}
                      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${pg === page ? "bg-primary text-primary-foreground" : "hover:bg-white/10"}`}>
                      {pg}
                    </button>
                  ) : null;
                })}
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</Button>
              </div>
            </div>
          )}
        </Card>

        {/* ── USER DETAIL MODAL ──────────────────────────────── */}
        <UserDetailModal
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
          getAdminAuthHeaders={getAdminAuthHeaders}
        />

        {/* ── RESET PASSWORD MODAL ───────────────────────────── */}
        <Dialog open={!!resetPwUser} onOpenChange={o => { if (!o) { setResetPwUser(null); setResetPwError(""); setResetPwSuccess(""); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>تغيير كلمة المرور: {resetPwUser?.username}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Input type={showResetPw ? "text" : "password"} placeholder="6 أحرف على الأقل"
                    value={resetPwForm.newPassword} onChange={e => setResetPwForm({ ...resetPwForm, newPassword: e.target.value })} className="pl-10" />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowResetPw(v => !v)}>
                    {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Input type={showResetConfirm ? "text" : "password"} placeholder="أعد إدخال كلمة المرور"
                    value={resetPwForm.confirmPassword} onChange={e => setResetPwForm({ ...resetPwForm, confirmPassword: e.target.value })} className="pl-10" />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowResetConfirm(v => !v)}>
                    {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {resetPwError && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{resetPwError}</p>}
              {resetPwSuccess && <p className="text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">{resetPwSuccess}</p>}
              <Button className="w-full" onClick={handleResetPassword} disabled={resetPwLoading}>
                {resetPwLoading ? "جاري الحفظ..." : "تغيير كلمة المرور"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── EDIT USER MODAL ────────────────────────────────── */}
        <Dialog open={!!editingUser} onOpenChange={o => !o && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>تعديل المستخدم: {editingUser?.username}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>نوع الحساب</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={formData.accountType} onChange={e => setFormData({ ...formData, accountType: e.target.value as "vip" | "normal" })}>
                  <option value="normal">عادي</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>خطة الاشتراك</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={formData.subscriptionType} onChange={e => setFormData({ ...formData, subscriptionType: e.target.value as "demo" | "monthly" | "annual" | "lifetime" })}>
                  <option value="demo">تجريبي</option>
                  <option value="monthly">شهري</option>
                  <option value="annual">سنوي</option>
                  <option value="lifetime">مدى الحياة</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>حالة الحساب</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={formData.isActive ? "true" : "false"} onChange={e => setFormData({ ...formData, isActive: e.target.value === "true" })}>
                  <option value="true">نشط</option>
                  <option value="false">موقوف</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف / واتساب</Label>
                <PhoneNumberInput value={formData.phone ?? undefined} onChange={value => setFormData({ ...formData, phone: value || undefined })} placeholder="5X XX XX XX XX" />
                <p className="text-xs text-muted-foreground">اختر الدولة وأدخل رقمًا دوليًا صحيحًا</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <GraduationCap className="w-4 h-4 text-muted-foreground" />الدورات الممنوحة
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
                        <button key={pl.id} type="button" onClick={() => toggleCourse(pl.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-right transition-colors ${selected ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-gray-50"}`}>
                          <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-gray-300"}`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="flex-1 truncate text-gray-800 font-medium">{pl.title || `دورة #${pl.id}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {userCourseIds.length > 0 && <p className="text-xs text-muted-foreground">{userCourseIds.length} دورة محددة</p>}
              </div>
              <Button className="w-full mt-4" onClick={handleSave} disabled={updateMut.isPending}>حفظ التغييرات</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── RESET IP CONFIRM ───────────────────────────────── */}
        <Dialog open={resetIpConfirmId !== null} onOpenChange={o => { if (!o) setResetIpConfirmId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>تأكيد تصفير IP</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">هل أنت متأكد من تصفير عناوين IP لهذا المستخدم؟ سيتمكن من تسجيل الدخول من أي جهاز جديد.</p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={confirmResetIp} disabled={resetIpMut.isPending}>
                  {resetIpMut.isPending ? "جاري التصفير..." : "تأكيد التصفير"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setResetIpConfirmId(null)} disabled={resetIpMut.isPending}>إلغاء</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function StatCard({ label, value, icon, color, onClick }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-3 text-right transition-all group w-full">
      <div className={`${color} mb-1.5 group-hover:scale-110 transition-transform inline-block`}>{icon}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{label}</div>
    </button>
  );
}

function CourseTab({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 hover:bg-white/5"
      }`}>
      <BookOpen className="w-3 h-3" />
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-white/10"}`}>{count}</span>
      )}
    </button>
  );
}

function ActionBtn({ title, onClick, disabled, children }: {
  title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" title={title} onClick={onClick} disabled={disabled}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors disabled:opacity-40">
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
