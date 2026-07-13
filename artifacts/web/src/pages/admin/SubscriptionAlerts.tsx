import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, MessageCircle, ShieldX, ShieldCheck,
  CalendarDays, CheckCircle2, AlertTriangle, Clock, Trash2, AlertCircle,
} from "lucide-react";

const API_BASE = "";

interface SubUser {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  subscriptionType: "monthly" | "annual";
  accountType: string;
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
  startDerived: boolean;
  endDerived: boolean;
  driveRevokedAt: string | null;
  isMissingData: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysLeft: number | null;
  daysSinceExpiry: number | null;
}

type SectionFilter = "active" | "soon" | "expired" | "missing";

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatArabicDate(iso: string | null | undefined): string {
  if (!iso) return "غير محدد";
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() < 2020) return "غير محدد";
  return new Intl.DateTimeFormat("ar-DZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function normalizeWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "213" + digits.slice(1);
  if (!digits.startsWith("213") && digits.length <= 10) return "213" + digits;
  return digits;
}

type StatusColor = "green" | "yellow" | "red" | "gray";

function getStatus(u: SubUser): StatusColor {
  if (u.isMissingData) return "gray";
  if (u.isExpired) return "red";
  if (u.isExpiringSoon) return "yellow";
  return "green";
}

// ─── Status badge ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<StatusColor, { label: string; dotCls: string; badgeCls: string }> = {
  green:  { label: "نشط",           dotCls: "bg-emerald-500",  badgeCls: "bg-emerald-50  text-emerald-700  border-emerald-200"  },
  yellow: { label: "قريب الانتهاء", dotCls: "bg-amber-500",    badgeCls: "bg-amber-50    text-amber-700    border-amber-200"    },
  red:    { label: "منتهي",         dotCls: "bg-red-500",      badgeCls: "bg-red-50      text-red-700      border-red-200"      },
  gray:   { label: "بيانات ناقصة", dotCls: "bg-gray-400",     badgeCls: "bg-gray-100    text-gray-600     border-gray-200"     },
};

function StatusBadge({ color }: { color: StatusColor }) {
  const { label, dotCls, badgeCls } = STATUS_CONFIG[color];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  );
}

// ─── Days chip ─────────────────────────────────────────────────────────────
function DaysChip({ user }: { user: SubUser }) {
  if (user.isMissingData) return <span className="text-sm text-gray-400">—</span>;
  if (user.isExpired && user.daysSinceExpiry !== null) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
        منذ {user.daysSinceExpiry} يوم
      </span>
    );
  }
  if (user.daysLeft !== null) {
    if (user.daysLeft <= 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
          اليوم
        </span>
      );
    }
    if (user.isExpiringSoon) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
          {user.daysLeft} يوم
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        {user.daysLeft} يوم
      </span>
    );
  }
  return <span className="text-sm text-gray-400">—</span>;
}

// ─── Date cell ─────────────────────────────────────────────────────────────
function DateCell({ iso, derived, expired }: { iso: string | null; derived?: boolean; expired?: boolean }) {
  const label = formatArabicDate(iso);
  if (label === "غير محدد") {
    return <span className="text-sm text-gray-400">غير محدد</span>;
  }
  return (
    <div>
      <span className={`text-sm font-medium ${expired ? "text-red-600" : "text-gray-800"}`}>{label}</span>
      {derived && <p className="text-[10px] text-gray-400 mt-0.5">(تقديري)</p>}
    </div>
  );
}

