import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetAdminUsers, useUpdateAdminUser, useResetUserIp,
  useDeleteAdminUser, useGetAdminNotificationStats,
  useSendUserTestPush, useGetAdminPlaylists,
} from "@workspace/api-client-react/src/generated/api";
import type { AdminUser, UpdateUserInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
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
  Filter, CheckSquare, Square, Download, RefreshCcw, X,
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
  total: number; vip: number; expired: number; expiringSoon: number;
  nonVip: number; newUsers: number; blocked: number;
  perCourse: { playlistId: number; title: string; count: number }[];
}

type StatusFilter = "all" | "vip" | "nonvip" | "expired" | "expiring" | "active" | "blocked" | "new";
type SortField = "createdAt" | "username" | "lastVisitAt" | "subscriptionExpiresAt";

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
  return `${Math.floor(days / 30)}ش`;
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
  return exp >= now && exp <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc" | "desc" }) {
  if (sortBy !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-orange-500" /> : <ChevronDown className="w-3 h-3 text-orange-500" />;
}

const BULK_ACTIONS = [
  { v: "grant_vip",           label: "منح VIP (365 يوم)" },
  { v: "revoke_vip",          label: "إلغاء VIP" },
  { v: "extend_subscription", label: "تمديد 30 يوم" },
  { v: "grant_course",        label: "منح دورة..." },
  { v: "revoke_course",       label: "إلغاء دورة..." },
  { v: "reset_ip",            label: "تصفير IP" },
  { v: "block",               label: "حظر" },
  { v: "unblock",             label: "رفع الحظر" },
];

// ── Semantic badges ─────────────────────────────────────────────────────────
function AccountBadge({ user }: { user: ExtendedAdminUser }) {
  if (isActiveVip(user)) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Crown className="w-3 h-3" />VIP
    </span>
  );
  if (isExpiredVip(user)) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">منتهي</span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">عادي</span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">نشط</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">محظور</span>;
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">موافق عليه</span>;
  if (status === "pending")  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">قيد المراجعة</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">مرفوض</span>;
}

