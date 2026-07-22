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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Non défini";
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() < 2020) return "Non défini";
  return new Intl.DateTimeFormat("fr-FR", {
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

const STATUS_CONFIG: Record<StatusColor, { label: string; dotCls: string; badgeCls: string }> = {
  green:  { label: "Actif",            dotCls: "bg-emerald-500", badgeCls: "bg-emerald-50  text-emerald-700  border-emerald-200" },
  yellow: { label: "Expire bientôt",   dotCls: "bg-yellow-500",  badgeCls: "bg-yellow-50   text-yellow-700   border-yellow-200"  },
  red:    { label: "Expiré",           dotCls: "bg-red-500",     badgeCls: "bg-red-50      text-red-700      border-red-200"     },
  gray:   { label: "Données manq.",    dotCls: "bg-gray-400",    badgeCls: "bg-gray-100    text-gray-600     border-gray-200"    },
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

function DaysChip({ user }: { user: SubUser }) {
  if (user.isMissingData) return <span className="text-sm text-gray-400">—</span>;
  if (user.isExpired && user.daysSinceExpiry !== null) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
        il y a {user.daysSinceExpiry} jour(s)
      </span>
    );
  }
  if (user.daysLeft !== null) {
    if (user.daysLeft <= 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-bold text-yellow-700">
          Aujourd'hui
        </span>
      );
    }
    if (user.isExpiringSoon) {
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-bold text-yellow-700">
          {user.daysLeft} jour(s)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        {user.daysLeft} jour(s)
      </span>
    );
  }
  return <span className="text-sm text-gray-400">—</span>;
}

