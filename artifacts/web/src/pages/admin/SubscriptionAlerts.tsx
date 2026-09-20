import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, MessageCircle,
  CalendarDays, CheckCircle2, AlertTriangle, Clock, AlertCircle,
  Search, ShieldAlert, Wrench, Check
} from "lucide-react";

const API_BASE = "";

type SubscriptionStatus = "active" | "expired" | "unknown" | string;

interface InconsistencyRow {
  user: {
    id: number;
    username: string;
    name: string | null;
    email: string;
    phone: string | null;
  };
  plan: {
    type: string;
    id: number | null;
  };
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
  daysRemaining: number | null;
  subscriptionStatus: SubscriptionStatus;
  effectiveCourseAccess: boolean;
  assignedCourses: { id: number; name: string }[];
  inconsistencyCodes: string[];
  deterministicFixAvailable: boolean;
  isExpiringSoon: boolean;
}

interface ExpiredResponse {
  summary: {
    total: number;
    active: number;
    expiringSoon: number;
    expired: number;
    missingData: number;
    inconsistencies: number;
  };
  rows: InconsistencyRow[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Non défini";
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() < 2020) return "Non défini";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function normalizeWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "213" + digits.slice(1);
  if (!digits.startsWith("213") && digits.length <= 10) return "213" + digits;
  return digits;
}

const INCONSISTENCY_LABELS: Record<string, string> = {
  "MISSING_PLAN_SCOPE": "Accès au plan non défini",
  "AMBIGUOUS_LEGACY_COURSE_SCOPE": "Relation de cours legacy ambiguë",
  "DUPLICATE_USER_PLAYLIST": "Accès en double détecté",
  "ACTIVE_ENROLLMENT_OUTSIDE_SCOPE": "Accès à des cours non inclus",
  "MISSING_PLAN_ACCESS": "Accès manquant aux cours",
  "MISSING_START_DATE": "Date de début manquante",
  "MISSING_END_DATE": "Date de fin manquante",
  "MISSING_LIFETIME_END": "Date de fin (à vie) manquante",
  "MISSING_DEMO_END": "Date de fin (démo) manquante"
};

function translateInconsistency(code: string): string {
  return INCONSISTENCY_LABELS[code] || code;
}