export function AdminUsers() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const { data: rawUsers, refetch, isFetching } = useGetAdminUsers(undefined, { request: getAdminAuthHeaders() });
  const users = rawUsers as ExtendedAdminUser[] | undefined;
  const { data: notifStats } = useGetAdminNotificationStats({ request: getAdminAuthHeaders() });
  const { data: allPlaylists } = useGetAdminPlaylists({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut = useResetUserIp({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteAdminUser({ request: getAdminAuthHeaders() });
  const testPushMut = useSendUserTestPush({ request: getAdminAuthHeaders() });

  const [stats, setStats] = useState<UserStats | null>(null);
  const fetchStats = useCallback(() => {
    const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
    fetch("/api/admin/users/stats", { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStats(d))
      .catch(() => {});
  }, [getAdminAuthHeaders]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [notifFilter, setNotifFilter] = useState<NotifFilter>("all");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  const [bulkAction, setBulkAction] = useState("");
  const [bulkPlaylistId, setBulkPlaylistId] = useState<number | "">("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filtered = useMemo(() => {
    if (!users) return [];
    let r = users;
    if (courseFilter !== "all") r = r.filter(u => u.courses.some(c => c.playlistId === courseFilter));
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
        u.username.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) ||
        (u.phone && u.phone.includes(s)) || (u.fullName && u.fullName.toLowerCase().includes(s)) ||
        String(u.id).includes(s)
      );
    }
    return [...r].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "username")             cmp = a.username.localeCompare(b.username, "ar");
      else if (sortBy === "createdAt")       cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === "lastVisitAt")     cmp = (a.lastVisitAt ?? "").localeCompare(b.lastVisitAt ?? "");
      else if (sortBy === "subscriptionExpiresAt") cmp = (a.subscriptionExpiresAt ?? "").localeCompare(b.subscriptionExpiresAt ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, courseFilter, statusFilter]);

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAllPage() { setSelectedIds(prev => { const n = new Set(prev); paginated.forEach(u => n.add(u.id)); return n; }); }
  function deselectAll() { setSelectedIds(new Set()); }
  const allPageSelected = paginated.length > 0 && paginated.every(u => selectedIds.has(u.id));

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const needsPlaylist = bulkAction === "grant_course" || bulkAction === "revoke_course";
    if (needsPlaylist && !bulkPlaylistId) { toast({ title: "اختر دورة أولاً", variant: "destructive" }); return; }
    setBulkLoading(true);
    try {
      const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
      const body: Record<string, unknown> = { action: bulkAction, userIds: [...selectedIds] };
      if (needsPlaylist) body.playlistId = Number(bulkPlaylistId);
      if (bulkAction === "extend_subscription") body.days = 30;
      if (bulkAction === "grant_vip") body.days = 365;
      const res = await fetch("/api/admin/users/bulk-action", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; affected?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "فشل التنفيذ");
      toast({ title: `تم تطبيق العملية على ${data.affected ?? selectedIds.size} مستخدم` });
      deselectAll(); setBulkAction(""); refetch(); fetchStats();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "حدث خطأ", variant: "destructive" });
    } finally { setBulkLoading(false); }
  };

  function handleExport() {
    const rows = selectedIds.size > 0 ? filtered.filter(u => selectedIds.has(u.id)) : filtered;
    const hds = ["ID","اسم المستخدم","البريد","الهاتف","الحساب","الاشتراك","الانتهاء","الحالة","الدورات","آخر دخول","تاريخ التسجيل"];
    const csv = [hds.join(","), ...rows.map(u => [
      u.id, u.username, u.email, u.phone ?? "", u.accountType, u.subscriptionType,
      u.subscriptionExpiresAt ?? "", u.isActive ? "نشط" : "محظور",
      u.courses.map(c => c.title).join("|"), u.lastVisitAt ?? "", u.createdAt,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "users.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const handleTestPush = async (user: ExtendedAdminUser) => {
    setTestingId(user.id);
    try {
      const r = await testPushMut.mutateAsync({ id: user.id });
      if (r.attempted === 0) toast({ title: "لا يوجد اشتراك فعّال", variant: "destructive" });
      else if (r.success > 0) toast({ title: `تم إرسال الإشعار — ${r.success}/${r.attempted} جهاز` });
      else toast({ title: "فشل وصول الإشعار", variant: "destructive" });
      refetch();
    } catch { toast({ title: "تعذّر إرسال الإشعار", variant: "destructive" }); }
    finally { setTestingId(null); }
  };

  const handleEdit = async (user: ExtendedAdminUser) => {
    setEditingUser(user);
    setFormData({ accountType: user.accountType, subscriptionType: user.subscriptionType, isActive: user.isActive, phone: (user as ExtendedAdminUser & { phone?: string }).phone ?? undefined });
    setUserCourseIds([]); setCoursesLoading(true);
    try {
      const headers = getAdminAuthHeaders()?.headers as Record<string, string>;
      const res = await fetch(`/api/admin/users/${user.id}/courses`, { headers });
      if (res.ok) setUserCourseIds(await res.json() as number[]);
    } catch { /* ignore */ } finally { setCoursesLoading(false); }
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      const headers = getAdminAuthHeaders()?.headers as Record<string, string>;
      await fetch(`/api/admin/users/${editingUser.id}/courses`, {
        method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(userCourseIds),
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
    if (!confirm(`هل أنت متأكد؟`)) return;
    setLoadingId(user.id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`/api/admin/users/${user.id}/block`, { method: "POST", headers: headers as HeadersInit });
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
      const res = await fetch(`/api/admin/users/${resetPwUser!.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPwForm.newPassword }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) throw new Error(data.message || "حدث خطأ");
      setResetPwSuccess("تم تغيير كلمة المرور بنجاح");
      setResetPwForm({ newPassword: "", confirmPassword: "" });
    } catch (err: unknown) { setResetPwError(err instanceof Error ? err.message : "خطأ"); }
    finally { setResetPwLoading(false); }
  };

  const handleDelete = (user: ExtendedAdminUser) => {
    if (!confirm(`حذف ${user.username} نهائيًا؟`)) return;
    setLoadingId(user.id);
    deleteMut.mutate({ id: user.id }, {
      onSuccess: () => { toast({ title: "تم الحذف" }); refetch(); fetchStats(); setLoadingId(null); },
      onError: () => { toast({ title: "حدث خطأ", variant: "destructive" }); setLoadingId(null); },
    });
  };

  const courseStats = stats?.perCourse ?? [];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5" dir="rtl">

        {/* ── HEADER ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">إدارة المستخدمين</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} مستخدم{filtered.length !== (users?.length ?? 0) ? ` من ${users?.length ?? 0}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { refetch(); fetchStats(); }}
              disabled={isFetching}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />تحديث
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />تصدير CSV
            </button>
          </div>
        </div>

        {/* ── STAT CARDS ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {[
            { label: "الإجمالي",      value: stats?.total ?? "—",       onClick: () => { setStatusFilter("all"); setCourseFilter("all"); } },
            { label: "VIP نشط",       value: stats?.vip ?? "—",         onClick: () => setStatusFilter("vip") },
            { label: "غير VIP",       value: stats?.nonVip ?? "—",      onClick: () => setStatusFilter("nonvip") },
            { label: "منتهي",         value: stats?.expired ?? "—",     onClick: () => setStatusFilter("expired") },
            { label: "قريب الانتهاء", value: stats?.expiringSoon ?? "—",onClick: () => setStatusFilter("expiring") },
            { label: "جديد (30ي)",    value: stats?.newUsers ?? "—",    onClick: () => setStatusFilter("new") },
            { label: "محظور",         value: stats?.blocked ?? "—",     onClick: () => setStatusFilter("blocked") },
            { label: "إشعارات",       value: notifStats?.enabled ?? "—",onClick: () => setNotifFilter("enabled") },
          ].map(c => (
            <button
              key={c.label}
              type="button"
              onClick={c.onClick}
              className="bg-white border border-gray-200 rounded-xl p-3 text-right hover:border-orange-300 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors">{c.value}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{c.label}</div>
            </button>
          ))}
        </div>

        {/* ── COURSE FILTER TABS ────────────────────────────────── */}
        {allPlaylists && allPlaylists.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 flex items-center gap-1 ml-1">
              <BookOpen className="w-3.5 h-3.5" />الدورة:
            </span>
            <CourseTab active={courseFilter === "all"} label="الكل" count={users?.length} onClick={() => setCourseFilter("all")} />
            {allPlaylists.map(pl => {
              const sc = courseStats.find(s => s.playlistId === pl.id);
              return <CourseTab key={pl.id} active={courseFilter === pl.id} label={pl.title} count={sc?.count} onClick={() => setCourseFilter(pl.id)} />;
            })}
          </div>
        )}

        {/* ── FILTER BAR ────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="بحث بالاسم أو البريد أو الهاتف..."
              className="w-full h-9 pr-9 pl-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 transition-colors"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 flex-wrap">
            {(["all","vip","expired","expiring","nonvip","active","blocked","new"] as StatusFilter[]).map(v => {
              const labels: Record<StatusFilter, string> = { all:"الكل", vip:"VIP", expired:"منتهي", expiring:"قريب", nonvip:"عادي", active:"نشط", blocked:"محظور", new:"جديد" };
              return (
                <button key={v} type="button" onClick={() => setStatusFilter(v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === v ? "bg-orange-500 text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  }`}>
                  {labels[v]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(["all","enabled","disabled"] as NotifFilter[]).map(v => (
              <button key={v} type="button" onClick={() => setNotifFilter(v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  notifFilter === v ? "bg-orange-500 text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                }`}>
                {v === "enabled" && <BellRing className="w-3 h-3" />}
                {v === "disabled" && <BellOff className="w-3 h-3" />}
                {v === "all" ? "الكل" : v === "enabled" ? "إشعارات" : "بدون"}
              </button>
            ))}
          </div>
        </div>

        {/* ── BULK ACTION BAR ───────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
            <span className="text-sm font-semibold text-orange-700">{selectedIds.size} محدد</span>
            <button type="button" onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-0.5">
              <X className="w-3 h-3" />إلغاء
            </button>
            <div className="h-4 w-px bg-orange-200" />
            <select className="h-8 rounded-lg border border-orange-200 bg-white px-2 text-xs text-gray-700" value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
              <option value="">اختر عملية...</option>
              {BULK_ACTIONS.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
            {(bulkAction === "grant_course" || bulkAction === "revoke_course") && (
              <select className="h-8 rounded-lg border border-orange-200 bg-white px-2 text-xs text-gray-700" value={bulkPlaylistId} onChange={e => setBulkPlaylistId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">اختر الدورة...</option>
                {allPlaylists?.map(pl => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
              </select>
            )}
            <button type="button" onClick={handleBulkAction} disabled={!bulkAction || bulkLoading}
              className="h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              تطبيق
            </button>
          </div>
        )}

        {/* ── MOBILE CARDS ──────────────────────────────────────── */}
        <div className="md:hidden space-y-2">
          {paginated.map(user => (
            <div
              key={user.id}
              className={`bg-white border border-gray-200 rounded-xl p-4 space-y-3 ${!user.isActive ? "opacity-60" : ""} ${selectedIds.has(user.id) ? "ring-1 ring-orange-400 border-orange-300" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" onClick={() => toggleSelect(user.id)} className="shrink-0">
                    {selectedIds.has(user.id)
                      ? <CheckSquare className="w-4 h-4 text-orange-500" />
                      : <Square className="w-4 h-4 text-gray-300" />}
                  </button>
                  <div className="min-w-0">
                    <button type="button" onClick={() => setDetailUserId(user.id)} className="font-semibold text-gray-900 hover:text-orange-600 truncate text-right">
                      {user.username}
                    </button>
                    <div className="text-xs text-gray-500 truncate">{user.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <AccountBadge user={user} />
                  <StatusBadge isActive={user.isActive} />
                </div>
              </div>
              {user.courses.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {user.courses.map(c => (
                    <span key={c.playlistId} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100">{c.title}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {user.lastVisitAt && <span>آخر دخول: {timeAgo(user.lastVisitAt)}</span>}
                <span>مسجّل: {formatDate(user.createdAt)}</span>
              </div>
              <div className="flex gap-0.5 pt-2 border-t border-gray-100">
                <IBtn tip="تفاصيل"       onClick={() => setDetailUserId(user.id)}><Eye className="w-3.5 h-3.5" /></IBtn>
                <IBtn tip="تعديل"        onClick={() => handleEdit(user)}><Edit className="w-3.5 h-3.5" /></IBtn>
                <IBtn tip="كلمة المرور"  onClick={() => { setResetPwUser(user); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); setResetPwForm({ newPassword: "", confirmPassword: "" }); }}><KeyRound className="w-3.5 h-3.5" /></IBtn>
                <IBtn tip="تصفير IP"     onClick={() => setResetIpConfirmId(user.id)} disabled={user.ipCount === 0}><RefreshCw className="w-3.5 h-3.5" /></IBtn>
                <IBtn tip={user.isActive ? "حظر" : "رفع الحظر"} onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                  {user.isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                </IBtn>
                <IBtn tip="حذف"          onClick={() => handleDelete(user)} disabled={loadingId === user.id} danger><Trash2 className="w-3.5 h-3.5" /></IBtn>
              </div>
            </div>
          ))}
          {paginated.length === 0 && <EmptyState />}
        </div>

        {/* ── DESKTOP TABLE ─────────────────────────────────────── */}
        <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 w-9">
                    <button type="button" onClick={allPageSelected ? deselectAll : selectAllPage}>
                      {allPageSelected
                        ? <CheckSquare className="w-4 h-4 text-orange-500" />
                        : <Square className="w-4 h-4 text-gray-300 hover:text-gray-500" />}
                    </button>
                  </th>
                  <Th onClick={() => toggleSort("username")}><div className="flex items-center gap-1">المستخدم<SortIcon field="username" sortBy={sortBy} sortDir={sortDir} /></div></Th>
                  <Th>الهاتف</Th>
                  <Th>الدورات</Th>
                  <Th>الحساب</Th>
                  <Th onClick={() => toggleSort("subscriptionExpiresAt")}><div className="flex items-center gap-1">الاشتراك<SortIcon field="subscriptionExpiresAt" sortBy={sortBy} sortDir={sortDir} /></div></Th>
                  <Th onClick={() => toggleSort("lastVisitAt")}><div className="flex items-center gap-1">آخر دخول<SortIcon field="lastVisitAt" sortBy={sortBy} sortDir={sortDir} /></div></Th>
                  <Th onClick={() => toggleSort("createdAt")}><div className="flex items-center gap-1">التسجيل<SortIcon field="createdAt" sortBy={sortBy} sortDir={sortDir} /></div></Th>
                  <Th>الأجهزة</Th>
                  <Th>IP</Th>
                  <Th>الحالة</Th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r border-gray-200 whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((user, idx) => {
                  const expired = isExpiredVip(user);
                  const expiring = isExpiringSoon(user);
                  const selected = selectedIds.has(user.id);
                  const rowBg = selected ? "bg-orange-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                  return (
                    <tr key={user.id} className={`border-b border-gray-100 hover:bg-orange-50/40 transition-colors ${!user.isActive ? "opacity-60" : ""} ${rowBg}`}>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => toggleSelect(user.id)}>
                          {selected ? <CheckSquare className="w-4 h-4 text-orange-500" /> : <Square className="w-4 h-4 text-gray-300 hover:text-gray-500" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setDetailUserId(user.id)} className="text-right hover:text-orange-600 transition-colors">
                          <div className="font-semibold text-gray-900 whitespace-nowrap">{user.username}</div>
                          <div className="text-gray-400 text-xs truncate max-w-[160px]">{user.email}</div>
                          {user.fullName && <div className="text-gray-400 text-[11px] truncate max-w-[160px]">{user.fullName}</div>}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-gray-700" dir="ltr">{user.phone}</span>
                            <a href={`https://wa.me/${normalizeWhatsApp(user.phone)}`} target="_blank" rel="noopener noreferrer"
                              className="w-6 h-6 rounded-full bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center transition-all border border-green-200">
                              <MessageCircle className="w-3 h-3" />
                            </a>
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {user.courses.length === 0
                            ? <span className="text-gray-300 text-xs">—</span>
                            : user.courses.map(c => (
                              <span key={c.playlistId} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100 whitespace-nowrap w-fit">{c.title}</span>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3"><AccountBadge user={user} /></td>
                      <td className="px-4 py-3">
                        <div className="text-xs whitespace-nowrap">
                          <span className="text-gray-500">{user.subscriptionType}</span>
                          {user.subscriptionExpiresAt && (
                            <div className={`mt-0.5 font-medium ${expired ? "text-red-600" : expiring ? "text-amber-600" : "text-green-700"}`}>
                              {formatDate(user.subscriptionExpiresAt)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.lastVisitAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-xs text-gray-500 cursor-default">
                                <Clock className="w-3 h-3 text-gray-400" />{timeAgo(user.lastVisitAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{formatDate(user.lastVisitAt)}</TooltipContent>
                          </Tooltip>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
                          {user.deviceCount > 0 ? `${user.deviceCount}` : "—"}
                          {user.pushState === "enabled" && <BellRing className="w-3 h-3 text-green-500" />}
                          {user.pushState === "denied"  && <BellOff className="w-3 h-3 text-amber-400" />}
                          {user.pushState === "broken"  && <BellOff className="w-3 h-3 text-red-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {user.accountType === "vip" ? (
                          <div className="space-y-0.5">
                            <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border ${user.ipCount >= 2 ? "bg-red-50 text-red-600 border-red-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {user.ipCount}/2
                            </span>
                            {user.ipAddress && <div className="text-[10px] font-mono text-gray-400 whitespace-nowrap">{user.ipAddress}</div>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge isActive={user.isActive} /></td>
                      <td className="px-4 py-3 sticky left-0 bg-inherit border-r border-gray-200">
                        <div className="flex items-center gap-0.5 whitespace-nowrap">
                          <IBtn tip="تفاصيل"       onClick={() => setDetailUserId(user.id)}><Eye className="w-3.5 h-3.5" /></IBtn>
                          <IBtn tip="تعديل"        onClick={() => handleEdit(user)}><Edit className="w-3.5 h-3.5" /></IBtn>
                          <IBtn tip="كلمة المرور"  onClick={() => { setResetPwUser(user); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); setResetPwForm({ newPassword: "", confirmPassword: "" }); }}><KeyRound className="w-3.5 h-3.5" /></IBtn>
                          <IBtn tip="تصفير IP"     onClick={() => setResetIpConfirmId(user.id)} disabled={user.ipCount === 0}><RefreshCw className="w-3.5 h-3.5" /></IBtn>
                          <IBtn tip="إشعار تجريبي" onClick={() => handleTestPush(user)} disabled={testingId === user.id}>
                            {testingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          </IBtn>
                          <IBtn tip={user.isActive ? "حظر" : "رفع الحظر"} onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                            {user.isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          </IBtn>
                          <IBtn tip="حذف" onClick={() => handleDelete(user)} disabled={loadingId === user.id} danger>
                            <Trash2 className="w-3.5 h-3.5" />
                          </IBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={12} className="py-16 text-center text-gray-400 text-sm"><EmptyState /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>صفحة {page} من {totalPages} — {filtered.length} نتيجة</span>
              <div className="flex items-center gap-1">
                {["«","‹"].map((ch, i) => (
                  <button key={ch} type="button" onClick={() => setPage(i === 0 ? 1 : page - 1)} disabled={page === 1}
                    className="w-7 h-7 rounded-lg border border-gray-200 text-xs flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors">{ch}</button>
                ))}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const pg = start + i;
                  return pg <= totalPages ? (
                    <button key={pg} type="button" onClick={() => setPage(pg)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${pg === page ? "bg-orange-500 text-white" : "border border-gray-200 hover:bg-gray-50"}`}>{pg}</button>
                  ) : null;
                })}
                {["›","»"].map((ch, i) => (
                  <button key={ch} type="button" onClick={() => setPage(i === 0 ? page + 1 : totalPages)} disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg border border-gray-200 text-xs flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors">{ch}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── MODALS ────────────────────────────────────────────── */}
        <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} getAdminAuthHeaders={getAdminAuthHeaders} />

        {/* Reset Password */}
        <Dialog open={!!resetPwUser} onOpenChange={o => { if (!o) setResetPwUser(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>تغيير كلمة المرور — {resetPwUser?.username}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <input type={showResetPw ? "text" : "password"} placeholder="6 أحرف على الأقل"
                    value={resetPwForm.newPassword} onChange={e => setResetPwForm({ ...resetPwForm, newPassword: e.target.value })}
                    className="w-full h-10 px-3 pl-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400" />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowResetPw(v => !v)}>
                    {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <input type={showResetConfirm ? "text" : "password"} placeholder="أعد الإدخال"
                    value={resetPwForm.confirmPassword} onChange={e => setResetPwForm({ ...resetPwForm, confirmPassword: e.target.value })}
                    className="w-full h-10 px-3 pl-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400" />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowResetConfirm(v => !v)}>
                    {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {resetPwError   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{resetPwError}</p>}
              {resetPwSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{resetPwSuccess}</p>}
              <button type="button" onClick={handleResetPassword} disabled={resetPwLoading}
                className="w-full h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {resetPwLoading ? "جاري الحفظ..." : "تغيير كلمة المرور"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit User */}
        <Dialog open={!!editingUser} onOpenChange={o => !o && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>تعديل — {editingUser?.username}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">نوع الحساب</Label>
                <select className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  value={formData.accountType} onChange={e => setFormData({ ...formData, accountType: e.target.value as "vip" | "normal" })}>
                  <option value="normal">عادي</option><option value="vip">VIP</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">خطة الاشتراك</Label>
                <select className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  value={formData.subscriptionType} onChange={e => setFormData({ ...formData, subscriptionType: e.target.value as "demo"|"monthly"|"annual"|"lifetime" })}>
                  <option value="demo">تجريبي</option><option value="monthly">شهري</option><option value="annual">سنوي</option><option value="lifetime">مدى الحياة</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">حالة الحساب</Label>
                <select className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  value={formData.isActive ? "true" : "false"} onChange={e => setFormData({ ...formData, isActive: e.target.value === "true" })}>
                  <option value="true">نشط</option><option value="false">موقوف</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm">رقم الهاتف</Label>
                <PhoneNumberInput value={formData.phone ?? undefined} onChange={v => setFormData({ ...formData, phone: v || undefined })} placeholder="5X XX XX XX XX" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" />الدورات الممنوحة</Label>
                {coursesLoading ? (
                  <div className="h-10 flex items-center justify-center rounded-lg border border-gray-200"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                ) : !allPlaylists || allPlaylists.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">لا توجد دورات</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 overflow-hidden max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {allPlaylists.map(pl => {
                      const sel = userCourseIds.includes(pl.id);
                      return (
                        <button key={pl.id} type="button" onClick={() => setUserCourseIds(prev => sel ? prev.filter(x => x !== pl.id) : [...prev, pl.id])}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-right transition-colors ${sel ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? "bg-orange-500 border-orange-500" : "border-gray-300"}`}>
                            {sel && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="flex-1 text-gray-800 truncate">{pl.title || `دورة #${pl.id}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleSave} disabled={updateMut.isPending}
                className="w-full h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {updateMut.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset IP Confirm */}
        <Dialog open={resetIpConfirmId !== null} onOpenChange={o => { if (!o) setResetIpConfirmId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>تأكيد تصفير IP</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">سيتمكن المستخدم من الدخول من أي جهاز جديد بعد التصفير.</p>
              <div className="flex gap-3">
                <button type="button" onClick={confirmResetIp} disabled={resetIpMut.isPending}
                  className="flex-1 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {resetIpMut.isPending ? "جاري التصفير..." : "تأكيد"}
                </button>
                <button type="button" onClick={() => setResetIpConfirmId(null)}
                  className="flex-1 h-10 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  إلغاء
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}

// ── Micro-components ────────────────────────────────────────────────────────

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${onClick ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
    >
      {children}
    </th>
  );
}

function IBtn({ tip, onClick, disabled, danger, children }: {
  tip: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} disabled={disabled}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-gray-400 disabled:opacity-30 ${
            danger
              ? "hover:bg-red-50 hover:text-red-500"
              : "hover:bg-gray-100 hover:text-gray-700"
          }`}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

function CourseTab({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
        active
          ? "bg-orange-500 text-white border-orange-500"
          : "bg-white border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600"
      }`}>
      <BookOpen className="w-3 h-3" />
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${active ? "bg-white/25" : "bg-gray-100 text-gray-500"}`}>{count}</span>
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center text-gray-400">
      <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">لا يوجد مستخدمون مطابقون</p>
    </div>
  );
}
