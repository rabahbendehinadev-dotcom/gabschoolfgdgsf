import { useState, useMemo } from "react";
import { 
  useSecurityUsers, useSecurityUserDetails, useRevokeDevice, useResetDeviceCategory, 
  useApproveDevice, useBlockUserSecurity, useUnblockUserSecurity,
  useAddWhitelist, useRemoveWhitelist,
  SecurityUser, SecurityDevice
} from "@/hooks/use-security-admin";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { 
  ShieldAlert, Search, RefreshCcw, ShieldCheck, ShieldOff,
  Smartphone, Monitor, AlertTriangle, CheckCircle2, XCircle, 
  Trash2, Plus, Clock, Globe, ListFilter, Activity
} from "lucide-react";
import { formatDate } from "@/lib/utils";

function StatusBadge({ status }: { status: SecurityDevice["status"] }) {
  if (status === "TRUSTED") return <span className="ad-badge ad-badge-active"><CheckCircle2 size={10} /> Approuvé</span>;
  if (status === "BLOCKED") return <span className="ad-badge ad-badge-pending"><AlertTriangle size={10} /> Bloqué</span>;
  return <span className="ad-badge ad-badge-normal"><XCircle size={10} /> Révoqué</span>;
}

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
  const { data: users, refetch, isFetching, isError, error } = useSecurityUsers();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "blocked_user" | "blocked_device" | "clean">("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let r = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || String(u.id).includes(q));
    }
    if (filter === "blocked_user") r = r.filter(u => u.securityBlockedAt !== null || !u.isActive);
    else if (filter === "blocked_device") r = r.filter(u => u.devices.some(d => d.status === "BLOCKED"));
    else if (filter === "clean") r = r.filter(u => u.securityBlockedAt === null && u.isActive && !u.devices.some(d => d.status === "BLOCKED"));
    return r;
  }, [users, search, filter]);

  return (
    <div dir="ltr" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", lineHeight: 1.2, letterSpacing: "-0.02em" }}>Sécurité des appareils</h1>
          <p style={{ fontSize: 14, color: "#667085", marginTop: 4 }}>
            Contrôle d'accès strict, sessions et appareils de confiance
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
          <input type="text" placeholder="Rechercher utilisateur, e-mail, ID..." value={search}
            onChange={e => setSearch(e.target.value)} className="ad-input" style={{ paddingLeft: 32 }} data-testid="input-security-search" />
        </div>
        <div style={{ display: "flex", gap: 4, background: "#fff", padding: 3, borderRadius: 8, border: "1px solid #E2E8F0" }}>
          {[
            { id: "all", label: "Tous" },
            { id: "blocked_user", label: "Comptes bloqués" },
            { id: "blocked_device", label: "Appareils bloqués" },
            { id: "clean", label: "Sains" },
          ].map(f => (
            <button
              key={f.id} type="button"
              onClick={() => setFilter(f.id as "all" | "blocked_user" | "blocked_device" | "clean")}
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
              {filteredUsers.map((user, idx) => {
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
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
              Aucun utilisateur trouvé.
            </div>
          ) : null}
        </div>
      </div>

      {detailId && <UserSecurityDialog userId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function UserSecurityDialog({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, isFetching, isError, error } = useSecurityUserDetails(userId);
  const [tab, setTab] = useState<"devices" | "events" | "sessions" | "whitelists">("devices");
  const { toast } = useToast();
  
  const revokeMut = useRevokeDevice();
  const approveMut = useApproveDevice();
  const resetMut = useResetDeviceCategory();
  const blockMut = useBlockUserSecurity();
  const unblockMut = useUnblockUserSecurity();
  const addWhitelistMut = useAddWhitelist();
  const removeWhitelistMut = useRemoveWhitelist();

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

  const { user, devices, events, sessions, whitelists } = data;
  const isBlocked = user.securityBlockedAt !== null || !user.isActive;

  const handleAction = async (action: Promise<void>, successMsg: string) => {
    try {
      await action;
      toast({ title: successMsg });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 gap-0 bg-[#F8FAFC] overflow-hidden" dir="ltr">
        {/* HEADER */}
        <div style={{ padding: "20px 24px", background: "#fff", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E2E8F0", background: "#fff", padding: "0 20px" }}>
          {[
            { id: "devices", label: "Appareils", icon: Smartphone },
            { id: "events", label: "Journal de sécurité", icon: Activity },
            { id: "sessions", label: "Sessions actives", icon: Clock },
            { id: "whitelists", label: "Exceptions IP", icon: ListFilter },
          ].map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                data-testid={`btn-tab-${t.id}`}
                onClick={() => setTab(t.id as "devices" | "events" | "sessions" | "whitelists")}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1E293B" }}>Gestion des appareils approuvés</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ad-btn-sm" data-testid="btn-reset-phone" onClick={() => handleAction(resetMut.mutateAsync({ userId, category: "PHONE" }), "Téléphones réinitialisés")}>
                    Réinitialiser Tél.
                  </button>
                  <button className="ad-btn-sm" data-testid="btn-reset-computer" onClick={() => handleAction(resetMut.mutateAsync({ userId, category: "COMPUTER" }), "Ordinateurs réinitialisés")}>
                    Réinitialiser PC
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {devices.length === 0 ? (
                  <p style={{ color: "#94A3B8", fontSize: 13 }}>Aucun appareil enregistré.</p>
                ) : (
                  devices.map(d => (
                    <div key={d.id} className="ad-card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
                          {d.category === "PHONE" ? <Smartphone size={18} /> : <Monitor size={18} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", display: "flex", alignItems: "center", gap: 6 }}>
                            {d.os || "Inconnu"} · {d.browser || "Inconnu"}
                            <StatusBadge status={d.status} />
                          </div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2, display: "flex", gap: 12 }}>
                            <span>Vu : {timeAgo(d.lastSeenAt)}</span>
                            <span>IP : <span style={{ fontFamily: "monospace" }}>{d.lastIp || "—"}</span></span>
                            {d.country && <span>{d.city ? `${d.city}, ` : ""}{d.country}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {d.status === "BLOCKED" && (
                          <button className="ad-btn-sm" data-testid={`btn-approve-device-${d.id}`} style={{ color: "#15803D" }} onClick={() => handleAction(approveMut.mutateAsync({ userId, deviceId: d.id }), "Appareil approuvé")}>
                            <CheckCircle2 size={14} /> Approuver
                          </button>
                        )}
                        {d.status === "TRUSTED" && (
                          <button className="ad-btn-sm" data-testid={`btn-revoke-device-${d.id}`} style={{ color: "#9F1239" }} onClick={() => handleAction(revokeMut.mutateAsync({ userId, deviceId: d.id }), "Appareil révoqué")}>
                            <XCircle size={14} /> Révoquer
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
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
                  disabled={!wlIp && !wlReason || addWhitelistMut.isPending}
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
