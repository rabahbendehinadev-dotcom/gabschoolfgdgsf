import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, MessageCircle, ShieldX, ShieldCheck,
  CalendarDays, CheckCircle2, AlertTriangle, Clock, Trash2,
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
  driveRevokedAt: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isNoExpiry: boolean;
  daysLeft: number | null;
  daysSinceExpiry: number | null;
}

type SectionFilter = "active" | "soon" | "expired";

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

function DaysChip({ user }: { user: SubUser }) {
  if (user.isExpired && user.daysSinceExpiry !== null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
        منذ {user.daysSinceExpiry} يوم
      </span>
    );
  }
  if (user.isExpiringSoon && user.daysLeft !== null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">
        {user.daysLeft <= 0 ? "اليوم" : `${user.daysLeft} يوم`}
      </span>
    );
  }
  if (user.daysLeft !== null && user.daysLeft > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/12 px-2 py-0.5 text-[11px] font-semibold text-green-400">
        {user.daysLeft} يوم
      </span>
    );
  }
  return <span className="text-[11px] text-muted-foreground">—</span>;
}

function UserRow({
  user,
  onRevoke,
  revoking,
}: {
  user: SubUser;
  onRevoke: (id: number) => void;
  revoking: boolean;
}) {
  return (
    <tr className={`border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors ${user.driveRevokedAt ? "opacity-40" : ""}`}>
      <td className="px-4 py-3 align-middle">
        <div className="font-medium text-sm leading-tight">{user.username}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{user.email}</div>
      </td>
      <td className="px-4 py-3 align-middle">
        {user.phone ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground" dir="ltr">{user.phone}</span>
            <a
              href={`https://wa.me/${normalizeWhatsApp(user.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/15 hover:bg-green-500/30 text-green-400 transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">غير محدد</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
        {formatArabicDate(user.subscriptionStartedAt)}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className={`text-xs font-medium ${
          user.isExpired ? "text-red-400" :
          user.isExpiringSoon ? "text-yellow-400" :
          "text-foreground"
        }`}>
          {formatArabicDate(user.subscriptionExpiresAt)}
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <DaysChip user={user} />
      </td>
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
            className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] font-medium px-2.5 py-1.5 transition-colors disabled:opacity-50"
          >
            {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldX className="w-3 h-3" />}
            إزالة Drive
          </button>
        )}
      </td>
    </tr>
  );
}

function SectionTable({
  title,
  icon,
  users,
  onRevoke,
  onRevokeAll,
  revokingId,
  revokeAllPending,
  accentClass,
}: {
  title: string;
  icon: React.ReactNode;
  users: SubUser[];
  onRevoke: (id: number) => void;
  onRevokeAll: () => void;
  revokingId: number | null;
  revokeAllPending: boolean;
  accentClass: string;
}) {
  const [filter, setFilter] = useState<SectionFilter>("active");

  const active   = users.filter(u => !u.isExpired && !u.isExpiringSoon);
  const soon     = users.filter(u => u.isExpiringSoon);
  const expired  = users.filter(u => u.isExpired);

  const displayed = filter === "active" ? active : filter === "soon" ? soon : expired;

  const pendingExpiredRevoke = expired.filter(u => !u.driveRevokedAt).length;

  const TABS: { v: SectionFilter; label: string; data: SubUser[]; color: string }[] = [
    { v: "active",  label: "نشطة",             data: active,  color: "text-green-400  bg-green-500/10  border-green-500/20" },
    { v: "soon",    label: "قريبة الانتهاء",   data: soon,    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
    { v: "expired", label: "منتهية",            data: expired, color: "text-red-400    bg-red-500/10    border-red-500/20" },
  ];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      {/* Section header */}
      <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b border-white/6 ${accentClass}`}>
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className="font-bold text-base">{title}</h2>
          <span className="text-xs text-muted-foreground">({users.length} مشترك)</span>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-1.5">
          {TABS.map(tab => (
            <button
              key={tab.v}
              onClick={() => setFilter(tab.v)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                filter === tab.v
                  ? tab.color
                  : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tab.label}
              {tab.data.length > 0 && (
                <span className={`rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold ${
                  filter === tab.v ? "bg-white/20" : "bg-white/8"
                }`}>
                  {tab.data.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <CheckCircle2 className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {filter === "active" && "لا يوجد مشتركون نشطون حالياً"}
            {filter === "soon"   && "لا يوجد مشتركون قريبون من الانتهاء"}
            {filter === "expired" && "لا يوجد مشتركون منتهون حالياً"}
          </p>
        </div>
      ) : (
        <>
          {filter === "expired" && pendingExpiredRevoke > 0 && (
            <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-red-500/5 border-b border-red-500/15">
              <span className="text-xs text-red-400 font-medium">
                {pendingExpiredRevoke} مستخدم لم تتم إزالتهم من Drive
              </span>
              <button
                onClick={onRevokeAll}
                disabled={revokeAllPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {revokeAllPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                إزالة الجميع ({pendingExpiredRevoke})
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-[11px] text-muted-foreground">
                  <th className="px-4 py-2.5 text-right font-medium">المستخدم</th>
                  <th className="px-4 py-2.5 text-right font-medium">الهاتف</th>
                  <th className="px-4 py-2.5 text-right font-medium">بداية الاشتراك</th>
                  <th className="px-4 py-2.5 text-right font-medium">انتهاء الاشتراك</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {filter === "expired" ? "منذ الانتهاء" : "الأيام المتبقية"}
                  </th>
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
        </>
      )}
    </div>
  );
}

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
      if (!res.ok) throw new Error("فشل الإزالة");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: "✓ تم تسجيل الإزالة من Google Drive" });
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

  const totalExpired      = allUsers.filter(u => u.isExpired).length;
  const totalExpiringSoon = allUsers.filter(u => u.isExpiringSoon).length;
  const totalActive       = allUsers.filter(u => !u.isExpired && !u.isExpiringSoon).length;

  return (
    <div className="space-y-6 pb-10">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">تنبيهات الاشتراكات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            متابعة الاشتراكات الشهرية والسنوية وإدارة صلاحيات Google Drive
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
          <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/8 px-4 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-semibold text-green-400">{totalActive}</span>
            <span className="text-sm text-muted-foreground">نشط</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">{totalExpiringSoon}</span>
            <span className="text-sm text-muted-foreground">قريب الانتهاء</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">{totalExpired}</span>
            <span className="text-sm text-muted-foreground">منتهي</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{allUsers.length}</span>
            <span className="text-sm text-muted-foreground">إجمالي</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>جاري التحميل...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Monthly section */}
          <SectionTable
            title="الاشتراكات الشهرية"
            icon={<CalendarDays className="w-4 h-4 text-blue-400" />}
            users={monthly}
            onRevoke={handleRevoke}
            onRevokeAll={() => revokeAllMut.mutate()}
            revokingId={revokingId}
            revokeAllPending={revokeAllMut.isPending}
            accentClass="bg-blue-500/[0.04]"
          />

          {/* Annual section */}
          <SectionTable
            title="الاشتراكات السنوية"
            icon={<CalendarDays className="w-4 h-4 text-purple-400" />}
            users={annual}
            onRevoke={handleRevoke}
            onRevokeAll={() => revokeAllMut.mutate()}
            revokingId={revokingId}
            revokeAllPending={revokeAllMut.isPending}
            accentClass="bg-purple-500/[0.04]"
          />
        </div>
      )}
    </div>
  );
}
