import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetAdminUsers, useUpdateAdminUser, useResetUserIp,
  useDeleteAdminUser, useGetAdminNotificationStats,
  useSendUserTestPush, useGetAdminPlaylists,
} from "@workspace/api-client-react/src/generated/api";
import type { AdminUser, UpdateUserInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useToast } from "@/hooks/use-toast";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  Search, Edit, RefreshCw, ShieldOff, ShieldCheck, Trash2,
  MessageCircle, KeyRound, Eye, EyeOff, BellRing, BellOff,
  Clock, Send, Loader2, GraduationCap, Check, ChevronUp,
  ChevronDown, ChevronsUpDown, Crown, BookOpen,
  CheckSquare, Square, Download, RefreshCcw, X,
  Filter,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type NotifFilter = "all" | "enabled" | "disabled";
type ExtendedAdminUser = AdminUser & {
  fullName: string | null; lastVisitAt: string | null; deviceCount: number;
  courses: { playlistId: number; title: string }[]; subscriptionStartedAt: string | null;
};
interface UserStats {
  total: number; vip: number; expired: number; expiringSoon: number;
  nonVip: number; newUsers: number; blocked: number;
  perCourse: { playlistId: number; title: string; count: number }[];
}
type StatusFilter = "all"|"vip"|"nonvip"|"expired"|"expiring"|"active"|"blocked"|"new";
type SortField = "createdAt"|"username"|"lastVisitAt"|"subscriptionExpiresAt";

const PAGE_SIZE = 25;

