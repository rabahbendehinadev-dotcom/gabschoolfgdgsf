import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, MessageCircle, ShieldX, ShieldCheck,
  CalendarDays, CheckCircle2, AlertTriangle, Clock, Trash2,
  AlertCircle,
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

// ─── Date helpers ──────────────────────────────────────────────────────────
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

// ─── Status helpers ────────────────────────────────────────────────────────
function statusColor(u: SubUser): "green" | "yellow" | "red" | "gray" {
  if (u.isMissingData) return "gray";
  if (u.isExpired) return "red";
  if (u.isExpiringSoon) return "yellow";
  return "green";
}

const STATUS_LABELS: Record<ReturnType<typeof statusColor>, string> = {
  green:  "نشط",
  yellow: "قريب الانتهاء",
  red:    "منتهي",
  gray:   "بيانات ناقصة",
};

const STATUS_CHIP_CLASS: Record<ReturnType<typeof statusColor>, string> = {
  green:  "bg-green-500/15  text-green-400  border-green-500/20",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  red:    "bg-red-500/15    text-red-400    border-red-500/20",
  gray:   "bg-white/8       text-muted-foreground border-white/10",
};

// ─── Days chip ────────────────────────────────────────────────────────────
function DaysChip({ user }: { user: SubUser }) {
  if (user.isMissingData) return <span className="text-xs text-muted-foreground/50">—</span>;
  if (user.isExpired && user.daysSinceExpiry !== null) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/12 px-2 py-0.5 text-[11px] font-semibold text-red-400">
        منذ {user.daysSinceExpiry} يوم
      </span>
    );
  }
  if (user.daysLeft !== null) {
    if (user.daysLeft <= 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-500/12 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">
          اليوم
        </span>
      );
    }
    const cls = user.isExpiringSoon
      ? "bg-yellow-500/12 text-yellow-400"
      : "bg-green-500/10 text-green-400";
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
        {user.daysLeft} يوم
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground/50">—</span>;
}