// ─── User table row ────────────────────────────────────────────────────────
function UserRow({
  user,
  onRevoke,
  revoking,
}: {
  user: SubUser;
  onRevoke: (id: number) => void;
  revoking: boolean;
}) {
  const color = getStatus(user);
  return (
    <tr className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-gray-50/70 ${user.driveRevokedAt ? "opacity-50" : ""}`}>
      {/* User */}
      <td className="px-4 py-3.5 align-middle">
        <p className="font-semibold text-sm text-gray-900 leading-tight">{user.username}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{user.email}</p>
      </td>

      {/* Phone */}
      <td className="px-4 py-3.5 align-middle">
        {user.phone ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-600" dir="ltr">{user.phone}</span>
            <a
              href={`https://wa.me/${normalizeWhatsApp(user.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="واتساب"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 text-green-700 transition-colors shrink-0"
            >
              <MessageCircle className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      {/* Start date */}
      <td className="px-4 py-3.5 align-middle">
        <DateCell iso={user.subscriptionStartedAt} derived={user.startDerived} />
      </td>

      {/* End date */}
      <td className="px-4 py-3.5 align-middle">
        <DateCell iso={user.subscriptionExpiresAt} derived={user.endDerived} expired={user.isExpired} />
      </td>

      {/* Days */}
      <td className="px-4 py-3.5 align-middle">
        <DaysChip user={user} />
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 align-middle">
        <StatusBadge color={color} />
      </td>

      {/* Drive */}
      <td className="px-4 py-3.5 align-middle">
        {user.driveRevokedAt ? (
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" /> تمت الإزالة
            </span>
            <p className="text-[10px] text-gray-400 mt-0.5">{formatArabicDate(user.driveRevokedAt)}</p>
          </div>
        ) : (
          <button
            onClick={() => onRevoke(user.id)}
            disabled={revoking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldX className="w-3 h-3" />}
            إزالة Drive
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Section component ─────────────────────────────────────────────────────
interface TabConfig {
  v: SectionFilter;
  label: string;
  data: SubUser[];
  activeCls: string;
  countCls: string;
}

function SubSection({
  title,
  accentCls,
  headerBg,
  users,
  onRevoke,
  onRevokeAll,
  revokingId,
  revokeAllPending,
}: {
  title: string;
  accentCls: string;
  headerBg: string;
  users: SubUser[];
  onRevoke: (id: number) => void;
  onRevokeAll: () => void;
  revokingId: number | null;
  revokeAllPending: boolean;
}) {
  const [filter, setFilter] = useState<SectionFilter>("active");

  const active  = users.filter(u => !u.isMissingData && !u.isExpired && !u.isExpiringSoon);
  const soon    = users.filter(u => !u.isMissingData && u.isExpiringSoon);
  const expired = users.filter(u => !u.isMissingData && u.isExpired);
  const missing = users.filter(u => u.isMissingData);

  const displayed =
    filter === "active" ? active : filter === "soon" ? soon :
    filter === "expired" ? expired : missing;

  const pendingExpired = expired.filter(u => !u.driveRevokedAt).length;

  const TABS: TabConfig[] = [
    {
      v: "active", label: "نشطة", data: active,
      activeCls: "bg-emerald-600 text-white border-emerald-600",
      countCls: "bg-emerald-100 text-emerald-700",
    },
    {
      v: "soon", label: "قريبة الانتهاء", data: soon,
      activeCls: "bg-amber-500 text-white border-amber-500",
      countCls: "bg-amber-100 text-amber-700",
    },
    {
      v: "expired", label: "منتهية", data: expired,
      activeCls: "bg-red-600 text-white border-red-600",
      countCls: "bg-red-100 text-red-700",
    },
    {
      v: "missing", label: "بيانات ناقصة", data: missing,
      activeCls: "bg-gray-600 text-white border-gray-600",
      countCls: "bg-gray-100 text-gray-600",
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Section header */}
      <div className={`${headerBg} px-5 py-4 border-b border-gray-200`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className={`w-4.5 h-4.5 ${accentCls}`} />
            <h2 className="font-bold text-base text-gray-900">{title}</h2>
            <span className="text-xs text-gray-500 font-normal">({users.length} مشترك)</span>
          </div>

          {/* Tab strip */}
          <div className="flex flex-wrap gap-1.5">
            {TABS.map(tab => (
              <button
                key={tab.v}
                onClick={() => setFilter(tab.v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  filter === tab.v
                    ? tab.activeCls
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800"
                }`}
              >
                {tab.label}
                {tab.data.length > 0 && (
                  <span className={`rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold ${
                    filter === tab.v ? "bg-white/25 text-white" : tab.countCls
                  }`}>
                    {tab.data.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Missing data notice */}
      {filter === "missing" && missing.length > 0 && (
        <div className="flex items-start gap-2.5 px-5 py-3 bg-amber-50 border-b border-amber-100">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            هؤلاء المشتركون لا يملكون تاريخ بداية ولا تاريخ نهاية في قاعدة البيانات.
            يُرجى تحديث بياناتهم من صفحة المستخدمين.
          </p>
        </div>
      )}

      {/* Revoke-all bar */}
      {filter === "expired" && pendingExpired > 0 && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-red-50 border-b border-red-100">
          <p className="text-sm font-semibold text-red-700">
            {pendingExpired} مستخدم لم تُزَل صلاحياتهم من Google Drive بعد
          </p>
          <button
            onClick={onRevokeAll}
            disabled={revokeAllPending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {revokeAllPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            إزالة الجميع ({pendingExpired})
          </button>
        </div>
      )}

      {/* Table / Empty */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <CheckCircle2 className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-500">
            {filter === "active"  && "لا يوجد مشتركون نشطون في هذا القسم"}
            {filter === "soon"    && "لا يوجد مشتركون قريبون من الانتهاء"}
            {filter === "expired" && "لا يوجد مشتركون منتهون — ممتاز!"}
            {filter === "missing" && "جميع المشتركين لديهم بيانات كاملة ✓"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">المستخدم</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">الهاتف</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">بداية الاشتراك</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">نهاية الاشتراك</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {filter === "expired" ? "منذ الانتهاء" : "الأيام المتبقية"}
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Drive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(user => (
                <UserRow
                  key={user.id}
                  user={user}
                  onRevoke={onRevoke}
                  revoking={revokingId === user.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Summary stat card ─────────────────────────────────────────────────────
function StatCard({
  count, label, icon: Icon, bg, iconCls, textCls,
}: {
  count: number; label: string; icon: React.ElementType;
  bg: string; iconCls: string; textCls: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${bg}`}>
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${iconCls} shrink-0`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className={`text-xl font-bold leading-tight ${textCls}`}>{count}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export function AdminSubscriptionAlerts() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const authHeaders = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  const { data: allUsers = [], isLoading, refetch, isRefetching } = useQuery<SubUser[]>({
    queryKey: ["admin-expired-users"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/expired`, {
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("فشل تحميل البيانات");
      return res.json();
    },
  });

  const revokeOneMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/revoke-drive`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("فشل");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: "✓ تم تسجيل إزالة صلاحية Google Drive" });
    },
    onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
    onSettled: () => setRevokingId(null),
  });

  const revokeAllMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/revoke-drive-all`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("فشل");
      return res.json() as Promise<{ revoked: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: `✓ تمت إزالة ${data.revoked} مستخدم من Google Drive` });
    },
    onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
  });

  const handleRevoke = (id: number) => {
    setRevokingId(id);
    revokeOneMut.mutate(id);
  };

  const monthly = allUsers.filter(u => u.subscriptionType === "monthly");
  const annual  = allUsers.filter(u => u.subscriptionType === "annual");

  const withData     = allUsers.filter(u => !u.isMissingData);
  const totalActive  = withData.filter(u => !u.isExpired && !u.isExpiringSoon).length;
  const totalSoon    = withData.filter(u => u.isExpiringSoon).length;
  const totalExpired = withData.filter(u => u.isExpired).length;
  const totalMissing = allUsers.filter(u => u.isMissingData).length;

  return (
    <div className="space-y-6 pb-10" dir="rtl">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">تنبيهات الاشتراكات</h1>
          <p className="text-sm text-gray-500 mt-1">
            متابعة الاشتراكات الشهرية والسنوية — الأيام محسوبة تلقائياً من قاعدة البيانات
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 shadow-sm transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-primary" : ""}`} />
          تحديث البيانات
        </button>
      </div>

      {/* ── Summary stats ── */}
      {!isLoading && allUsers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard count={allUsers.length} label="إجمالي المشتركين"
            icon={CalendarDays}
            bg="bg-white border-gray-200"
            iconCls="bg-gray-100 text-gray-600"
            textCls="text-gray-900" />
          <StatCard count={totalActive} label="نشط"
            icon={CheckCircle2}
            bg="bg-emerald-50 border-emerald-200"
            iconCls="bg-emerald-100 text-emerald-700"
            textCls="text-emerald-800" />
          <StatCard count={totalSoon} label="قريب الانتهاء"
            icon={Clock}
            bg="bg-amber-50 border-amber-200"
            iconCls="bg-amber-100 text-amber-700"
            textCls="text-amber-800" />
          <StatCard count={totalExpired} label="منتهي"
            icon={AlertTriangle}
            bg="bg-red-50 border-red-200"
            iconCls="bg-red-100 text-red-700"
            textCls="text-red-800" />
          <StatCard count={totalMissing} label="بيانات ناقصة"
            icon={AlertCircle}
            bg="bg-gray-50 border-gray-200"
            iconCls="bg-gray-100 text-gray-500"
            textCls="text-gray-700" />
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">جاري تحميل البيانات...</span>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Monthly */}
          <SubSection
            title="الاشتراكات الشهرية"
            accentCls="text-blue-600"
            headerBg="bg-blue-50/60"
            users={monthly}
            onRevoke={handleRevoke}
            onRevokeAll={() => revokeAllMut.mutate()}
            revokingId={revokingId}
            revokeAllPending={revokeAllMut.isPending}
          />

          {/* Annual */}
          <SubSection
            title="الاشتراكات السنوية"
            accentCls="text-violet-600"
            headerBg="bg-violet-50/60"
            users={annual}
            onRevoke={handleRevoke}
            onRevokeAll={() => revokeAllMut.mutate()}
            revokingId={revokingId}
            revokeAllPending={revokeAllMut.isPending}
          />
        </div>
      )}
    </div>
  );
}
