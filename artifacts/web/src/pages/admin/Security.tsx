import { useEffect, useState } from "react";
import {
  useSecurityUsers, useSecurityUserDetails, useResetDeviceCategory,
  useApproveDevice, useBlockUserSecurity, useUnblockUserSecurity,
  useAddWhitelist, useRemoveWhitelist, useIgnoreDeviceAlert,
  SecurityDevice, SecurityUserFilter
} from "@/hooks/use-security-admin";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Search, RefreshCcw, ShieldCheck, ShieldOff,
  Smartphone, Monitor, AlertTriangle, CheckCircle2,
  Trash2, Plus, Clock, ListFilter, Activity, History, EyeOff
} from "lucide-react";
import { formatDate } from "@/lib/utils";

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "maintenant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const dy = Math.floor(h / 24);
  return `${dy} j`;
}

export function AdminSecurity() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<SecurityUserFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, refetch, isFetching, isError, error } = useSecurityUsers({ page, pageSize, search: debouncedSearch, filter });
  const { toast } = useToast();

  const [detailId, setDetailId] = useState<number | null>(null);
  const users = data?.users;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!data) return;
    const lastPage = Math.max(data.pages, 1);
    if (page > lastPage) setPage(lastPage);
  }, [data, page]);

  return (
    <div dir="ltr" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", lineHeight: 1.2, letterSpacing: "-0.02em" }}>Sécurité des appareils</h1>
           <p style={{ fontSize: 14, color: "#667085", marginTop: 4 }}>
             Contrôle d'accès strict, sessions et appareils de confiance · Total utilisateurs : {data?.total ?? "—"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="ad-btn-sm" data-testid="btn-refresh-security">
            <RefreshCcw size={13} className={isFetching ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#98A2B3", pointerEvents: "none" }} />
           <input type="text" placeholder="Rechercher nom, e-mail, téléphone ou ID..." value={search}
             onChange={e => setSearch(e.target.value)} className="ad-input" style={{ paddingLeft: 32 }} data-testid="input-security-search" />
        </div>
        <div style={{ display: "flex", gap: 4, background: "#fff", padding: 3, borderRadius: 8, border: "1px solid #E2E8F0" }}>
          {[
            { id: "all", label: "Tous" },
            { id: "blocked_user", label: "Comptes bloqués" },
            { id: "blocked_device", label: "Appareils bloqués" },
            { id: "clean", label: "Sains" },
             { id: "phone", label: "Téléphone enregistré" },
             { id: "computer", label: "Ordinateur enregistré" },
             { id: "two_devices", label: "2 appareils enregistrés" },
             { id: "no_devices", label: "Aucun appareil" },
          ].map(f => (
            <button
              key={f.id} type="button"
               onClick={() => { setFilter(f.id as SecurityUserFilter); setPage(1); }}
              data-testid={`btn-filter-${f.id}`}
              style={{
                padding: "6px 12px", fontSize: 12.5, fontWeight: 500, borderRadius: 6, cursor: "pointer",
                background: filter === f.id ? "#F1F5F9" : "transparent",
                color: filter === f.id ? "#0F172A" : "#64748B", border: "none"
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden md:block ad-table-wrap">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr>
                <th className="ad-th">Utilisateur</th>
                <th className="ad-th">Statut compte</th>
                <th className="ad-th">Téléphones</th>
                <th className="ad-th">Ordinateurs</th>
                <th className="ad-th">Alertes</th>
                <th className="ad-th" style={{ position: "sticky", right: 0, zIndex: 2, borderLeft: "1px solid #E5EAF2" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
               {(users ?? []).map(user => {
                const isBlocked = user.securityBlockedAt !== null || !user.isActive;
                const activePhones = user.devices.filter(d => d.category === "PHONE" && d.status === "TRUSTED").length;
                const activePCs = user.devices.filter(d => d.category === "COMPUTER" && d.status === "TRUSTED").length;
                const blockedDevices = user.devices.filter(d => d.status === "BLOCKED").length;

                return (
                  <tr key={user.id} className="ad-tr" style={{ opacity: isBlocked ? 0.7 : 1 }}>
                    <td className="ad-td">
                      <div style={{ fontWeight: 600, color: "#0F172A" }}>{user.username}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>{user.email}</div>
                    </td>
                    <td className="ad-td">
                      {isBlocked ? (
                        <span className="ad-badge ad-badge-blocked"><ShieldOff size={10}/> Bloqué</span>
                      ) : (
                        <span className="ad-badge ad-badge-active"><ShieldCheck size={10}/> Actif</span>
                      )}
                    </td>
                    <td className="ad-td">
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Smartphone size={14} color="#64748B" />
                        <span style={{ fontWeight: 500 }}>{activePhones}</span>
                      </div>
                    </td>
                    <td className="ad-td">
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Monitor size={14} color="#64748B" />
                        <span style={{ fontWeight: 500 }}>{activePCs}</span>
                      </div>
                    </td>
                    <td className="ad-td">
                      {blockedDevices > 0 ? (
                        <span style={{ color: "#92400E", display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, fontWeight: 600, background: "#FFFBEB", padding: "2px 6px", borderRadius: 4 }}>
                          <AlertTriangle size={12} /> {blockedDevices} tentative(s)
                        </span>
                      ) : (
                        <span style={{ color: "#94A3B8" }}>—</span>
                      )}
                    </td>
                    <td className="ad-td" style={{ position: "sticky", right: 0, background: "inherit", borderLeft: "1px solid #E5EAF2" }}>
                      <button onClick={() => setDetailId(user.id)} className="ad-btn-sm" data-testid={`btn-inspect-${user.id}`}>Inspecter</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isError ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#9F1239", fontSize: 13 }}>
              Erreur: {error instanceof Error ? error.message : "Échec du chargement."}
            </div>
          ) : !users && isFetching ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
              Chargement...
            </div>
           ) : (users?.length ?? 0) === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
              Aucun utilisateur trouvé.
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 md:hidden">
        {isError ? (
          <div className="ad-card" style={{ padding: 20, textAlign: "center", color: "#9F1239", fontSize: 13 }}>
            Erreur: {error instanceof Error ? error.message : "Échec du chargement."}
          </div>
        ) : !users && isFetching ? (
          <div className="ad-card" style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Chargement...</div>
        ) : (users?.length ?? 0) === 0 ? (
          <div className="ad-card" style={{ padding: 20, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Aucun utilisateur trouvé.</div>
        ) : users?.map(user => {
          const isBlocked = user.securityBlockedAt !== null || !user.isActive;
          const phones = user.devices.filter(device => device.category === "PHONE" && device.status === "TRUSTED").length;
          const computers = user.devices.filter(device => device.category === "COMPUTER" && device.status === "TRUSTED").length;
          const blocked = user.devices.filter(device => device.status === "BLOCKED").length;
          return (
            <div key={user.id} className="ad-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#0F172A" }}>{user.fullName || user.username}</div>
                  <div style={{ fontSize: 12, color: "#64748B", overflowWrap: "anywhere" }}>{user.email}</div>
                </div>
                {isBlocked ? (
                  <span className="ad-badge ad-badge-blocked"><ShieldOff size={10}/> Bloqué</span>
                ) : (
                  <span className="ad-badge ad-badge-active"><ShieldCheck size={10}/> Actif</span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, fontSize: 12, color: "#475569" }}>
                <span><Smartphone size={13} style={{ display: "inline", marginRight: 4 }} />Téléphones : {phones}</span>
                <span><Monitor size={13} style={{ display: "inline", marginRight: 4 }} />Ordinateurs : {computers}</span>
                <span><AlertTriangle size={13} style={{ display: "inline", marginRight: 4 }} />Bloqués : {blocked}</span>
              </div>
              <button onClick={() => setDetailId(user.id)} className="ad-btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} data-testid={`btn-inspect-mobile-${user.id}`}>
                Inspecter
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748B" }}>
          Afficher
          <select
            className="ad-input"
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            data-testid="select-security-page-size"
            style={{ width: 80 }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748B" }}>
          <button className="ad-btn-sm" disabled={page <= 1 || isFetching} onClick={() => setPage(p => p - 1)} data-testid="btn-security-previous">Précédent</button>
          <span>Page {data?.page ?? page} sur {Math.max(data?.pages ?? 0, 1)}</span>
          <button className="ad-btn-sm" disabled={page >= (data?.pages ?? 0) || isFetching} onClick={() => setPage(p => p + 1)} data-testid="btn-security-next">Suivant</button>
        </div>
      </div>

      {detailId && <UserSecurityDialog userId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function SlotCard({
  category,
  device,
  onReset,
  onReplace,
  replaceAvailable,
}: {
  category: "PHONE" | "COMPUTER";
  device?: SecurityDevice;
  onReset: () => void;
  onReplace: () => void;
  replaceAvailable: boolean;
}) {
  const isPhone = category === "PHONE";
  const title = isPhone ? "TÉLÉPHONE" : "ORDINATEUR";
  const Icon = isPhone ? Smartphone : Monitor;

  return (
    <div className="ad-card overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-slate-500" />
          <h4 className="text-[12.5px] font-bold text-slate-700 tracking-wide">{title}</h4>
        </div>
        {device ? (
          <span className="ad-badge ad-badge-active bg-green-100 border-green-200 text-green-700 text-[10px] py-0.5"><CheckCircle2 size={10} /> ACTIF</span>
        ) : (
          <span className="ad-badge ad-badge-normal bg-slate-100 text-[10px] py-0.5">VIDE</span>
        )}
      </div>
      <div className="p-4 h-[180px] flex flex-col">
        {device ? (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="text-[14px] font-bold text-slate-900 mb-1">
                {device.os || "OS inconnu"} · {device.browser || "Navigateur inconnu"}
              </div>
              <div className="grid grid-cols-1 gap-y-2 text-[12px] text-slate-600 mt-3">
                <div className="flex justify-between"><span className="text-slate-400">Enregistré:</span> <span className="font-medium text-slate-800">{formatDate(device.firstSeenAt)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Dernière vue:</span> <span className="font-medium text-slate-800">{timeAgo(device.lastSeenAt)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Dernière IP:</span> <span className="font-mono text-slate-800">{device.lastIp || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Lieu approx.:</span> <span className="font-medium text-slate-800 truncate max-w-[120px] text-right" title={[device.city, device.region, device.country].filter(Boolean).join(", ") || "—"}>{[device.city, device.region, device.country].filter(Boolean).join(", ") || "—"}</span></div>
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
              <button
                className="ad-btn-sm flex-1 justify-center text-green-700 border-green-200 hover:bg-green-50 disabled:opacity-50"
                onClick={onReplace}
                disabled={!replaceAvailable}
                title={replaceAvailable ? "Voir les appareils candidats au remplacement" : "Aucune tentative bloquée pour cette catégorie"}
              >
                <CheckCircle2 size={14} /> Remplacer
              </button>
              <button className="ad-btn-sm flex-1 justify-center" onClick={onReset}>
                <RefreshCcw size={14} /> Réinitialiser
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
             <ShieldOff size={28} className="mb-3 opacity-40 text-slate-500" />
             <p className="text-[13px] font-semibold text-slate-500">Aucun {isPhone ? "téléphone" : "ordinateur"} autorisé</p>
             <p className="text-[11px] text-slate-400 mt-1 text-center max-w-[200px]">Slot libre pour un prochain enregistrement.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UserSecurityDialog({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, isError, error } = useSecurityUserDetails(userId);
  const [tab, setTab] = useState<"devices" | "history" | "events" | "sessions" | "whitelists">("devices");
  const { toast } = useToast();
  
  const approveMut = useApproveDevice();
  const resetMut = useResetDeviceCategory();
  const blockMut = useBlockUserSecurity();
  const unblockMut = useUnblockUserSecurity();
  const addWhitelistMut = useAddWhitelist();
  const removeWhitelistMut = useRemoveWhitelist();
  const ignoreMut = useIgnoreDeviceAlert();

  const [wlIp, setWlIp] = useState("");
  const [wlReason, setWlReason] = useState("");

  if (isError) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md" dir="ltr" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ color: "#9F1239" }}>
            Erreur: {error instanceof Error ? error.message : "Échec du chargement."}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl" dir="ltr" style={{ padding: 40, textAlign: "center" }}>
          <div className="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-primary rounded-full" />
        </DialogContent>
      </Dialog>
    );
  }

  const { user, devices, events, sessions, whitelists, securitySummary: summary } = data;
  const isBlocked = user.securityBlockedAt !== null || !user.isActive;
  const trustedDevices = devices.filter(device => device.status === "TRUSTED");
  const pendingDevices = devices.filter(device => device.status === "BLOCKED");
  const revokedDevices = devices.filter(device => device.status === "REVOKED");
  const adminActions = events.filter(event => event.outcome === "ADMIN_ACTION");
  const ignoredDeviceIds = new Set(
    events.filter(event => event.eventType === "DEVICE_ALERT_IGNORED" && event.deviceId !== null).map(event => event.deviceId),
  );

  const handleAction = async (action: Promise<void>, successMsg: string) => {
    try {
      await action;
      toast({ title: successMsg });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  const confirmAction = (message: string, action: () => Promise<void>, successMsg: string) => {
    if (window.confirm(message)) void handleAction(action(), successMsg);
  };

  const focusReplacementAlerts = (category: "PHONE" | "COMPUTER") => {
    document.getElementById(`device-alert-${category}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 gap-0 bg-[#F8FAFC] overflow-hidden" dir="ltr">
        {/* HEADER */}
        <div style={{ padding: "20px 24px", background: "#fff", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {user.username}
              {isBlocked ? (
                <span className="ad-badge ad-badge-blocked"><ShieldOff size={11} /> Compte Bloqué</span>
              ) : (
                <span className="ad-badge ad-badge-active"><ShieldCheck size={11} /> Compte Actif</span>
              )}
            </h2>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{user.email}</div>
          </div>
          <div>
            {isBlocked ? (
              <button 
                className="ad-btn-sm" 
                data-testid={`btn-unblock-user-${userId}`}
                style={{ color: "#15803D", borderColor: "#BBF7D0", background: "#F0FDF4" }}
                onClick={() => handleAction(unblockMut.mutateAsync({ userId }), "Compte débloqué")}
                disabled={unblockMut.isPending}
              >
                <ShieldCheck size={14} /> Lever le blocage de sécurité
              </button>
            ) : (
              <button 
                className="ad-btn-sm" 
                data-testid={`btn-block-user-${userId}`}
                style={{ color: "#9F1239", borderColor: "#FECDD3", background: "#FFF1F2" }}
                onClick={() => {
                  const reason = prompt("Raison du blocage ?");
                  if (reason !== null) handleAction(blockMut.mutateAsync({ userId, reason }), "Compte bloqué");
                }}
                disabled={blockMut.isPending}
              >
                <ShieldAlert size={14} /> Bloquer par sécurité
              </button>
            )}
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E2E8F0", background: "#fff", padding: "0 20px", overflowX: "auto" }}>
          {[
            { id: "devices", label: "Appareils", icon: Smartphone },
            { id: "history", label: "Historique", icon: History },
            { id: "events", label: "Journal de sécurité", icon: Activity },
            { id: "sessions", label: "Sessions actives", icon: Clock },
            { id: "whitelists", label: "Exceptions IP", icon: ListFilter },
          ].map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                data-testid={`btn-tab-${t.id}`}
                onClick={() => setTab(t.id as "devices" | "history" | "events" | "sessions" | "whitelists")}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "12px 16px",
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? "#F97316" : "#64748B",
                  borderBottom: active ? "2px solid #F97316" : "2px solid transparent",
                  background: "none", cursor: "pointer", transition: "color 150ms"
                }}
              >
                <t.icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* CONTENT */}
        <div style={{ padding: 24, maxHeight: "60vh", overflowY: "auto" }}>
          {tab === "devices" && (
            <div className="flex flex-col gap-6">
              {/* Top Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="ad-card p-3 flex flex-col gap-1.5 bg-slate-50">
                  <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Slots utilisés</span>
                  <div className="flex gap-1.5">
                    <span className={`ad-badge bg-white border-slate-200 text-[11.5px] ${summary.trustedPhoneCount > 0 ? 'text-slate-800' : 'text-slate-400'}`}><Smartphone size={12}/> {summary.trustedPhoneCount}/1</span>
                    <span className={`ad-badge bg-white border-slate-200 text-[11.5px] ${summary.trustedComputerCount > 0 ? 'text-slate-800' : 'text-slate-400'}`}><Monitor size={12}/> {summary.trustedComputerCount}/1</span>
                  </div>
                </div>
                <div className="ad-card p-3 flex flex-col gap-1 bg-slate-50">
                  <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Tentatives Bloquées</span>
                  <span className="text-[15px] font-black text-slate-800">{summary.blockedAttemptCount} <span className="text-[11px] font-medium text-slate-500 ml-1">total</span></span>
                </div>
                <div className="ad-card p-3 flex flex-col gap-1 bg-slate-50">
                  <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Rejets (7 j)</span>
                  <span className="text-[15px] font-black text-slate-800">{summary.rejectedChanges7d} <span className="text-[11px] font-medium text-slate-500 ml-1">récents</span></span>
                </div>
                <div className="ad-card p-3 flex flex-col gap-1 bg-slate-50">
                  <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Dernière Alerte</span>
                  <span className="text-[13px] font-bold text-slate-800 mt-0.5">{timeAgo(summary.latestAlertAt)}</span>
                </div>
                <div className="ad-card p-3 flex flex-col gap-1.5 bg-slate-50">
                  <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Risque Partage</span>
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${summary.sharingRisk === 'HIGH' ? 'text-red-700 bg-red-100' : summary.sharingRisk === 'MEDIUM' ? 'text-orange-700 bg-orange-100' : 'text-emerald-700 bg-emerald-100'}`}>
                      {summary.sharingRisk === 'HIGH' ? 'ÉLEVÉ' : summary.sharingRisk === 'MEDIUM' ? 'MODÉRÉ' : 'FAIBLE'}
                    </span>
                  </div>
                </div>
              </div>

              {summary.frequentDeviceChanges && (
                <div className="px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-[13px] font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Attention : Changements fréquents d’appareils détectés. L'utilisateur semble partager ou changer de matériel de façon inhabituelle.
                </div>
              )}

              {/* Slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SlotCard
                  category="PHONE"
                  device={trustedDevices.find(d => d.category === "PHONE")}
                  onReset={() => confirmAction("Réinitialiser le téléphone autorisé ? Ses sessions actives seront invalidées et un nouveau téléphone pourra être enregistré.", () => resetMut.mutateAsync({ userId, category: "PHONE" }), "Téléphone réinitialisé")}
                  onReplace={() => focusReplacementAlerts("PHONE")}
                  replaceAvailable={pendingDevices.some(device => device.category === "PHONE")}
                />
                <SlotCard
                  category="COMPUTER"
                  device={trustedDevices.find(d => d.category === "COMPUTER")}
                  onReset={() => confirmAction("Réinitialiser l’ordinateur autorisé ? Ses sessions actives seront invalidées et un nouvel ordinateur pourra être enregistré.", () => resetMut.mutateAsync({ userId, category: "COMPUTER" }), "Ordinateur réinitialisé")}
                  onReplace={() => focusReplacementAlerts("COMPUTER")}
                  replaceAvailable={pendingDevices.some(device => device.category === "COMPUTER")}
                />
              </div>

              {/* Alertes appareils */}
              {pendingDevices.length > 0 && (
                <div className="mt-2">
                  <h3 className="text-[14px] font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-600" />
                    Alertes appareils ({pendingDevices.length})
                  </h3>
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
                    <span>Appareils distincts : {summary.distinctPhoneAttempts} téléphone(s), {summary.distinctComputerAttempts} ordinateur(s)</span>
                    <span>Rejets : {summary.rejectedChanges24h} sur 24 h · {summary.rejectedChanges7d} sur 7 j</span>
                    {summary.distinctLocations.length > 0 && <span>Régions : {summary.distinctLocations.join(" · ")}</span>}
                  </div>
                  <div className="flex flex-col gap-3">
                    {pendingDevices.map(d => {
                       const alertStat = data.deviceAlertStats.find(s => s.deviceId === d.id);
                       const attemptCount = alertStat?.attemptCount || 1;
                       const isFirstCategoryAlert = pendingDevices.find(device => device.category === d.category)?.id === d.id;
                       const blockedEvent = events.find(e => e.deviceId === d.id && e.eventType === "DEVICE_BLOCKED");
                       const reputationFlags = blockedEvent?.reputation
                        ? [
                            blockedEvent.reputation.vpn && "VPN",
                            blockedEvent.reputation.proxy && "Proxy",
                            blockedEvent.reputation.tor && "Tor",
                            blockedEvent.reputation.datacenter && "Datacenter",
                          ].filter(Boolean)
                        : [];

                       return (
                         <div
                           key={d.id}
                           id={isFirstCategoryAlert ? `device-alert-${d.category}` : undefined}
                           className="bg-white border border-red-200 shadow-sm rounded-lg overflow-hidden scroll-mt-4"
                         >
                           <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex justify-between items-center">
                             <div className="flex items-center gap-2 text-red-900 font-semibold text-[13px]">
                                {d.category === "PHONE" ? <Smartphone size={14} /> : <Monitor size={14} />}
                                {d.category === "PHONE" ? "NOUVEAU TÉLÉPHONE" : "NOUVEL ORDINATEUR"}
                             </div>
                             <div className="flex gap-2">
                               <span className="ad-badge ad-badge-pending text-[11px] py-0.5"><AlertTriangle size={10}/> Bloqué</span>
                             </div>
                           </div>
                           <div className="p-4 flex flex-col md:flex-row gap-4 justify-between md:items-center">
                              <div className="flex-1">
                                <div className="text-[13px] font-semibold text-slate-900 mb-1">
                                  {d.os || "OS inconnu"} · {d.browser || "Navigateur inconnu"}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-slate-500 mt-2">
                                  <div><span className="text-slate-400">Date/Heure:</span> {formatDate(d.lastSeenAt)}</div>
                                  <div><span className="text-slate-400">IP / Lieu:</span> <span className="font-mono">{d.lastIp || "—"}</span> ({[d.city, d.region, d.country].filter(Boolean).join(", ") || "—"})</div>
                                  <div><span className="text-slate-400">Réseau:</span> {reputationFlags.length > 0 ? reputationFlags.join(", ") : "Normal / inconnu"}</div>
                                  <div><span className="text-slate-400">Raison:</span> {blockedEvent?.riskReasons?.join(", ") || `${d.category}_SLOT_ALREADY_OCCUPIED`}</div>
                                  <div className="col-span-1 sm:col-span-2 mt-1">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200">
                                      Tentatives sur cet appareil: {attemptCount}
                                    </span>
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200 ml-2">
                                      Appareils distincts pour cet utilisateur : {summary.distinctReplacementAttempts}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 min-w-[180px]">
                                <button
                                  className="ad-btn-sm justify-center text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300"
                                  onClick={() => confirmAction(`Approuver ce nouvel ${d.category === "PHONE" ? "téléphone" : "ordinateur"} et remplacer l'appareil de confiance actuel ?`, () => approveMut.mutateAsync({ userId, deviceId: d.id }), "Appareil approuvé")}
                                >
                                  <CheckCircle2 size={14} /> Approuver & Remplacer
                                </button>
                                <button
                                  className="ad-btn-sm justify-center text-slate-600 hover:bg-slate-100"
                                  onClick={() => confirmAction("Ignorer cette alerte et maintenir le blocage ?", () => ignoreMut.mutateAsync({ userId, deviceId: d.id }), "Alerte ignorée")}
                                >
                                  <EyeOff size={14} /> Ignorer / Garder bloqué
                                </button>
                              </div>
                           </div>
                         </div>
                       )
                    })}
                  </div>
                </div>
              )}
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-[14px] font-bold text-slate-800 mb-3">Actions administrateur ({adminActions.length})</h3>
                {adminActions.length === 0 ? (
                  <p className="text-[13px] text-slate-500">Aucune action administrateur récente.</p>
                ) : (
                  <div className="ad-table-wrap">
                    <table className="w-full border-collapse text-left text-[12px]">
                      <thead>
                        <tr>
                          <th className="ad-th">Date</th>
                          <th className="ad-th">Action</th>
                          <th className="ad-th">Raison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminActions.map(event => (
                          <tr key={event.id} className="ad-tr">
                            <td className="ad-td text-slate-500">{formatDate(event.createdAt)} {new Date(event.createdAt).toLocaleTimeString("fr-FR")}</td>
                            <td className="ad-td font-semibold">{event.eventType.replace(/_/g, " ")}</td>
                            <td className="ad-td">{typeof event.metadata?.reason === "string" ? event.metadata.reason : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="flex flex-col gap-4">
              <h3 className="text-[14px] font-bold text-slate-800">Historique des appareils ({revokedDevices.length})</h3>
              {revokedDevices.length === 0 ? (
                <p className="text-[13px] text-slate-500">Aucun appareil révoqué dans l'historique.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {revokedDevices.map(d => (
                    <div key={d.id} className="ad-card p-3 flex gap-3 items-start bg-slate-50">
                      <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                         {d.category === "PHONE" ? <Smartphone size={16} /> : <Monitor size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="text-[13px] font-bold text-slate-700 truncate pr-2">
                            {d.os || "OS inconnu"} · {d.browser || "Navigateur inconnu"}
                          </div>
                          {ignoredDeviceIds.has(d.id) ? (
                            <span className="ad-badge ad-badge-pending text-[10px] py-0.5"><EyeOff size={10} /> IGNORÉ · BLOQUÉ</span>
                          ) : (
                            <span className="ad-badge ad-badge-normal text-[10px] py-0.5 bg-white border-slate-200 text-slate-500"><History size={10} /> RÉVOQUÉ / REMPLACÉ</span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-slate-500 mt-1.5 flex flex-col gap-0.5">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Enregistré le:</span>
                            <span>{formatDate(d.firstSeenAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Dernière activité:</span>
                            <span>{timeAgo(d.lastSeenAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Dernière IP:</span>
                            <span className="font-mono">{d.lastIp || "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "events" && (
            <div className="ad-table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                <thead>
                  <tr>
                    <th className="ad-th">Date</th>
                    <th className="ad-th">Événement</th>
                    <th className="ad-th">Résultat</th>
                    <th className="ad-th">Risque</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>Aucun événement récent.</td></tr>}
                  {events.map(e => (
                    <tr key={e.id} className="ad-tr">
                      <td className="ad-td" style={{ color: "#64748B" }}>{formatDate(e.createdAt)}<br/>{new Date(e.createdAt).toLocaleTimeString("fr-FR")}</td>
                      <td className="ad-td" style={{ fontWeight: 600 }}>{e.eventType.replace(/_/g, " ")}</td>
                      <td className="ad-td">
                        <span style={{ 
                          padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: e.outcome === "ALLOWED" ? "#DCFCE7" : e.outcome === "ADMIN_ACTION" ? "#DBEAFE" : "#FEE2E2",
                          color: e.outcome === "ALLOWED" ? "#14532D" : e.outcome === "ADMIN_ACTION" ? "#1E40AF" : "#9F1239"
                        }}>
                          {e.outcome}
                        </span>
                      </td>
                      <td className="ad-td">
                        {e.riskScore !== null ? (
                          <div>
                            <div style={{ color: e.riskScore > 70 ? "#9F1239" : e.riskScore > 30 ? "#92400E" : "#15803D", fontWeight: 600 }}>Score: {e.riskScore}</div>
                            {e.riskReasons && e.riskReasons.length > 0 && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{e.riskReasons.join(", ")}</div>}
                            {(e.country || e.city) && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{[e.city, e.region, e.country].filter(Boolean).join(", ")}{e.distanceKm ? ` (${e.distanceKm}km)` : ""}</div>}
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "sessions" && (
            <div className="ad-table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                <thead>
                  <tr>
                    <th className="ad-th">Création</th>
                    <th className="ad-th">Appareil ID</th>
                    <th className="ad-th">IP</th>
                    <th className="ad-th">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>Aucune session.</td></tr>}
                  {sessions.map(s => (
                    <tr key={s.id} className="ad-tr" style={{ opacity: s.revokedAt ? 0.6 : 1 }}>
                      <td className="ad-td" style={{ color: "#64748B" }}>{formatDate(s.createdAt)} {new Date(s.createdAt).toLocaleTimeString("fr-FR")}</td>
                      <td className="ad-td">Appareil #{s.deviceId}</td>
                      <td className="ad-td" style={{ fontFamily: "monospace" }}>{s.ipAddress}</td>
                      <td className="ad-td">
                        {s.revokedAt ? (
                          <span style={{ color: "#9F1239" }}>Révoquée le {new Date(s.revokedAt).toLocaleDateString("fr-FR")}</span>
                        ) : (
                          <span style={{ color: "#15803D", fontWeight: 600 }}>Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "whitelists" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="ad-card" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Label>Adresse IP (Optionnel)</Label>
                  <Input value={wlIp} onChange={e => setWlIp(e.target.value)} placeholder="ex: 192.168.1.1" className="ad-input" data-testid="input-whitelist-ip" />
                </div>
                <div style={{ flex: 2 }}>
                  <Label>Raison</Label>
                  <Input value={wlReason} onChange={e => setWlReason(e.target.value)} placeholder="ex: IP partagée..." className="ad-input" data-testid="input-whitelist-reason" />
                </div>
                <button 
                  className="ad-btn-primary" 
                  data-testid="btn-add-whitelist"
                  disabled={(!wlIp && !wlReason) || addWhitelistMut.isPending}
                  onClick={() => handleAction(addWhitelistMut.mutateAsync({ userId, ipAddress: wlIp, userWide: !wlIp, reason: wlReason }).then(() => { setWlIp(""); setWlReason(""); }), "Exception ajoutée")}
                >
                  <Plus size={14} /> Ajouter
                </button>
              </div>

              <div className="ad-table-wrap">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                  <thead>
                    <tr>
                      <th className="ad-th">Portée</th>
                      <th className="ad-th">Adresse IP</th>
                      <th className="ad-th">Raison</th>
                      <th className="ad-th">Création</th>
                      <th className="ad-th" style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelists.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>Aucune exception configurée.</td></tr>}
                    {whitelists.map(w => (
                      <tr key={w.id} className="ad-tr" style={{ opacity: w.isActive ? 1 : 0.5 }}>
                        <td className="ad-td" style={{ fontWeight: 600 }}>{w.ipAddress ? "IP spécifique" : "Utilisateur entier"}</td>
                        <td className="ad-td" style={{ fontFamily: "monospace" }}>{w.ipAddress || "Toutes IPs"}</td>
                        <td className="ad-td">{w.reason || "—"}</td>
                        <td className="ad-td" style={{ color: "#64748B" }}>{new Date(w.createdAt).toLocaleDateString("fr-FR")}</td>
                        <td className="ad-td">
                          {w.isActive && (
                            <button className="ad-ibtn danger" data-testid={`btn-remove-whitelist-${w.id}`} onClick={() => handleAction(removeWhitelistMut.mutateAsync({ userId, whitelistId: w.id }), "Exception retirée")}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}