// ─── Date cell with derived indicator ─────────────────────────────────────
function DateCell({ iso, derived, expired }: { iso: string | null; derived: boolean; expired?: boolean }) {
  const label = formatArabicDate(iso);
  if (label === "غير محدد") {
    return <span className="text-xs text-muted-foreground/50">غير محدد</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-xs font-medium ${expired ? "text-red-400" : ""}`}>{label}</span>
      {derived && (
        <span className="text-[10px] text-muted-foreground/60">(تقديري)</span>
      )}
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────
function UserRow({
  user,
  onRevoke,
  revoking,
}: {
  user: SubUser;
  onRevoke: (id: number) => void;
  revoking: boolean;
}) {
  const color = statusColor(user);
  return (
    <tr
      className={`border-b border-white/[0.035] last:border-0 transition-colors hover:bg-white/[0.02] ${user.driveRevokedAt ? "opacity-40" : ""}`}
    >
      {/* User */}
      <td className="px-4 py-3 align-middle">
        <div className="font-medium text-sm leading-tight">{user.username}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[190px] truncate">{user.email}</div>
      </td>

      {/* Phone */}
      <td className="px-4 py-3 align-middle">
        {user.phone ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-muted-foreground" dir="ltr">{user.phone}</span>
            <a
              href={`https://wa.me/${normalizeWhatsApp(user.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/12 hover:bg-green-500/25 text-green-400 transition-colors shrink-0"
            >
              <MessageCircle className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground/40">—</span>
        )}
      </td>

      {/* Start */}
      <td className="px-4 py-3 align-middle">
        <DateCell iso={user.subscriptionStartedAt} derived={user.startDerived} />
      </td>

      {/* End */}
      <td className="px-4 py-3 align-middle">
        <DateCell iso={user.subscriptionExpiresAt} derived={user.endDerived} expired={user.isExpired} />
      </td>

      {/* Days */}
      <td className="px-4 py-3 align-middle">
        <DaysChip user={user} />
      </td>

      {/* Status */}
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP_CLASS[color]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            color === "green" ? "bg-green-400" :
            color === "yellow" ? "bg-yellow-400" :
            color === "red" ? "bg-red-400" : "bg-white/30"
          }`} />
          {STATUS_LABELS[color]}
        </span>
      </td>

      {/* Drive */}
      <td className="px-4 py-3 align-middle">
        {user.driveRevokedAt ? (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-medium">
              <ShieldCheck className="w-3 h-3" /> تمت الإزالة
            </span>
            <span className="text-[10px] text-muted-foreground">{formatArabicDate(user.driveRevokedAt)}</span>
          </div>
        ) : (
          <button
            onClick={() => onRevoke(user.id)}
            disabled={revoking}
            className="inline-flex items-center gap-1 rounded-md bg-red-500/8 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] font-medium px-2 py-1.5 transition-colors disabled:opacity-50"
          >
            {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldX className="w-3 h-3" />}
            إزالة Drive
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Section component ────────────────────────────────────────────────────
function SubSection({
  title,
  iconColor,
  users,
  onRevoke,
  onRevokeAll,
  revokingId,
  revokeAllPending,
}: {
  title: string;
  iconColor: string;
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
    filter === "active"  ? active  :
    filter === "soon"    ? soon    :
    filter === "expired" ? expired : missing;

  const pendingExpired = expired.filter(u => !u.driveRevokedAt).length;

  interface Tab { v: SectionFilter; label: string; data: SubUser[]; chipCls: string }
  const TABS: Tab[] = [
    { v: "active",  label: "نشطة",            data: active,  chipCls: "text-green-400  bg-green-500/10  border-green-500/20"  },
    { v: "soon",    label: "قريبة الانتهاء",  data: soon,    chipCls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
    { v: "expired", label: "منتهية",           data: expired, chipCls: "text-red-400    bg-red-500/10    border-red-500/20"    },
    { v: "missing", label: "بيانات ناقصة",    data: missing, chipCls: "text-muted-foreground bg-white/6 border-white/10"     },
  ];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.015] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-white/6">
        <div className="flex items-center gap-2">
          <CalendarDays className={`w-4 h-4 ${iconColor}`} />
          <span className="font-bold text-[15px]">{title}</span>
          <span className="text-xs text-muted-foreground">({users.length} مشترك)</span>
        </div>

        {/* Tab strip */}
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.v}
              onClick={() => setFilter(tab.v)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-all ${
                filter === tab.v ? tab.chipCls : "border-transparent bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tab.label}
              {tab.data.length > 0 && (
                <span className={`rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold ${
                  filter === tab.v ? "bg-white/25" : "bg-white/10 text-foreground"
                }`}>
                  {tab.data.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Missing data notice */}
      {filter === "missing" && missing.length > 0 && (
        <div className="flex items-start gap-2 px-5 py-3 bg-amber-500/5 border-b border-amber-500/15 text-xs text-amber-400/80">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            هؤلاء المشتركون لا يملكون تاريخ بداية ولا تاريخ نهاية في قاعدة البيانات.
            يُرجى تحديث بياناتهم من صفحة المستخدمين.
          </span>
        </div>
      )}

      {/* Revoke-all bar */}
      {filter === "expired" && pendingExpired > 0 && (
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-red-500/5 border-b border-red-500/12">
          <span className="text-xs text-red-400 font-medium">
            {pendingExpired} مستخدم لم تُزَل صلاحياتهم من Drive
          </span>
          <button
            onClick={onRevokeAll}
            disabled={revokeAllPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-500/12 hover:bg-red-500/22 border border-red-500/25 text-red-400 text-[11px] font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            {revokeAllPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            إزالة الجميع ({pendingExpired})
          </button>
        </div>
      )}

      {/* Table or empty */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <CheckCircle2 className="w-8 h-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            {filter === "active"  && "لا يوجد مشتركون نشطون"}
            {filter === "soon"    && "لا يوجد مشتركون قريبون من الانتهاء"}
            {filter === "expired" && "لا يوجد مشتركون منتهون"}
            {filter === "missing" && "جميع المشتركين لديهم بيانات كاملة"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04] text-[10px] uppercase tracking-wide text-muted-foreground/70">
                <th className="px-4 py-2.5 text-right font-medium">المستخدم</th>
                <th className="px-4 py-2.5 text-right font-medium">الهاتف</th>
                <th className="px-4 py-2.5 text-right font-medium">بداية الاشتراك</th>
                <th className="px-4 py-2.5 text-right font-medium">نهاية الاشتراك</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  {filter === "expired" ? "منذ الانتهاء" : "الأيام المتبقية"}
                </th>
                <th className="px-4 py-2.5 text-right font-medium">الحالة</th>
                <th className="px-4 py-2.5 text-right font-medium">Drive</th>
              </tr>
            </thead>
            <tbody>
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

// ─── Page ─────────────────────────────────────────────────────────────────
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

  const monthly = allUsers.filter(u => u.subscriptionType === "monthly");
  const annual  = allUsers.filter(u => u.subscriptionType === "annual");

  // Summary stats (non-missing only)
  const withData      = allUsers.filter(u => !u.isMissingData);
  const totalActive   = withData.filter(u => !u.isExpired && !u.isExpiringSoon).length;
  const totalSoon     = withData.filter(u => u.isExpiringSoon).length;
  const totalExpired  = withData.filter(u => u.isExpired).length;
  const totalMissing  = allUsers.filter(u => u.isMissingData).length;

  const handleRevoke = (id: number) => {
    setRevokingId(id);
    revokeOneMut.mutate(id);
  };

  return (
    <div className="space-y-6 pb-10" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">تنبيهات الاشتراكات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            متابعة الاشتراكات الشهرية والسنوية — الأيام محسوبة تلقائياً من قاعدة البيانات
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium px-3 py-2 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {/* Summary chips */}
      {!isLoading && allUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[
            { count: totalActive,  label: "نشط",             icon: CheckCircle2, cls: "text-green-400  bg-green-500/8  border-green-500/20"  },
            { count: totalSoon,    label: "قريب الانتهاء",   icon: Clock,        cls: "text-yellow-400 bg-yellow-500/8 border-yellow-500/20" },
            { count: totalExpired, label: "منتهي",            icon: AlertTriangle,cls: "text-red-400    bg-red-500/8    border-red-500/20"    },
            { count: totalMissing, label: "بيانات ناقصة",    icon: AlertCircle,  cls: "text-muted-foreground bg-white/5 border-white/10"    },
            { count: allUsers.length, label: "الإجمالي",     icon: CalendarDays, cls: "text-foreground bg-white/5 border-white/10"           },
          ].map(({ count, label, icon: Icon, cls }) => (
            <div key={label} className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 ${cls}`}>
              <Icon className="w-3.5 h-3.5" />
              <span className="text-sm font-semibold">{count}</span>
              <span className="text-xs opacity-80">{label}</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>جاري التحميل...</span>
        </div>
      ) : (
        <div className="space-y-5">
          <SubSection
            title="الاشتراكات الشهرية"
            iconColor="text-blue-400"
            users={monthly}
            onRevoke={handleRevoke}
            onRevokeAll={() => revokeAllMut.mutate()}
            revokingId={revokingId}
            revokeAllPending={revokeAllMut.isPending}
          />
          <SubSection
            title="الاشتراكات السنوية"
            iconColor="text-violet-400"
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