function DateCell({ iso, derived, expired }: { iso: string | null; derived?: boolean; expired?: boolean }) {
  const label = formatDate(iso);
  if (label === "Non défini") {
    return <span className="text-sm text-gray-400">Non défini</span>;
  }
  return (
    <div>
      <span className={`text-sm font-medium ${expired ? "text-red-600" : "text-gray-800"}`}>{label}</span>
      {derived && <p className="text-[10px] text-gray-400 mt-0.5">(estimé)</p>}
    </div>
  );
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
  const color = getStatus(user);
  return (
    <tr className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-gray-50/70 ${user.driveRevokedAt ? "opacity-50" : ""}`}>
      <td className="px-4 py-3.5 align-middle">
        <p className="font-semibold text-sm text-gray-900 leading-tight">{user.username}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{user.email}</p>
      </td>

      <td className="px-4 py-3.5 align-middle">
        {user.phone ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-600" dir="ltr">{user.phone}</span>
            <a
              href={`https://wa.me/${normalizeWhatsApp(user.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 text-green-700 transition-colors shrink-0"
            >
              <MessageCircle className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      <td className="px-4 py-3.5 align-middle">
        <DateCell iso={user.subscriptionStartedAt} derived={user.startDerived} />
      </td>

      <td className="px-4 py-3.5 align-middle">
        <DateCell iso={user.subscriptionExpiresAt} derived={user.endDerived} expired={user.isExpired} />
      </td>

      <td className="px-4 py-3.5 align-middle">
        <DaysChip user={user} />
      </td>

      <td className="px-4 py-3.5 align-middle">
        <StatusBadge color={color} />
      </td>

      <td className="px-4 py-3.5 align-middle">
        {user.driveRevokedAt ? (
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" /> Révoqué
            </span>
            <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(user.driveRevokedAt)}</p>
          </div>
        ) : (
          <button
            onClick={() => onRevoke(user.id)}
            disabled={revoking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldX className="w-3 h-3" />}
            Révoquer Drive
          </button>
        )}
      </td>
    </tr>
  );
}

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
      v: "active", label: "Actifs", data: active,
      activeCls: "bg-emerald-600 text-white border-emerald-600",
      countCls: "bg-emerald-100 text-emerald-700",
    },
    {
      v: "soon", label: "Expire bientôt", data: soon,
      activeCls: "bg-yellow-500 text-white border-yellow-500",
      countCls: "bg-yellow-100 text-yellow-700",
    },
    {
      v: "expired", label: "Expirés", data: expired,
      activeCls: "bg-red-600 text-white border-red-600",
      countCls: "bg-red-100 text-red-700",
    },
    {
      v: "missing", label: "Données manquantes", data: missing,
      activeCls: "bg-gray-600 text-white border-gray-600",
      countCls: "bg-gray-100 text-gray-600",
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className={`${headerBg} px-5 py-4 border-b border-gray-200`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className={`w-4.5 h-4.5 ${accentCls}`} />
            <h2 className="font-bold text-base text-gray-900">{title}</h2>
            <span className="text-xs text-gray-500 font-normal">({users.length} abonné(s))</span>
          </div>

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

      {filter === "missing" && missing.length > 0 && (
        <div className="flex items-start gap-2.5 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">
            Ces abonnés n'ont pas de date de début ni de fin dans la base de données.
            Veuillez mettre à jour leurs données depuis la page utilisateurs.
          </p>
        </div>
      )}

      {filter === "expired" && pendingExpired > 0 && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-red-50 border-b border-red-100">
          <p className="text-sm font-semibold text-red-700">
            {pendingExpired} utilisateur(s) dont les accès Google Drive n'ont pas encore été révoqués
          </p>
          <button
            onClick={onRevokeAll}
            disabled={revokeAllPending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {revokeAllPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Révoquer tous ({pendingExpired})
          </button>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <CheckCircle2 className="w-10 h-10 text-gray-200" />
          <p className="text-sm text-gray-500">
            {filter === "active"  && "Aucun abonné actif dans cette section"}
            {filter === "soon"    && "Aucun abonné n'expire bientôt"}
            {filter === "expired" && "Aucun abonné expiré — Excellent !"}
            {filter === "missing" && "Tous les abonnés ont des données complètes ✓"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Utilisateur</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Téléphone</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Début</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Fin</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {filter === "expired" ? "Depuis expiration" : "Jours restants"}
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Drive</th>
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
      if (!res.ok) throw new Error("Échec du chargement des données");
      return res.json();
    },
  });

  const revokeOneMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/revoke-drive`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("Échec");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: "✓ Accès Google Drive révoqué" });
    },
    onError: () => toast({ title: "Une erreur est survenue", variant: "destructive" }),
    onSettled: () => setRevokingId(null),
  });

  const revokeAllMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/revoke-drive-all`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("Échec");
      return res.json() as Promise<{ revoked: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: `✓ ${data.revoked} utilisateur(s) révoqué(s) de Google Drive` });
    },
    onError: () => toast({ title: "Une erreur est survenue", variant: "destructive" }),
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
    <div className="space-y-6 pb-10">

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertes d'abonnements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi des abonnements mensuels et annuels — jours calculés automatiquement
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 shadow-sm transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-primary" : ""}`} />
          Actualiser les données
        </button>
      </div>

      {!isLoading && allUsers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard count={allUsers.length} label="Total abonnés"
            icon={CalendarDays}
            bg="bg-white border-gray-200"
            iconCls="bg-gray-100 text-gray-600"
            textCls="text-gray-900" />
          <StatCard count={totalActive} label="Actif"
            icon={CheckCircle2}
            bg="bg-emerald-50 border-emerald-200"
            iconCls="bg-emerald-100 text-emerald-700"
            textCls="text-emerald-800" />
          <StatCard count={totalSoon} label="Expire bientôt"
            icon={Clock}
            bg="bg-yellow-50 border-yellow-200"
            iconCls="bg-yellow-100 text-yellow-700"
            textCls="text-yellow-800" />
          <StatCard count={totalExpired} label="Expiré"
            icon={AlertTriangle}
            bg="bg-red-50 border-red-200"
            iconCls="bg-red-100 text-red-700"
            textCls="text-red-800" />
          <StatCard count={totalMissing} label="Données manquantes"
            icon={AlertCircle}
            bg="bg-gray-50 border-gray-200"
            iconCls="bg-gray-100 text-gray-500"
            textCls="text-gray-700" />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Chargement des données...</span>
        </div>
      ) : (
        <div className="space-y-5">
          <SubSection
            title="Abonnements mensuels"
            accentCls="text-blue-600"
            headerBg="bg-blue-50/60"
            users={monthly}
            onRevoke={handleRevoke}
            onRevokeAll={() => revokeAllMut.mutate()}
            revokingId={revokingId}
            revokeAllPending={revokeAllMut.isPending}
          />

          <SubSection
            title="Abonnements annuels"
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
