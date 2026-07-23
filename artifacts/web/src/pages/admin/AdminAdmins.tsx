import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, Edit2, Trash2, KeyRound, Mail, User, Clock, Globe, Crown, Eye, EyeOff } from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:          { label: "Super Admin",           color: "#7C3AED", bg: "#EDE9FE" },
  subscription_manager: { label: "Subscription Manager",  color: "#0369A1", bg: "#E0F2FE" },
  support:              { label: "Support",               color: "#065F46", bg: "#D1FAE5" },
};

function roleTag(role: string) {
  const r = ROLE_LABELS[role] ?? { label: role, color: "#64748B", bg: "#F1F5F9" };
  return (
    <span style={{ background: r.bg, color: r.color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, border: `1px solid ${r.color}22` }}>
      {r.label}
    </span>
  );
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

interface AdminRow {
  id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  role: string;
  last_login_at: string | null;
  last_login_ip: string | null;
}

interface FormState {
  username: string;
  email: string;
  displayName: string;
  password: string;
  role: string;
}

const EMPTY_FORM: FormState = { username: "", email: "", displayName: "", password: "", role: "support" };

export function AdminAdmins() {
  const { getAdminAuthHeaders, admin } = useAuth();
  const qc = useQueryClient();
  const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  const isSuperAdmin = (admin as any)?.role === "super_admin";

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: admins = [], isLoading } = useQuery<AdminRow[]>({
    queryKey: ["admin-admins-list"],
    queryFn: async () => {
      const r = await fetch("/api/admin/admins", { headers });
      if (!r.ok) throw new Error("Failed to load admins");
      return r.json();
    },
  });

  const createMut = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/admin/admins", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Failed"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); setModal(null); setForm(EMPTY_FORM); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  const editMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: object }) => {
      const r = await fetch(`/api/admin/admins/${id}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Failed"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); setModal(null); setEditId(null); setForm(EMPTY_FORM); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/admins/${id}`, { method: "DELETE", headers });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Failed"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); setDeleteTarget(null); },
    onError: (e: Error) => setError(e.message),
  });

  function openCreate() {
    setForm(EMPTY_FORM); setError(null); setModal("create"); setShowPw(false);
  }

  function openEdit(row: AdminRow) {
    setForm({ username: row.username, email: row.email ?? "", displayName: row.display_name ?? "", password: "", role: row.role });
    setEditId(row.id); setError(null); setModal("edit"); setShowPw(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (modal === "create") {
      createMut.mutate({ username: form.username, email: form.email || null, displayName: form.displayName || null, password: form.password, role: form.role });
    } else if (modal === "edit" && editId) {
      const body: Record<string, unknown> = { role: form.role, displayName: form.displayName || null, email: form.email || null };
      if (form.password) body.password = form.password;
      editMut.mutate({ id: editId, body });
    }
  }

  const isBusy = createMut.isPending || editMut.isPending;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={18} color="#7C3AED" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>Gestion des administrateurs</h1>
            <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Chaque personne doit avoir son propre compte personnel</p>
          </div>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openCreate}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nouvel admin
          </button>
        )}
      </div>

      {!isSuperAdmin && (
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#92400E" }}>
          ⚠️ Seul le Super Admin peut créer, modifier ou supprimer des comptes administrateurs. Vous pouvez uniquement consulter la liste.
        </div>
      )}

      {/* Admins Table */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Chargement...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                {["Administrateur", "Email", "Rôle", "Dernière connexion", "IP", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11.5, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: i < admins.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <User size={14} color="#7C3AED" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>{row.display_name ?? row.username}</div>
                        <div style={{ fontSize: 11.5, color: "#94A3B8" }}>@{row.username}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#334155" }}>
                    {row.email ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Mail size={12} color="#94A3B8" /> {row.email}
                      </span>
                    ) : <span style={{ color: "#CBD5E1", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>{roleTag(row.role)}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#64748B" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} color="#94A3B8" /> {formatDt(row.last_login_at)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#64748B", fontFamily: "monospace" }}>
                    {row.last_login_ip ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Globe size={11} color="#94A3B8" /> {row.last_login_ip}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {isSuperAdmin && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => openEdit(row)}
                          title="Modifier"
                          style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#475569" }}
                        ><Edit2 size={13} /></button>
                        {row.id !== (admin as any)?.id && (
                          <button
                            onClick={() => { setDeleteTarget(row); setError(null); }}
                            title="Supprimer"
                            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #FECDD3", background: "#FFF1F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9F1239" }}
                          ><Trash2 size={13} /></button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {admins.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8", fontSize: 13 }}>
              Aucun administrateur trouvé
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>
              {modal === "create" ? "Créer un nouveau compte admin" : "Modifier le compte admin"}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {modal === "create" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Nom d'utilisateur *</span>
                  <input
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    required
                    style={{ height: 38, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 10px", fontSize: 13, outline: "none" }}
                    placeholder="ex: support_karim"
                  />
                </label>
              )}
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Nom complet affiché</span>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  style={{ height: 38, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 10px", fontSize: 13, outline: "none" }}
                  placeholder="ex: Karim Boudiaf"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ height: 38, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 10px", fontSize: 13, outline: "none" }}
                  placeholder="karim@example.com"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Rôle *</span>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ height: 38, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 10px", fontSize: 13, background: "#fff", outline: "none" }}
                >
                  <option value="support">Support</option>
                  <option value="subscription_manager">Subscription Manager</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                  {modal === "create" ? "Mot de passe *" : "Nouveau mot de passe (laisser vide pour ne pas changer)"}
                </span>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required={modal === "create"}
                    style={{ height: 38, borderRadius: 7, border: "1px solid #CBD5E1", padding: "0 36px 0 10px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
                    placeholder={modal === "create" ? "Min 8 caractères" : "Laisser vide = pas de changement"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}
                  >{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </label>

              {error && <p style={{ fontSize: 12, color: "#9F1239", margin: 0, background: "#FFF1F2", padding: "8px 12px", borderRadius: 6, border: "1px solid #FECDD3" }}>{error}</p>}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" onClick={() => { setModal(null); setError(null); }} style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 13, cursor: "pointer" }}>
                  Annuler
                </button>
                <button type="submit" disabled={isBusy} style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: isBusy ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isBusy ? "not-allowed" : "pointer" }}>
                  {isBusy ? "En cours..." : modal === "create" ? "Créer" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#9F1239", marginBottom: 10 }}>Confirmer la suppression</h2>
            <p style={{ fontSize: 13.5, color: "#334155", marginBottom: 20 }}>
              Voulez-vous supprimer le compte de <strong>{deleteTarget.display_name ?? deleteTarget.username}</strong> ? Cette action est irréversible.
            </p>
            {error && <p style={{ fontSize: 12, color: "#9F1239", margin: "0 0 12px", background: "#FFF1F2", padding: "8px 12px", borderRadius: 6, border: "1px solid #FECDD3" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 13, cursor: "pointer" }}>Annuler</button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: "#9F1239", color: "#fff", fontSize: 13, fontWeight: 600, cursor: deleteMut.isPending ? "not-allowed" : "pointer" }}
              >{deleteMut.isPending ? "En cours..." : "Supprimer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
