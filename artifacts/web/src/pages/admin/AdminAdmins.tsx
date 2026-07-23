import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Plus, Edit2, Trash2, Mail, User, Clock, Globe,
  Eye, EyeOff, CheckCircle, XCircle, RefreshCw, Lock, Unlock, GraduationCap, X,
} from "lucide-react";

/* ── Constants ──────────────────────────────────────────────────────────── */

const ROLE_OPTIONS = [
  { value: "super_admin",          label: "Super Admin",           color: "#7C3AED", bg: "#EDE9FE" },
  { value: "subscription_manager", label: "Subscription Manager",  color: "#0369A1", bg: "#E0F2FE" },
  { value: "support",              label: "Support",               color: "#065F46", bg: "#D1FAE5" },
];

const PERMISSION_OPTIONS = [
  { key: "manage_users",          label: "Gérer les utilisateurs" },
  { key: "manage_subscriptions",  label: "Gérer les abonnements" },
  { key: "manage_content",        label: "Gérer le contenu (vidéos, cours)" },
  { key: "manage_community",      label: "Gérer la communauté" },
  { key: "view_analytics",        label: "Voir les statistiques" },
  { key: "send_notifications",    label: "Envoyer des notifications" },
  { key: "manage_plans",          label: "Gérer les plans tarifaires" },
  { key: "manage_tools",          label: "Gérer les outils" },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function roleTag(role: string) {
  const r = ROLE_OPTIONS.find(o => o.value === role) ?? { label: role, color: "#64748B", bg: "#F1F5F9" };
  return (
    <span style={{ background: r.bg, color: r.color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, border: `1px solid ${r.color}22`, whiteSpace: "nowrap" }}>
      {r.label}
    </span>
  );
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/* ── Types ──────────────────────────────────────────────────────────────── */

interface AdminRow {
  id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  role: string;
  is_active: boolean;
  permissions: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
}

interface CoursePerm {
  id: number;
  admin_id: number;
  playlist_id: number;
  playlist_title: string | null;
  can_grant_access: boolean;
  can_remove_access: boolean;
  can_view_users: boolean;
  can_manage_videos: boolean;
  can_manage_categories: boolean;
}

interface Playlist { id: number; title: string; }

interface FormState {
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  isActive: boolean;
  permissions: string[];
}

const EMPTY_FORM: FormState = {
  username: "", displayName: "", email: "",
  password: "", confirmPassword: "",
  role: "support", isActive: true, permissions: [],
};

/* ── Field component ────────────────────────────────────────────────────── */
function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
        {label}{required && <span style={{ color: "#DC2626" }}> *</span>}
      </span>
      {children}
      {error && <p style={{ fontSize: 11.5, color: "#9F1239", margin: 0 }}>{error}</p>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38, borderRadius: 7, border: "1px solid #CBD5E1",
  padding: "0 10px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
};

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export function AdminAdmins() {
  const { getAdminAuthHeaders, admin: localAdmin } = useAuth();
  const qc = useQueryClient();
  const headers = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;

  /* ── Fetch admins list ── */
  const { data: admins = [], isLoading, refetch, isFetching } = useQuery<AdminRow[]>({
    queryKey: ["admin-admins-list"],
    queryFn: async () => {
      const r = await fetch("/api/admin/admins", { headers });
      if (!r.ok) throw new Error("Failed to load admins");
      return r.json();
    },
  });

  /* ── Determine isSuperAdmin from LIVE data (not stale localStorage) ── */
  const currentAdminRecord = admins.find(a => a.id === (localAdmin as any)?.id);
  const isSuperAdmin =
    (localAdmin as any)?.role === "super_admin" ||   // freshly-logged-in session
    currentAdminRecord?.role === "super_admin";       // works even if localStorage is stale

  /* ── Modal state ── */
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AdminRow | null>(null);

  /* ── Course permissions modal state ── */
  const [coursePermsTarget, setCoursePermsTarget] = useState<AdminRow | null>(null);
  const [coursePerms, setCoursePerms] = useState<CoursePerm[]>([]);
  const [coursePermsLoading, setCoursePermsLoading] = useState(false);
  const [coursePermsError, setCoursePermsError] = useState<string | null>(null);
  const [addPlaylistId, setAddPlaylistId] = useState<string>("");
  const [addingCourse, setAddingCourse] = useState(false);

  /* ── Fetch all playlists (for course perms modal) ── */
  const { data: allPlaylists = [] } = useQuery<Playlist[]>({
    queryKey: ["admin-playlists-list"],
    queryFn: async () => {
      const r = await fetch("/api/admin/playlists", { headers });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : (d as any).playlists ?? [];
    },
    enabled: isSuperAdmin,
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/admin/admins", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Échec de la création"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); closeModal(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const editMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: object }) => {
      const r = await fetch(`/api/admin/admins/${id}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Échec de la modification"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); closeModal(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/admins/${id}`, { method: "DELETE", headers });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Échec de la suppression"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); setDeleteTarget(null); },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(`/api/admin/admins/${id}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "Échec"); }
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins-list"] }); setToggleTarget(null); },
    onError: (e: Error) => setFormError(e.message),
  });

  /* ── Course perms helpers ── */
  async function openCoursePerms(row: AdminRow) {
    setCoursePermsTarget(row);
    setCoursePermsError(null);
    setAddPlaylistId("");
    setCoursePermsLoading(true);
    try {
      const r = await fetch(`/api/admin/admins/${row.id}/course-permissions`, { headers });
      const d = await r.json();
      setCoursePerms(Array.isArray(d) ? d : []);
    } catch {
      setCoursePermsError("Erreur de chargement");
    } finally {
      setCoursePermsLoading(false);
    }
  }

  async function handleAddCoursePerm() {
    if (!coursePermsTarget || !addPlaylistId) return;
    setAddingCourse(true); setCoursePermsError(null);
    try {
      const r = await fetch(`/api/admin/admins/${coursePermsTarget.id}/course-permissions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId: Number(addPlaylistId) }),
      });
      if (!r.ok) { const d = await r.json(); setCoursePermsError(d.message || "Erreur"); return; }
      setAddPlaylistId("");
      const r2 = await fetch(`/api/admin/admins/${coursePermsTarget.id}/course-permissions`, { headers });
      setCoursePerms(await r2.json());
    } catch { setCoursePermsError("Erreur réseau"); }
    finally { setAddingCourse(false); }
  }

  async function handleRemoveCoursePerm(playlistId: number) {
    if (!coursePermsTarget) return;
    try {
      await fetch(`/api/admin/admins/${coursePermsTarget.id}/course-permissions/${playlistId}`, {
        method: "DELETE", headers,
      });
      setCoursePerms(prev => prev.filter(p => p.playlist_id !== playlistId));
    } catch { setCoursePermsError("Erreur lors de la suppression"); }
  }

  /* ── Helpers ── */
  function openCreate() {
    setForm(EMPTY_FORM); setFormError(null); setModal("create"); setShowPw(false); setShowConfirm(false);
  }

  function openEdit(row: AdminRow) {
    setForm({
      username: row.username,
      displayName: row.display_name ?? "",
      email: row.email ?? "",
      password: "",
      confirmPassword: "",
      role: row.role,
      isActive: row.is_active,
      permissions: parsePermissions(row.permissions),
    });
    setEditId(row.id); setFormError(null); setModal("edit"); setShowPw(false); setShowConfirm(false);
  }

  function closeModal() {
    setModal(null); setEditId(null); setFormError(null);
  }

  function togglePermission(key: string) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter(p => p !== key) : [...f.permissions, key],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (modal === "create") {
      if (!form.username.trim()) { setFormError("Le nom d'utilisateur est requis."); return; }
      if (!form.password) { setFormError("Le mot de passe est requis."); return; }
      if (form.password.length < 8) { setFormError("Le mot de passe doit contenir au moins 8 caractères."); return; }
      if (form.password !== form.confirmPassword) { setFormError("Les mots de passe ne correspondent pas."); return; }
      createMut.mutate({
        username: form.username.trim(),
        displayName: form.displayName.trim() || null,
        email: form.email.trim() || null,
        password: form.password,
        role: form.role,
        isActive: form.isActive,
        permissions: form.permissions,
      });
    } else if (modal === "edit" && editId) {
      if (form.password && form.password.length < 8) { setFormError("Le mot de passe doit contenir au moins 8 caractères."); return; }
      if (form.password && form.password !== form.confirmPassword) { setFormError("Les mots de passe ne correspondent pas."); return; }
      const body: Record<string, unknown> = {
        role: form.role,
        displayName: form.displayName.trim() || null,
        email: form.email.trim() || null,
        isActive: form.isActive,
        permissions: form.permissions,
      };
      if (form.password) body.password = form.password;
      editMut.mutate({ id: editId, body });
    }
  }

  const isBusy = createMut.isPending || editMut.isPending;
  const currentAdminId = (localAdmin as any)?.id;

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "24px 28px", maxWidth: 980 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={19} color="#7C3AED" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>Gestion des administrateurs</h1>
            <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Chaque personne dispose d'un compte personnel et traçable</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Actualiser"
            style={{ width: 34, height: 34, borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", cursor: isFetching ? "not-allowed" : "pointer", color: "#64748B" }}
          >
            <RefreshCw size={13} style={{ animation: isFetching ? "spin 0.8s linear infinite" : "none" }} />
          </button>

          {isSuperAdmin && (
            <button
              onClick={openCreate}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 4px rgba(124,58,237,0.25)", whiteSpace: "nowrap" }}
            >
              <Plus size={14} /> Nouvel administrateur
            </button>
          )}
        </div>
      </div>

      {!isSuperAdmin && admins.length > 0 && (
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92400E" }}>
          ⚠️ Seul le <strong>Super Admin</strong> peut créer, modifier ou supprimer des comptes. Vous pouvez uniquement consulter la liste.
        </div>
      )}

      {/* ── Table ── */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#94A3B8" }}>Chargement...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                {["Administrateur", "Email", "Rôle", "Statut", "Dernière connexion", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {admins.map((row, i) => {
                const perms = parsePermissions(row.permissions);
                return (
                  <tr key={row.id} style={{ borderBottom: i < admins.length - 1 ? "1px solid #F1F5F9" : "none", opacity: row.is_active ? 1 : 0.55 }}>

                    {/* Administrateur */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div style={{ width: 33, height: 33, borderRadius: 8, background: row.is_active ? "#EDE9FE" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={14} color={row.is_active ? "#7C3AED" : "#94A3B8"} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A", display: "flex", alignItems: "center", gap: 6 }}>
                            {row.display_name ?? row.username}
                            {row.id === currentAdminId && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 99, background: "#DBEAFE", color: "#1D4ED8" }}>Vous</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: "#94A3B8" }}>@{row.username}</div>
                          {perms.length > 0 && (
                            <div style={{ fontSize: 10.5, color: "#7C3AED", marginTop: 2 }}>
                              {perms.length} permission{perms.length > 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#334155" }}>
                      {row.email ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Mail size={11} color="#94A3B8" /> {row.email}
                        </span>
                      ) : <span style={{ color: "#CBD5E1", fontSize: 12 }}>—</span>}
                    </td>

                    {/* Rôle */}
                    <td style={{ padding: "12px 14px" }}>{roleTag(row.role)}</td>

                    {/* Statut */}
                    <td style={{ padding: "12px 14px" }}>
                      {row.is_active ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
                          <CheckCircle size={13} /> Actif
                        </span>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#9F1239", fontWeight: 600 }}>
                          <XCircle size={13} /> Inactif
                        </span>
                      )}
                    </td>

                    {/* Dernière connexion */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={11} color="#94A3B8" /> {formatDt(row.last_login_at)}
                      </div>
                      {row.last_login_ip && (
                        <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                          <Globe size={10} /> {row.last_login_ip}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 14px" }}>
                      {isSuperAdmin && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "nowrap" }}>
                          <button onClick={() => openEdit(row)} title="Modifier"
                            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#475569" }}>
                            <Edit2 size={12} />
                          </button>
                          {row.role !== "super_admin" && (
                            <button onClick={() => openCoursePerms(row)} title="Cours autorisés"
                              style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #BAE6FD", background: "#F0F9FF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0369A1" }}>
                              <GraduationCap size={12} />
                            </button>
                          )}
                          {row.id !== currentAdminId && (
                            <>
                              <button
                                onClick={() => { setFormError(null); setToggleTarget(row); }}
                                title={row.is_active ? "Désactiver" : "Activer"}
                                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${row.is_active ? "#FED7AA" : "#BBF7D0"}`, background: row.is_active ? "#FFF7ED" : "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: row.is_active ? "#92400E" : "#166534" }}>
                                {row.is_active ? <Lock size={12} /> : <Unlock size={12} />}
                              </button>
                              <button onClick={() => { setFormError(null); setDeleteTarget(row); }} title="Supprimer"
                                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #FECDD3", background: "#FFF1F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9F1239" }}>
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {admins.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#94A3B8", fontSize: 13 }}>
              Aucun administrateur trouvé
            </div>
          )}
        </div>
      )}

      {/* ══ CREATE / EDIT MODAL ══════════════════════════════════════════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 16px", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", marginBottom: 20 }}>
            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={16} color="#7C3AED" />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
                {modal === "create" ? "Créer un compte administrateur" : "Modifier le compte administrateur"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Row: Username + DisplayName */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Nom d'utilisateur" required={modal === "create"}>
                  <input
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    disabled={modal === "edit"}
                    required={modal === "create"}
                    style={{ ...inputStyle, background: modal === "edit" ? "#F8FAFC" : "#fff", color: modal === "edit" ? "#94A3B8" : "#0F172A" }}
                    placeholder="ex: karim_support"
                  />
                </Field>
                <Field label="Nom complet affiché">
                  <input
                    value={form.displayName}
                    onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                    style={inputStyle}
                    placeholder="ex: Karim Boudiaf"
                  />
                </Field>
              </div>

              {/* Email */}
              <Field label="Adresse email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                  placeholder="karim@example.com"
                />
              </Field>

              {/* Row: Password + Confirm */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label={modal === "create" ? "Mot de passe" : "Nouveau mot de passe"} required={modal === "create"}>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      required={modal === "create"}
                      style={{ ...inputStyle, paddingRight: 34 }}
                      placeholder={modal === "create" ? "Min. 8 caractères" : "Laisser vide = inchangé"}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}>
                      {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </Field>
                <Field label="Confirmer le mot de passe" required={modal === "create" || !!form.password}>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      required={modal === "create" || !!form.password}
                      style={{ ...inputStyle, paddingRight: 34 }}
                      placeholder="Répéter le mot de passe"
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}>
                      {showConfirm ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </Field>
              </div>

              {/* Row: Role + Status */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Rôle" required>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    style={{ ...inputStyle, padding: "0 10px", background: "#fff" }}
                  >
                    {ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Statut du compte">
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {[{ val: true, label: "Actif", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
                      { val: false, label: "Inactif", color: "#9F1239", bg: "#FFF1F2", border: "#FECDD3" }].map(opt => (
                      <button
                        type="button"
                        key={String(opt.val)}
                        onClick={() => setForm(f => ({ ...f, isActive: opt.val }))}
                        style={{
                          flex: 1, height: 38, borderRadius: 7,
                          border: `1.5px solid ${form.isActive === opt.val ? opt.border : "#E2E8F0"}`,
                          background: form.isActive === opt.val ? opt.bg : "#F8FAFC",
                          color: form.isActive === opt.val ? opt.color : "#64748B",
                          fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all 120ms",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Permissions */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>Permissions spécifiques</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {PERMISSION_OPTIONS.map(p => {
                    const active = form.permissions.includes(p.key);
                    return (
                      <button
                        type="button"
                        key={p.key}
                        onClick={() => togglePermission(p.key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "7px 10px", borderRadius: 7,
                          border: `1.5px solid ${active ? "#A78BFA" : "#E2E8F0"}`,
                          background: active ? "#F5F3FF" : "#F8FAFC",
                          cursor: "pointer", textAlign: "left", transition: "all 120ms",
                        }}
                      >
                        <div style={{ width: 14, height: 14, borderRadius: 4, border: `2px solid ${active ? "#7C3AED" : "#CBD5E1"}`, background: active ? "#7C3AED" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {active && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 11.5, color: active ? "#5B21B6" : "#475569", fontWeight: active ? 600 : 400 }}>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Error */}
              {formError && (
                <p style={{ fontSize: 12, color: "#9F1239", margin: 0, background: "#FFF1F2", padding: "9px 12px", borderRadius: 7, border: "1px solid #FECDD3" }}>
                  ⚠️ {formError}
                </p>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4, paddingTop: 4, borderTop: "1px solid #F1F5F9" }}>
                <button type="button" onClick={closeModal}
                  style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                  Annuler
                </button>
                <button type="submit" disabled={isBusy}
                  style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: isBusy ? "#A78BFA" : "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {isBusy ? <><span style={{ width: 12, height: 12, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> En cours...</> : modal === "create" ? "Créer le compte" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ TOGGLE ACTIVE MODAL ═════════════════════════════════════════════ */}
      {toggleTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: toggleTarget.is_active ? "#92400E" : "#14532D", marginBottom: 10 }}>
              {toggleTarget.is_active ? "🔒 Désactiver ce compte ?" : "🔓 Activer ce compte ?"}
            </h2>
            <p style={{ fontSize: 13.5, color: "#334155", marginBottom: 20 }}>
              {toggleTarget.is_active
                ? <>L'administrateur <strong>{toggleTarget.display_name ?? toggleTarget.username}</strong> ne pourra plus se connecter.</>
                : <>L'administrateur <strong>{toggleTarget.display_name ?? toggleTarget.username}</strong> pourra à nouveau se connecter.</>
              }
            </p>
            {formError && <p style={{ fontSize: 12, color: "#9F1239", margin: "0 0 12px", background: "#FFF1F2", padding: "8px 12px", borderRadius: 6, border: "1px solid #FECDD3" }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setToggleTarget(null)} style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 13, cursor: "pointer" }}>Annuler</button>
              <button
                onClick={() => toggleMut.mutate({ id: toggleTarget.id, isActive: !toggleTarget.is_active })}
                disabled={toggleMut.isPending}
                style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: toggleTarget.is_active ? "#92400E" : "#14532D", color: "#fff", fontSize: 13, fontWeight: 600, cursor: toggleMut.isPending ? "not-allowed" : "pointer" }}
              >
                {toggleMut.isPending ? "En cours..." : toggleTarget.is_active ? "Désactiver" : "Activer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE CONFIRM MODAL ════════════════════════════════════════════ */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#9F1239", marginBottom: 10 }}>🗑️ Supprimer ce compte ?</h2>
            <p style={{ fontSize: 13.5, color: "#334155", marginBottom: 6 }}>
              Voulez-vous supprimer définitivement le compte de <strong>{deleteTarget.display_name ?? deleteTarget.username}</strong> ?
            </p>
            <p style={{ fontSize: 12, color: "#64748B", marginBottom: 20 }}>Cette action est irréversible. Pensez à désactiver plutôt que supprimer pour conserver l'historique.</p>
            {formError && <p style={{ fontSize: 12, color: "#9F1239", margin: "0 0 12px", background: "#FFF1F2", padding: "8px 12px", borderRadius: 6, border: "1px solid #FECDD3" }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 13, cursor: "pointer" }}>Annuler</button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending}
                style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: "#9F1239", color: "#fff", fontSize: 13, fontWeight: 600, cursor: deleteMut.isPending ? "not-allowed" : "pointer" }}
              >
                {deleteMut.isPending ? "En cours..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ COURSE PERMISSIONS MODAL ══════════════════════════════════════ */}
      {coursePermsTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 16px", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", marginBottom: 20 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "#F0F9FF", border: "1px solid #BAE6FD", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <GraduationCap size={16} color="#0369A1" />
                </div>
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0 }}>Cours autorisés</h2>
                  <p style={{ fontSize: 11.5, color: "#64748B", margin: 0 }}>{coursePermsTarget.display_name ?? coursePermsTarget.username} — {coursePermsTarget.role}</p>
                </div>
              </div>
              <button onClick={() => setCoursePermsTarget(null)}
                style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E2E8F0", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748B" }}>
                <X size={13} />
              </button>
            </div>

            <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "9px 13px", marginBottom: 18, fontSize: 12, color: "#92400E" }}>
              📌 سيستطيع هذا المسؤول منح ونزع الدورات المدرجة هنا فقط. Super Admin يملك صلاحية جميع الدورات تلقائياً.
            </div>

            {/* Add course */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select
                value={addPlaylistId}
                onChange={e => setAddPlaylistId(e.target.value)}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: "1px solid #CBD5E1", fontSize: 13, background: "#fff", color: "#0F172A" }}
              >
                <option value="">-- اختر دورة لإضافتها --</option>
                {allPlaylists.filter(p => !coursePerms.some(cp => cp.playlist_id === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <button
                onClick={handleAddCoursePerm}
                disabled={!addPlaylistId || addingCourse}
                style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: addPlaylistId ? "#0369A1" : "#E2E8F0", color: addPlaylistId ? "#fff" : "#94A3B8", fontSize: 12, fontWeight: 600, cursor: addPlaylistId ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
              >
                {addingCourse ? "..." : "+ إضافة"}
              </button>
            </div>

            {coursePermsError && (
              <p style={{ fontSize: 12, color: "#9F1239", background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>{coursePermsError}</p>
            )}

            {/* List */}
            {coursePermsLoading ? (
              <p style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 24 }}>Chargement...</p>
            ) : coursePerms.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, border: "2px dashed #E2E8F0", borderRadius: 10 }}>
                <GraduationCap size={28} color="#CBD5E1" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>ليس لهذا المسؤول أي دورة مضافة.</p>
                <p style={{ fontSize: 11.5, color: "#CBD5E1", margin: "4px 0 0" }}>أضف دورة من القائمة أعلاه.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {coursePerms.map(cp => (
                  <div key={cp.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, border: "1px solid #E0F2FE", background: "#F0F9FF", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <GraduationCap size={13} color="#0369A1" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{cp.playlist_title ?? `Cours #${cp.playlist_id}`}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10.5, color: "#64748B" }}>
                        {[cp.can_grant_access && "منح", cp.can_remove_access && "نزع", cp.can_view_users && "عرض"].filter(Boolean).join(" · ")}
                      </span>
                      <button
                        onClick={() => handleRemoveCoursePerm(cp.playlist_id)}
                        style={{ width: 24, height: 24, borderRadius: 5, border: "1px solid #FECDD3", background: "#FFF1F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9F1239", flexShrink: 0 }}
                        title="Retirer cette permission"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setCoursePermsTarget(null)}
                style={{ padding: "8px 20px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
