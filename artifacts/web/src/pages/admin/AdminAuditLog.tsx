import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search, Filter } from "lucide-react";

interface AdminLogEntry {
  id: number;
  admin_id: number | null;
  admin_name: string | null;
  admin_role: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AdminRow { id: number; username: string; display_name: string | null; }

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  admin_login:             { label: "Connexion admin",        color: "#1D4ED8", bg: "#EFF6FF" },
  admin_logout:            { label: "Déconnexion admin",      color: "#6B7280", bg: "#F3F4F6" },
  grant_course:            { label: "Dورة accordée",          color: "#065F46", bg: "#D1FAE5" },
  revoke_course:           { label: "Cours révoqué",          color: "#9F1239", bg: "#FFF1F2" },
  bulk_grant_course:       { label: "Cours accordés (bulk)",  color: "#065F46", bg: "#D1FAE5" },
  bulk_revoke_course:      { label: "Cours révoqués (bulk)",  color: "#9F1239", bg: "#FFF1F2" },
  user_deleted:            { label: "Utilisateur supprimé",   color: "#7F1D1D", bg: "#FEE2E2" },
  user_blocked:            { label: "Utilisateur bloqué",     color: "#92400E", bg: "#FEF3C7" },
  user_unblocked:          { label: "Utilisateur débloqué",   color: "#14532D", bg: "#DCFCE7" },
  subscription_deleted:    { label: "Abonnement annulé",      color: "#7C3AED", bg: "#EDE9FE" },
  create_admin:            { label: "Admin créé",             color: "#1E40AF", bg: "#DBEAFE" },
  update_admin:            { label: "Admin modifié",          color: "#1D4ED8", bg: "#EFF6FF" },
  delete_admin:            { label: "Admin supprimé",         color: "#9F1239", bg: "#FFF1F2" },
  bulk_block:              { label: "Blocage bulk",           color: "#92400E", bg: "#FEF3C7" },
  bulk_unblock:            { label: "Déblocage bulk",         color: "#14532D", bg: "#DCFCE7" },
  bulk_grant_vip:          { label: "VIP accordé (bulk)",     color: "#6D28D9", bg: "#EDE9FE" },
  bulk_revoke_vip:         { label: "VIP révoqué (bulk)",     color: "#6D28D9", bg: "#F5F3FF" },
  bulk_reset_ip:           { label: "IP réinitialisé (bulk)", color: "#0369A1", bg: "#E0F2FE" },
  admin_reset_password:    { label: "Mdp utilisateur réinitialisé", color: "#0369A1", bg: "#E0F2FE" },
  drive_revoke:            { label: "Drive révoqué",          color: "#92400E", bg: "#FEF3C7" },
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  subscription_manager: "Sub. Manager",
  support: "Support",
};

function formatDt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

function parseDevice(ua: string | null) {
  if (!ua) return "—";
  if (/iPhone|iPad|iPod/.test(ua)) return "📱 iOS";
  if (/Android/.test(ua)) return "📱 Android";
  if (/Windows/.test(ua)) return "💻 Windows";
  if (/Mac/.test(ua)) return "💻 Mac";
  if (/Linux/.test(ua)) return "💻 Linux";
  return "🖥️ Appareil";
}

export function AdminAuditLog() {
  const { getAdminAuthHeaders } = useAuth();
  const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  const [search, setSearch] = useState("");
  const [filterAdminId, setFilterAdminId] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");

  const { data: logs = [], isLoading } = useQuery<AdminLogEntry[]>({
    queryKey: ["admin-audit-log", filterAdminId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "300" });
      if (filterAdminId) params.set("adminId", filterAdminId);
      const r = await fetch(`/api/admin/admin-audit-log?${params}`, { headers });
      if (!r.ok) throw new Error("Failed to load audit log");
      return r.json();
    },
  });

  const { data: adminsList = [] } = useQuery<AdminRow[]>({
    queryKey: ["admin-admins-list-audit"],
    queryFn: async () => {
      const r = await fetch("/api/admin/admins", { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const filteredLogs = logs.filter(l => {
    const q = search.toLowerCase();
    if (q && !l.admin_name?.toLowerCase().includes(q) && !l.details?.toLowerCase().includes(q) && !l.action.includes(q)) return false;
    if (filterAction && l.action !== filterAction) return false;
    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort();

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ClipboardList size={18} color="#C2410C" />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>Journal d'audit des administrateurs</h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Toutes les actions des admins — 100% traçables</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} color="#94A3B8" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={{ width: "100%", height: 36, borderRadius: 7, border: "1px solid #CBD5E1", paddingLeft: 30, paddingRight: 10, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <select
          value={filterAdminId}
          onChange={e => setFilterAdminId(e.target.value)}
          style={{ height: 36, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 10px", fontSize: 13, background: "#fff", outline: "none", minWidth: 160 }}
        >
          <option value="">Tous les admins</option>
          {adminsList.map(a => (
            <option key={a.id} value={String(a.id)}>{a.display_name ?? a.username}</option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{ height: 36, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 10px", fontSize: 13, background: "#fff", outline: "none", minWidth: 180 }}
        >
          <option value="">Toutes les actions</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>
        {filteredLogs.length} entrée{filteredLogs.length !== 1 ? "s" : ""}
      </div>

      {/* Log Table */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Chargement...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                {["Date & Heure", "Administrateur", "Action", "Détails", "IP", "Appareil"].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log, i) => {
                const al = ACTION_LABELS[log.action];
                return (
                  <tr key={log.id} style={{ borderBottom: i < filteredLogs.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>
                      {formatDt(log.created_at)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{log.admin_name ?? "—"}</div>
                      {log.admin_role && (
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{ROLE_LABELS[log.admin_role] ?? log.admin_role}</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {al ? (
                        <span style={{ background: al.bg, color: al.color, fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
                          {al.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>{log.action}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#334155", maxWidth: 300 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={log.details ?? undefined}>
                        {log.details ?? "—"}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {log.ip_address ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>
                      {parseDevice(log.user_agent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredLogs.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8", fontSize: 13 }}>
              Aucune entrée trouvée
            </div>
          )}
        </div>
      )}
    </div>
  );
}