function normalizeWhatsApp(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) return "213" + d.slice(1);
  if (!d.startsWith("213") && d.length <= 10) return "213" + d;
  return d;
}
function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}ي`;
  return `${Math.floor(d / 30)}ش`;
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
  return exp >= now && exp <= new Date(now.getTime() + 7 * 86400000);
}

/* ── Badges using Design System classes ───────────────────────────────── */
function AccountBadge({ user }: { user: ExtendedAdminUser }) {
  if (isActiveVip(user)) return (
    <span className="ad-badge ad-badge-vip"><Crown size={10} />VIP</span>
  );
  if (isExpiredVip(user)) return <span className="ad-badge ad-badge-expired">منتهي</span>;
  return <span className="ad-badge ad-badge-normal">عادي</span>;
}
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <span className="ad-badge ad-badge-active">نشط</span>
    : <span className="ad-badge ad-badge-blocked">محظور</span>;
}
function PayBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="ad-badge ad-badge-approved">موافق</span>;
  if (status === "pending")  return <span className="ad-badge ad-badge-pending">قيد المراجعة</span>;
  return <span className="ad-badge ad-badge-rejected">مرفوض</span>;
}

/* ── Sort icon ─────────────────────────────────────────────────────────── */
function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc"|"desc" }) {
  if (sortBy !== field) return <ChevronsUpDown size={11} style={{ opacity: 0.3 }} />;
  return sortDir === "asc"
    ? <ChevronUp size={11} style={{ color: "#F97316" }} />
    : <ChevronDown size={11} style={{ color: "#F97316" }} />;
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

/* ════════════════════════════════════════════════════════════════════════ */
export function AdminUsers() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const { data: rawUsers, refetch, isFetching } = useGetAdminUsers(undefined, { request: getAdminAuthHeaders() });
  const users = rawUsers as ExtendedAdminUser[] | undefined;
  const { data: notifStats }  = useGetAdminNotificationStats({ request: getAdminAuthHeaders() });
  const { data: allPlaylists } = useGetAdminPlaylists({ request: getAdminAuthHeaders() });
  const updateMut  = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut = useResetUserIp({ request: getAdminAuthHeaders() });
  const deleteMut  = useDeleteAdminUser({ request: getAdminAuthHeaders() });
  const testPushMut = useSendUserTestPush({ request: getAdminAuthHeaders() });

  const [stats, setStats] = useState<UserStats | null>(null);
  const fetchStats = useCallback(() => {
    const h = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
    fetch("/api/admin/users/stats", { headers: h }).then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {});
  }, [getAdminAuthHeaders]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  /* ── Filters / sort / pagination ─────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [notifFilter, setNotifFilter] = useState<NotifFilter>("all");
  const [sortBy, setSortBy]   = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page, setPage]       = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  /* ── Modal states ─────────────────────────────────────────────────── */
  const [editingUser, setEditingUser] = useState<ExtendedAdminUser | null>(null);
  const [formData, setFormData]       = useState<UpdateUserInput>({});
  const [userCourseIds, setUserCourseIds]   = useState<number[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [loadingId, setLoadingId]     = useState<number | null>(null);
  const [testingId, setTestingId]     = useState<number | null>(null);
  const [resetPwUser, setResetPwUser] = useState<ExtendedAdminUser | null>(null);
  const [resetPwForm, setResetPwForm] = useState({ newPassword: "", confirmPassword: "" });
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError]     = useState("");
  const [resetPwSuccess, setResetPwSuccess] = useState("");
  const [showResetPw, setShowResetPw]       = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetIpConfirmId, setResetIpConfirmId] = useState<number | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [bulkAction, setBulkAction]     = useState("");
  const [bulkPlaylistId, setBulkPlaylistId] = useState<number | "">("");
  const [bulkLoading, setBulkLoading]   = useState(false);

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);

  /* ── Filtered + sorted list ──────────────────────────────────────── */
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
      if (sortBy === "username")    cmp = a.username.localeCompare(b.username, "ar");
      else if (sortBy === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === "lastVisitAt") cmp = (a.lastVisitAt ?? "").localeCompare(b.lastVisitAt ?? "");
      else if (sortBy === "subscriptionExpiresAt") cmp = (a.subscriptionExpiresAt ?? "").localeCompare(b.subscriptionExpiresAt ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, courseFilter, statusFilter]);

  function toggleSort(f: SortField) {
    if (sortBy === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(f); setSortDir("desc"); }
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
      const h = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
      const body: Record<string, unknown> = { action: bulkAction, userIds: [...selectedIds] };
      if (needsPlaylist) body.playlistId = Number(bulkPlaylistId);
      if (bulkAction === "extend_subscription") body.days = 30;
      if (bulkAction === "grant_vip") body.days = 365;
      const res = await fetch("/api/admin/users/bulk-action", {
        method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; affected?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "فشل التنفيذ");
      toast({ title: `تم تطبيق العملية على ${data.affected ?? selectedIds.size} مستخدم` });
      deselectAll(); setBulkAction(""); refetch(); fetchStats();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "حدث خطأ", variant: "destructive" });
    } finally { setBulkLoading(false); }
  };

  function handleExport() {
    const rows = selectedIds.size > 0 ? filtered.filter(u => selectedIds.has(u.id)) : filtered;
    const csv = [
      ["ID","اسم المستخدم","البريد","الهاتف","الحساب","الاشتراك","الانتهاء","الحالة","الدورات","آخر دخول","التسجيل"].join(","),
      ...rows.map(u => [
        u.id, u.username, u.email, u.phone ?? "", u.accountType, u.subscriptionType,
        u.subscriptionExpiresAt ?? "", u.isActive ? "نشط" : "محظور",
        u.courses.map(c => c.title).join("|"), u.lastVisitAt ?? "", u.createdAt,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })),
      download: "users.csv",
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  const handleTestPush = async (user: ExtendedAdminUser) => {
    setTestingId(user.id);
    try {
      const r = await testPushMut.mutateAsync({ id: user.id });
      if (r.attempted === 0) toast({ title: "لا يوجد اشتراك فعّال", variant: "destructive" });
      else if (r.success > 0) toast({ title: `تم الإرسال — ${r.success}/${r.attempted} جهاز` });
      else toast({ title: "فشل وصول الإشعار", variant: "destructive" });
      refetch();
    } catch { toast({ title: "تعذّر الإرسال", variant: "destructive" }); }
    finally { setTestingId(null); }
  };

  const handleEdit = async (user: ExtendedAdminUser) => {
    setEditingUser(user);
    setFormData({ accountType: user.accountType, subscriptionType: user.subscriptionType, isActive: user.isActive, phone: (user as ExtendedAdminUser & { phone?: string }).phone ?? undefined });
    setCoursesLoading(true);
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string>;
      const res = await fetch(`/api/admin/users/${user.id}/courses`, { headers: h });
      if (res.ok) setUserCourseIds(await res.json() as number[]);
    } catch { /* ignore */ } finally { setCoursesLoading(false); }
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string>;
      await fetch(`/api/admin/users/${editingUser.id}/courses`, {
        method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(userCourseIds),
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
    if (!confirm("هل أنت متأكد؟")) return;
    setLoadingId(user.id);
    try {
      const h = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`/api/admin/users/${user.id}/block`, { method: "POST", headers: h as HeadersInit });
      if (!res.ok) throw new Error();
      toast({ title: user.isActive ? "تم الحظر" : "تم رفع الحظر" });
      refetch(); fetchStats();
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
    finally { setLoadingId(null); }
  };

  const handleResetPassword = async () => {
    setResetPwError(""); setResetPwSuccess("");
    if (resetPwForm.newPassword !== resetPwForm.confirmPassword) { setResetPwError("كلمتا المرور غير متطابقتين"); return; }
    if (resetPwForm.newPassword.length < 6) { setResetPwError("6 أحرف على الأقل"); return; }
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
      setResetPwSuccess("تم التغيير بنجاح"); setResetPwForm({ newPassword: "", confirmPassword: "" });
    } catch (err) { setResetPwError(err instanceof Error ? err.message : "خطأ"); }
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

  /* ── STAT CARDS DATA ─────────────────────────────────────────────── */
  const statCards = [
    { label: "الإجمالي",      value: stats?.total       ?? "—", onClick: () => { setStatusFilter("all"); setCourseFilter("all"); } },
    { label: "VIP نشط",       value: stats?.vip          ?? "—", onClick: () => setStatusFilter("vip") },
    { label: "غير VIP",       value: stats?.nonVip       ?? "—", onClick: () => setStatusFilter("nonvip") },
    { label: "منتهي",         value: stats?.expired      ?? "—", onClick: () => setStatusFilter("expired") },
    { label: "قريب الانتهاء", value: stats?.expiringSoon ?? "—", onClick: () => setStatusFilter("expiring") },
    { label: "جديد (30ي)",    value: stats?.newUsers     ?? "—", onClick: () => setStatusFilter("new") },
    { label: "محظور",         value: stats?.blocked      ?? "—", onClick: () => setStatusFilter("blocked") },
    { label: "إشعارات فعّالة",value: notifStats?.enabled ?? "—", onClick: () => setNotifFilter("enabled") },
  ];

  const STATUS_LABELS: Record<StatusFilter, string> = {
    all:"الكل", vip:"VIP", expired:"منتهي", expiring:"قريب", nonvip:"عادي", active:"نشط", blocked:"محظور", new:"جديد",
  };

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <TooltipProvider delayDuration={120}>
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Page header ──────────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 className="ad-title">إدارة المستخدمين</h1>
            <p className="ad-sub">
              {filtered.length} مستخدم
              {filtered.length !== (users?.length ?? 0) ? ` من أصل ${users?.length ?? 0}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { refetch(); fetchStats(); }} disabled={isFetching} className="ad-btn-sm">
              <RefreshCcw size={13} className={isFetching ? "animate-spin" : ""} />تحديث
            </button>
            <button type="button" onClick={handleExport} className="ad-btn-sm">
              <Download size={13} />تصدير CSV
            </button>
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
          {statCards.map(c => (
            <button key={c.label} type="button" onClick={c.onClick} className="ad-stat" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{c.label}</div>
            </button>
          ))}
        </div>

        {/* ── Course tabs ──────────────────────────────────────────── */}
        {allPlaylists && allPlaylists.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
              <BookOpen size={12} />الدورة:
            </span>
            <button type="button" onClick={() => setCourseFilter("all")} className={`ad-course-tab${courseFilter === "all" ? " active" : ""}`}>
              <BookOpen size={12} />الكل
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: courseFilter === "all" ? "rgba(255,255,255,0.25)" : "#F3F4F6", color: courseFilter === "all" ? "#fff" : "#6B7280" }}>
                {users?.length ?? 0}
              </span>
            </button>
            {allPlaylists.map(pl => {
              const sc = courseStats.find(s => s.playlistId === pl.id);
              const active = courseFilter === pl.id;
              return (
                <button key={pl.id} type="button" onClick={() => setCourseFilter(pl.id)} className={`ad-course-tab${active ? " active" : ""}`}>
                  <BookOpen size={12} />{pl.title}
                  {sc && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: active ? "rgba(255,255,255,0.25)" : "#F3F4F6", color: active ? "#fff" : "#6B7280" }}>{sc.count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="بحث بالاسم أو البريد أو الهاتف..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ad-input"
              style={{ paddingRight: 34 }}
            />
          </div>

          {/* Status chips */}
          <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 9, padding: 3, gap: 2, flexWrap: "wrap" }}>
            {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(v => (
              <button key={v} type="button" onClick={() => setStatusFilter(v)} className={`ad-chip ${statusFilter === v ? "ad-chip-on" : "ad-chip-off"}`}>
                {STATUS_LABELS[v]}
              </button>
            ))}
          </div>

          {/* Notif chips */}
          <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 9, padding: 3, gap: 2 }}>
            {(["all","enabled","disabled"] as NotifFilter[]).map(v => (
              <button key={v} type="button" onClick={() => setNotifFilter(v)} className={`ad-chip ${notifFilter === v ? "ad-chip-on" : "ad-chip-off"}`}>
                {v === "enabled" && <BellRing size={11} />}
                {v === "disabled" && <BellOff size={11} />}
                {v === "all" ? "الكل" : v === "enabled" ? "إشعارات" : "بدون"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bulk action bar ──────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="ad-bulk-bar">
            <span style={{ fontSize: 13, fontWeight: 600, color: "#C2570E" }}>{selectedIds.size} محدد</span>
            <button type="button" onClick={deselectAll} style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer" }}>
              <X size={11} />إلغاء
            </button>
            <div style={{ width: 1, height: 16, background: "rgba(249,115,22,0.25)" }} />
            <select className="ad-select" value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
              <option value="">اختر عملية...</option>
              {BULK_ACTIONS.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
            {(bulkAction === "grant_course" || bulkAction === "revoke_course") && (
              <select className="ad-select" value={bulkPlaylistId} onChange={e => setBulkPlaylistId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">الدورة...</option>
                {allPlaylists?.map(pl => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
              </select>
            )}
            <button type="button" onClick={handleBulkAction} disabled={!bulkAction || bulkLoading} className="ad-btn-primary">
              {bulkLoading && <Loader2 size={12} className="animate-spin" />}تطبيق
            </button>
          </div>
        )}

        {/* ── Mobile cards ─────────────────────────────────────────── */}
        <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {paginated.map(user => {
            const sel = selectedIds.has(user.id);
            return (
              <div key={user.id} className="ad-card" style={{ padding: "14px 16px", opacity: user.isActive ? 1 : 0.65, boxShadow: sel ? "inset 3px 0 0 #F97316, 0 1px 4px rgba(15,23,42,0.06)" : undefined }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <button type="button" onClick={() => toggleSelect(user.id)} style={{ color: sel ? "#F97316" : "#D1D5DB", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
                      {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <button type="button" onClick={() => setDetailUserId(user.id)} style={{ fontWeight: 600, fontSize: 14, color: "#0F172A", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        {user.username}
                      </button>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{user.email}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <AccountBadge user={user} /><StatusBadge isActive={user.isActive} />
                  </div>
                </div>
                {user.courses.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                    {user.courses.map(c => <span key={c.playlistId} className="ad-course-tag">{c.title}</span>)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 10 }}>
                  {user.lastVisitAt && <span>آخر دخول: {timeAgo(user.lastVisitAt)} · </span>}
                  <span>مسجّل: {formatDate(user.createdAt)}</span>
                </div>
                <div style={{ display: "flex", gap: 2, paddingTop: 10, borderTop: "1px solid #F0F2F6" }}>
                  <IBtn tip="تفاصيل"       onClick={() => setDetailUserId(user.id)}><Eye size={14} /></IBtn>
                  <IBtn tip="تعديل"        onClick={() => handleEdit(user)}><Edit size={14} /></IBtn>
                  <IBtn tip="كلمة المرور"  onClick={() => { setResetPwUser(user); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); setResetPwForm({ newPassword: "", confirmPassword: "" }); }}><KeyRound size={14} /></IBtn>
                  <IBtn tip={user.isActive ? "حظر" : "رفع الحظر"} onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                    {user.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                  </IBtn>
                  <IBtn tip="حذف" danger onClick={() => handleDelete(user)} disabled={loadingId === user.id}><Trash2 size={14} /></IBtn>
                </div>
              </div>
            );
          })}
          {paginated.length === 0 && <EmptyState />}
        </div>

        {/* ── Desktop table ─────────────────────────────────────────── */}
        <div className="hidden md:block ad-card" style={{ overflow: "hidden", padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "right" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #E4E7ED" }}>
                  <th className="ad-th" style={{ width: 44 }}>
                    <button type="button" onClick={allPageSelected ? deselectAll : selectAllPage} style={{ background: "none", border: "none", cursor: "pointer", color: allPageSelected ? "#F97316" : "#D1D5DB" }}>
                      {allPageSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="ad-th sortable" onClick={() => toggleSort("username")} style={{ minWidth: 160 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>المستخدم <SortIcon field="username" sortBy={sortBy} sortDir={sortDir} /></span>
                  </th>
                  <th className="ad-th" style={{ minWidth: 120 }}>الهاتف</th>
                  <th className="ad-th" style={{ minWidth: 140 }}>الدورات</th>
                  <th className="ad-th">الحساب</th>
                  <th className="ad-th sortable" onClick={() => toggleSort("subscriptionExpiresAt")}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>الاشتراك <SortIcon field="subscriptionExpiresAt" sortBy={sortBy} sortDir={sortDir} /></span>
                  </th>
                  <th className="ad-th sortable" onClick={() => toggleSort("lastVisitAt")}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>آخر دخول <SortIcon field="lastVisitAt" sortBy={sortBy} sortDir={sortDir} /></span>
                  </th>
                  <th className="ad-th sortable" onClick={() => toggleSort("createdAt")}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>التسجيل <SortIcon field="createdAt" sortBy={sortBy} sortDir={sortDir} /></span>
                  </th>
                  <th className="ad-th">الأجهزة</th>
                  <th className="ad-th">IP</th>
                  <th className="ad-th">الحالة</th>
                  <th className="ad-th" style={{ position: "sticky", left: 0, background: "#F4F7FA", borderRight: "1.5px solid #E4E7ED", zIndex: 2 }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((user, idx) => {
                  const expired  = isExpiredVip(user);
                  const expiring = isExpiringSoon(user);
                  const sel = selectedIds.has(user.id);
                  const rowBg = sel ? "#FFF7ED" : idx % 2 === 0 ? "#ffffff" : "#FAFBFC";
                  return (
                    <tr
                      key={user.id}
                      className="ad-tr"
                      style={{
                        background: rowBg,
                        opacity: user.isActive ? 1 : 0.65,
                        boxShadow: sel ? "inset 3px 0 0 #F97316" : undefined,
                      }}
                    >
                      <td className="ad-td">
                        <button type="button" onClick={() => toggleSelect(user.id)} style={{ background: "none", border: "none", cursor: "pointer", color: sel ? "#F97316" : "#D1D5DB" }}>
                          {sel ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="ad-td">
                        <button type="button" onClick={() => setDetailUserId(user.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "right" }}>
                          <div style={{ fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>{user.username}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                          {user.fullName && <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{user.fullName}</div>}
                        </button>
                      </td>
                      <td className="ad-td">
                        {user.phone ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11.5, fontFamily: "monospace", color: "#374151" }} dir="ltr">{user.phone}</span>
                            <a href={`https://wa.me/${normalizeWhatsApp(user.phone)}`} target="_blank" rel="noopener noreferrer"
                              style={{ width: 22, height: 22, borderRadius: "50%", background: "#F0FDF4", border: "1px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", color: "#166534", flexShrink: 0 }}>
                              <MessageCircle size={11} />
                            </a>
                          </div>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td className="ad-td">
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {user.courses.length === 0
                            ? <span style={{ color: "#D1D5DB" }}>—</span>
                            : user.courses.map(c => <span key={c.playlistId} className="ad-course-tag">{c.title}</span>)}
                        </div>
                      </td>
                      <td className="ad-td"><AccountBadge user={user} /></td>
                      <td className="ad-td">
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: "#6B7280" }}>{user.subscriptionType}</span>
                          {user.subscriptionExpiresAt && (
                            <div style={{ marginTop: 2, fontWeight: 500, color: expired ? "#BE123C" : expiring ? "#B45309" : "#166534" }}>
                              {formatDate(user.subscriptionExpiresAt)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="ad-td">
                        {user.lastVisitAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7280", cursor: "default", whiteSpace: "nowrap" }}>
                                <Clock size={12} style={{ color: "#9CA3AF" }} />{timeAgo(user.lastVisitAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent style={{ fontSize: 11 }}>{formatDate(user.lastVisitAt)}</TooltipContent>
                          </Tooltip>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td className="ad-td" style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>{formatDate(user.createdAt)}</td>
                      <td className="ad-td">
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7280" }}>
                          {user.deviceCount > 0 ? user.deviceCount : "—"}
                          {user.pushState === "enabled" && <BellRing size={11} style={{ color: "#166534" }} />}
                          {user.pushState === "denied"  && <BellOff size={11} style={{ color: "#B45309" }} />}
                          {user.pushState === "broken"  && <BellOff size={11} style={{ color: "#BE123C" }} />}
                        </div>
                      </td>
                      <td className="ad-td">
                        {user.accountType === "vip" ? (
                          <div>
                            <span className={`ad-badge ${user.ipCount >= 2 ? "ad-badge-expired" : "ad-badge-normal"}`} style={{ fontFamily: "monospace", fontSize: 10 }}>
                              {user.ipCount}/2
                            </span>
                            {user.ipAddress && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#94A3B8", marginTop: 2 }}>{user.ipAddress}</div>}
                          </div>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td className="ad-td"><StatusBadge isActive={user.isActive} /></td>
                      <td className="ad-td" style={{ position: "sticky", left: 0, background: rowBg, borderRight: "1.5px solid #E4E7ED", zIndex: 1 }}>
                        <div style={{ display: "flex", gap: 1 }}>
                          <IBtn tip="تفاصيل"        onClick={() => setDetailUserId(user.id)}><Eye size={13} /></IBtn>
                          <IBtn tip="تعديل"         onClick={() => handleEdit(user)}><Edit size={13} /></IBtn>
                          <IBtn tip="كلمة المرور"   onClick={() => { setResetPwUser(user); setResetPwError(""); setResetPwSuccess(""); setShowResetPw(false); setShowResetConfirm(false); setResetPwForm({ newPassword: "", confirmPassword: "" }); }}><KeyRound size={13} /></IBtn>
                          <IBtn tip="تصفير IP"      onClick={() => setResetIpConfirmId(user.id)} disabled={user.ipCount === 0}><RefreshCw size={13} /></IBtn>
                          <IBtn tip="إشعار تجريبي" onClick={() => handleTestPush(user)} disabled={testingId === user.id}>
                            {testingId === user.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          </IBtn>
                          <IBtn tip={user.isActive ? "حظر" : "رفع الحظر"} onClick={() => handleBlock(user)} disabled={loadingId === user.id}>
                            {user.isActive ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                          </IBtn>
                          <IBtn tip="حذف" danger onClick={() => handleDelete(user)} disabled={loadingId === user.id}>
                            <Trash2 size={13} />
                          </IBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={12} style={{ padding: "60px 0", textAlign: "center" }}><EmptyState /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #F0F2F6", fontSize: 12, color: "#6B7280" }}>
              <span>صفحة {page} من {totalPages} — {filtered.length} نتيجة</span>
              <div style={{ display: "flex", gap: 4 }}>
                {["«","‹"].map((ch, i) => (
                  <PagBtn key={ch} disabled={page === 1} onClick={() => setPage(i === 0 ? 1 : page - 1)}>{ch}</PagBtn>
                ))}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const pg = start + i;
                  return pg <= totalPages
                    ? <PagBtn key={pg} active={pg === page} onClick={() => setPage(pg)}>{pg}</PagBtn>
                    : null;
                })}
                {["›","»"].map((ch, i) => (
                  <PagBtn key={ch} disabled={page === totalPages} onClick={() => setPage(i === 0 ? page + 1 : totalPages)}>{ch}</PagBtn>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Modals ────────────────────────────────────────────────── */}
        <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} getAdminAuthHeaders={getAdminAuthHeaders} />

        {/* Reset Password */}
        <Dialog open={!!resetPwUser} onOpenChange={o => { if (!o) setResetPwUser(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle style={{ fontSize: 15, color: "#0F172A" }}>تغيير كلمة المرور — {resetPwUser?.username}</DialogTitle></DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              {[
                { label: "كلمة المرور الجديدة", key: "newPassword" as const, show: showResetPw, toggle: () => setShowResetPw(v => !v) },
                { label: "تأكيد كلمة المرور",   key: "confirmPassword" as const, show: showResetConfirm, toggle: () => setShowResetConfirm(v => !v) },
              ].map(f => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <Label style={{ fontSize: 12.5, color: "#374151" }}>{f.label}</Label>
                  <div style={{ position: "relative" }}>
                    <input type={f.show ? "text" : "password"} className="ad-input" placeholder="6 أحرف على الأقل"
                      value={resetPwForm[f.key]} onChange={e => setResetPwForm({ ...resetPwForm, [f.key]: e.target.value })}
                      style={{ paddingLeft: 36 }} />
                    <button type="button" onClick={f.toggle} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>
                      {f.show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ))}
              {resetPwError   && <p style={{ fontSize: 12, color: "#BE123C", background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 8, padding: "8px 12px" }}>{resetPwError}</p>}
              {resetPwSuccess && <p style={{ fontSize: 12, color: "#166534", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "8px 12px" }}>{resetPwSuccess}</p>}
              <button type="button" onClick={handleResetPassword} disabled={resetPwLoading} className="ad-btn-primary" style={{ width: "100%", justifyContent: "center", height: 38 }}>
                {resetPwLoading ? "جاري الحفظ..." : "تغيير كلمة المرور"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit User */}
        <Dialog open={!!editingUser} onOpenChange={o => !o && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle style={{ fontSize: 15, color: "#0F172A" }}>تعديل — {editingUser?.username}</DialogTitle></DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              {[
                { label: "نوع الحساب", key: "accountType" as const, options: [{ v: "normal", l: "عادي" }, { v: "vip", l: "VIP" }] },
                { label: "خطة الاشتراك", key: "subscriptionType" as const, options: [{ v: "demo", l: "تجريبي" }, { v: "monthly", l: "شهري" }, { v: "annual", l: "سنوي" }, { v: "lifetime", l: "مدى الحياة" }] },
                { label: "حالة الحساب", key: "isActive" as const, options: [{ v: "true", l: "نشط" }, { v: "false", l: "موقوف" }] },
              ].map(f => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <Label style={{ fontSize: 12.5, color: "#374151" }}>{f.label}</Label>
                  <select className="ad-select" style={{ width: "100%", height: 38 }}
                    value={f.key === "isActive" ? String(formData[f.key]) : String(formData[f.key] ?? "")}
                    onChange={e => setFormData({ ...formData, [f.key]: f.key === "isActive" ? e.target.value === "true" : e.target.value as "vip"|"normal"|"demo"|"monthly"|"annual"|"lifetime" })}>
                    {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <Label style={{ fontSize: 12.5, color: "#374151" }}>رقم الهاتف</Label>
                <PhoneNumberInput value={formData.phone ?? undefined} onChange={v => setFormData({ ...formData, phone: v || undefined })} placeholder="5X XX XX XX XX" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <Label style={{ fontSize: 12.5, color: "#374151", display: "flex", alignItems: "center", gap: 5 }}>
                  <GraduationCap size={13} />الدورات الممنوحة
                </Label>
                {coursesLoading ? (
                  <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={16} className="animate-spin" style={{ color: "#9CA3AF" }} /></div>
                ) : !allPlaylists || allPlaylists.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#9CA3AF" }}>لا توجد دورات</p>
                ) : (
                  <div style={{ border: "1px solid #E4E7ED", borderRadius: 10, overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
                    {allPlaylists.map((pl, i) => {
                      const sel = userCourseIds.includes(pl.id);
                      return (
                        <button key={pl.id} type="button" onClick={() => setUserCourseIds(prev => sel ? prev.filter(x => x !== pl.id) : [...prev, pl.id])}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: sel ? "#FFF7ED" : i % 2 === 0 ? "#fff" : "#FAFBFC", border: "none", borderBottom: i < allPlaylists.length - 1 ? "1px solid #F0F2F6" : "none", cursor: "pointer", textAlign: "right" }}>
                          <span style={{ width: 16, height: 16, borderRadius: 5, border: sel ? "none" : "1.5px solid #D1D5DB", background: sel ? "#F97316" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {sel && <Check size={10} color="#fff" />}
                          </span>
                          <span style={{ fontSize: 13, color: "#374151" }}>{pl.title || `دورة #${pl.id}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleSave} disabled={updateMut.isPending} className="ad-btn-primary" style={{ width: "100%", justifyContent: "center", height: 38 }}>
                {updateMut.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset IP confirm */}
        <Dialog open={resetIpConfirmId !== null} onOpenChange={o => { if (!o) setResetIpConfirmId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle style={{ fontSize: 15, color: "#0F172A" }}>تأكيد تصفير IP</DialogTitle></DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              <p style={{ fontSize: 13, color: "#475569" }}>سيتمكن المستخدم من الدخول من أي جهاز جديد بعد التصفير.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={confirmResetIp} disabled={resetIpMut.isPending} className="ad-btn-primary" style={{ flex: 1, justifyContent: "center", height: 38 }}>
                  {resetIpMut.isPending ? "جاري التصفير..." : "تأكيد"}
                </button>
                <button type="button" onClick={() => setResetIpConfirmId(null)} className="ad-btn-sm" style={{ flex: 1, justifyContent: "center", height: 38 }}>إلغاء</button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}

/* ── Micro-components ───────────────────────────────────────────────────── */

function IBtn({ tip, onClick, disabled, danger, children }: {
  tip: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} disabled={disabled} className={`ad-ibtn${danger ? " danger" : ""}`}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent style={{ fontSize: 11 }}>{tip}</TooltipContent>
    </Tooltip>
  );
}

function PagBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 7, fontSize: 12, fontWeight: active ? 600 : 400,
        background: active ? "#F97316" : "#fff", color: active ? "#fff" : "#4B5563",
        border: `1px solid ${active ? "#F97316" : "#E4E7ED"}`,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms",
      }}>
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#94A3B8" }}>
      <Filter size={28} style={{ opacity: 0.3 }} />
      <p style={{ fontSize: 13 }}>لا يوجد مستخدمون مطابقون</p>
    </div>
  );
}