function StatCard({
  count, label, icon: Icon, bg, iconCls, textCls,
}: {
  count: number; label: string; icon: React.ElementType;
  bg: string; iconCls: string; textCls: string;
}) {
  return (
    <div className={`ad-stat ${bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`ad-stat-value ${textCls}`}>{count}</p>
          <p className="ad-stat-label">{label}</p>
        </div>
        <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${iconCls} shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export function AdminSubscriptionAlerts() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const authHeaders = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const { data, isLoading, refetch, isRefetching } = useQuery<ExpiredResponse>({
    queryKey: ["admin-expired-users"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/users/expired`, {
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("Échec du chargement des données");
      return res.json();
    },
  });

  const [mutatingId, setMutatingId] = useState<number | null>(null);

  const reconcileMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/reconcile-course-access`, {
        method: "POST",
        headers: authHeaders ?? {},
      });
      if (!res.ok) throw new Error("Échec de la correction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-expired-users"] });
      toast({ title: "Accès corrigé avec succès", variant: "default" });
    },
    onError: () => toast({ title: "Une erreur est survenue lors de la correction", variant: "destructive" }),
    onSettled: () => setMutatingId(null),
  });

  const handleReconcile = (id: number) => {
    setMutatingId(id);
    reconcileMut.mutate(id);
  };

  const rows = data?.rows || [];

  const uniqueCourses = useMemo(() => {
    const courseMap = new Map<number, string>();
    rows.forEach(r => {
      r.assignedCourses.forEach(c => courseMap.set(c.id, c.name));
    });
    return Array.from(courseMap.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const uniqueTypes = useMemo(() => {
    const typeSet = new Set<string>();
    rows.forEach(r => {
      if (r.plan.type) typeSet.add(r.plan.type);
    });
    return Array.from(typeSet);
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;

    if (filterStatus === "active") result = result.filter(r => r.subscriptionStatus === "active" && !r.isExpiringSoon);
    if (filterStatus === "soon") result = result.filter(r => r.isExpiringSoon);
    if (filterStatus === "expired") result = result.filter(r => r.subscriptionStatus === "expired");
    if (filterStatus === "missing") result = result.filter(r => r.inconsistencyCodes.some(c => c.startsWith("MISSING_")));
    if (filterStatus === "inconsistencies") result = result.filter(r => r.inconsistencyCodes.length > 0);

    if (filterCourse !== "all") {
      const cid = parseInt(filterCourse, 10);
      result = result.filter(r => r.assignedCourses.some(c => c.id === cid));
    }

    if (filterType !== "all") {
      result = result.filter(r => r.plan.type === filterType);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.user.username.toLowerCase().includes(q) ||
        (r.user.name && r.user.name.toLowerCase().includes(q)) ||
        r.user.email.toLowerCase().includes(q) ||
        (r.user.phone && r.user.phone.includes(q))
      );
    }

    return result;
  }, [rows, filterStatus, filterCourse, filterType, search]);

  const summary = data?.summary;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contrôle des Accès</h1>
          <p className="text-sm text-slate-500 mt-1">
            Vue opérationnelle des abonnements et des droits d'accès aux cours
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="ad-btn-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-primary" : ""}`} />
          Actualiser
        </button>
      </div>

      {!isLoading && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          <StatCard count={summary.total} label="Total abonnements"
            icon={CalendarDays}
            bg="bg-white"
            iconCls="bg-slate-100 text-slate-600"
            textCls="text-slate-900" />
          <StatCard count={summary.active} label="Actifs"
            icon={CheckCircle2}
            bg="bg-white"
            iconCls="bg-emerald-100 text-emerald-700"
            textCls="text-emerald-800" />
          <StatCard count={summary.expiringSoon} label="Expire bientôt"
            icon={Clock}
            bg="bg-white"
            iconCls="bg-amber-100 text-amber-700"
            textCls="text-amber-800" />
          <StatCard count={summary.expired} label="Expirés"
            icon={AlertTriangle}
            bg="bg-white"
            iconCls="bg-rose-100 text-rose-700"
            textCls="text-rose-800" />
          <StatCard count={summary.missingData} label="Données à corriger"
            icon={AlertCircle}
            bg="bg-white"
            iconCls="bg-slate-100 text-slate-700"
            textCls="text-slate-800" />
          <StatCard count={summary.inconsistencies} label="Incohérences"
            icon={ShieldAlert}
            bg="bg-white"
            iconCls="bg-indigo-100 text-indigo-700"
            textCls="text-indigo-800" />
        </div>
      )}

      <div className="ad-card flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-white space-y-4 rounded-t-xl">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "Tous" },
              { id: "active", label: "Actifs" },
              { id: "soon", label: "Expire bientôt" },
              { id: "expired", label: "Expirés" },
              { id: "missing", label: "Données manquantes" },
              { id: "inconsistencies", label: "Incohérences" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`ad-chip ${filterStatus === tab.id ? "ad-chip-on" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher nom, email, tél..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ad-input pl-9"
              />
            </div>
            <select
              className="ad-select max-w-[200px] w-full"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">Tous les types</option>
              {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="ad-select max-w-[200px] w-full"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
            >
              <option value="all">Tous les cours</option>
              {uniqueCourses.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3 text-slate-400" />
            <p className="text-sm font-medium">Chargement des données...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <CheckCircle2 className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Aucun résultat trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-b-xl">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="ad-th">Utilisateur</th>
                  <th className="ad-th">Plan & Cours</th>
                  <th className="ad-th">Période</th>
                  <th className="ad-th">Statut</th>
                  <th className="ad-th">Incohérences</th>
                  <th className="ad-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.user.id} className="ad-tr border-b border-slate-100">
                    <td className="ad-td align-top">
                      <div className="font-semibold text-slate-900">{row.user.username}</div>
                      {row.user.name && <div className="text-xs text-slate-500">{row.user.name}</div>}
                      <div className="text-xs text-slate-500 truncate max-w-[200px]" title={row.user.email}>{row.user.email}</div>
                      {row.user.phone && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs font-mono text-slate-600" dir="ltr">{row.user.phone}</span>
                          <a
                            href={`https://wa.me/${normalizeWhatsApp(row.user.phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp"
                            className="text-emerald-600 hover:text-emerald-700 transition-colors shrink-0"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </td>

                    <td className="ad-td align-top">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wider mb-1.5 border border-slate-200 shadow-sm">
                        {row.plan.type}
                      </span>
                      {row.assignedCourses.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {row.assignedCourses.map(c => (
                            <span key={c.id} className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 truncate max-w-[200px]" title={c.name}>
                              {c.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">Aucun cours assigné</div>
                      )}
                    </td>

                    <td className="ad-td align-top">
                      <div className="text-[12px] space-y-1">
                        <div className="flex justify-between w-32 gap-3">
                          <span className="text-slate-500 shrink-0">Début:</span>
                          <span className="font-medium text-slate-800 text-right">{formatDate(row.subscriptionStartedAt)}</span>
                        </div>
                        <div className="flex justify-between w-32 gap-3">
                          <span className="text-slate-500 shrink-0">Fin:</span>
                          <span className={`font-medium text-right ${row.subscriptionStatus === "expired" ? "text-rose-600" : "text-slate-800"}`}>
                            {formatDate(row.subscriptionExpiresAt)}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="ad-td align-top">
                      <div className="space-y-2">
                        <div>
                          {row.subscriptionStatus === "active" ? (
                            <span className={`ad-badge ${row.isExpiringSoon ? "ad-badge-expiring" : "ad-badge-active"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.isExpiringSoon ? "bg-amber-500" : "bg-emerald-500"}`} />
                              {row.isExpiringSoon ? "Expire bientôt" : "Actif"}
                            </span>
                          ) : row.subscriptionStatus === "expired" ? (
                            <span className="ad-badge ad-badge-expired">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-rose-500" />
                              Expiré
                            </span>
                          ) : (
                            <span className="ad-badge ad-badge-normal">Inconnu</span>
                          )}
                        </div>

                        {row.daysRemaining !== null && (
                          <div className="text-[11px] font-medium text-slate-500">
                            {row.daysRemaining < 0
                              ? `Expiré il y a ${Math.abs(row.daysRemaining)} j`
                              : row.daysRemaining === 0
                                ? "Expire aujourd'hui"
                                : `${row.daysRemaining} jour(s) restants`}
                          </div>
                        )}

                        <div className="flex items-center gap-1 mt-1">
                          {row.effectiveCourseAccess ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded">
                              <Check className="w-3 h-3" /> Accès ouvert
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded">
                              <AlertCircle className="w-3 h-3" /> Accès fermé
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="ad-td align-top">
                      {row.inconsistencyCodes.length > 0 ? (
                        <div className="flex flex-col gap-1.5 max-w-[220px]">
                          {row.inconsistencyCodes.map(code => (
                            <span key={code} className="inline-flex items-start gap-1.5 text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200 leading-tight">
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                              {translateInconsistency(code)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Cohérent
                        </span>
                      )}
                    </td>

                    <td className="ad-td align-top">
                      {row.deterministicFixAvailable && row.inconsistencyCodes.length > 0 ? (
                        <button
                          onClick={() => handleReconcile(row.user.id)}
                          disabled={reconcileMut.isPending && mutatingId === row.user.id}
                          className="ad-btn-primary h-8 text-[11px] px-3 w-full justify-center shadow-sm"
                        >
                          {reconcileMut.isPending && mutatingId === row.user.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wrench className="w-3.5 h-3.5" />
                          )}
                          Corriger l'accès
                        </button>
                      ) : (
                        row.inconsistencyCodes.length > 0 ? (
                          <span className="text-[11px] text-slate-400 italic text-center block bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
                            Correction manuelle requise
                          </span>
                        ) : null
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}