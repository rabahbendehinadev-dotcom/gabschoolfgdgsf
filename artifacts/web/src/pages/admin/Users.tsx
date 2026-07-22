import { useState, useEffect, useMemo, useCallback } from "react";
import {
  useGetAdminUsers, useUpdateAdminUser, useResetUserIp,
  useDeleteAdminUser, useGetAdminNotificationStats,
  useSendUserTestPush, useGetAdminPlaylists,
} from "@workspace/api-client-react/src/generated/api";
import type { AdminUser, UpdateUserInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useToast } from "@/hooks/use-toast";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  Search, Edit, RefreshCw, ShieldOff, ShieldCheck, Trash2,
  MessageCircle, KeyRound, Eye, EyeOff, BellRing, BellOff,
  Clock, Send, Loader2, GraduationCap, Check, ChevronUp,
  ChevronDown, ChevronsUpDown, Crown, BookOpen,
  CheckSquare, Square, Download, RefreshCcw, X, Filter,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type NotifFilter = "all" | "enabled" | "disabled";
type ExtendedAdminUser = AdminUser & {
  fullName: string | null; lastVisitAt: string | null; deviceCount: number;
  courses: { playlistId: number; title: string }[]; subscriptionStartedAt: string | null;
  phone?: string | null;
};
interface UserStats {
  total: number; vip: number; expired: number; expiringSoon: number;
  nonVip: number; newUsers: number; blocked: number;
  perCourse: { playlistId: number; title: string; count: number }[];
}
type StatusFilter = "all"|"vip"|"nonvip"|"expired"|"expiring"|"active"|"blocked"|"new";
type SortField = "createdAt"|"username"|"lastVisitAt"|"subscriptionExpiresAt";
const PAGE_SIZE = 25;

function normalizeWA(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) return "213" + d.slice(1);
  if (!d.startsWith("213") && d.length <= 10) return "213" + d;
  return d;
}
function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d / 60000);
  if (m < 1) return "maintenant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const dy = Math.floor(h / 24);
  if (dy < 30) return `${dy} j`;
  return `${Math.floor(dy / 30)} mois`;
}
function isActiveVip(u: ExtendedAdminUser) {
  return u.accountType === "vip" && (!u.subscriptionExpiresAt || new Date(u.subscriptionExpiresAt) > new Date());
}
function isExpiredVip(u: ExtendedAdminUser) {
  return u.accountType === "vip" && !!u.subscriptionExpiresAt && new Date(u.subscriptionExpiresAt) < new Date();
}
function isExpiringSoon(u: ExtendedAdminUser) {
  if (!u.subscriptionExpiresAt) return false;
  const exp = new Date(u.subscriptionExpiresAt), now = new Date();
  return exp >= now && exp <= new Date(now.getTime() + 7 * 86400000);
}

/* ── Badges ───────────────────────────────────────────────────────────── */
function AccountBadge({ user }: { user: ExtendedAdminUser }) {
  if (isActiveVip(user))  return <span className="ad-badge ad-badge-vip"><Crown size={9} />VIP</span>;
  if (isExpiredVip(user)) return <span className="ad-badge ad-badge-expired">Expiré</span>;
  return <span className="ad-badge ad-badge-normal">Standard</span>;
}
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive
    ? <span className="ad-badge ad-badge-active">Actif</span>
    : <span className="ad-badge ad-badge-blocked">Bloqué</span>;
}

/* ── Sort icon ────────────────────────────────────────────────────────── */
function SortIco({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc"|"desc" }) {
  if (sortBy !== field) return <ChevronsUpDown size={11} style={{ opacity: 0.3 }} />;
  return sortDir === "asc" ? <ChevronUp size={11} color="#F97316" /> : <ChevronDown size={11} color="#F97316" />;
}

const BULK = [
  { v: "grant_vip",           l: "Accorder VIP (365 j)" },
  { v: "revoke_vip",          l: "Retirer VIP" },
  { v: "extend_subscription", l: "Prolonger de 30 j" },
  { v: "grant_course",        l: "Accorder un cours…" },
  { v: "revoke_course",       l: "Retirer un cours…" },
  { v: "reset_ip",            l: "Réinitialiser IP" },
  { v: "block",               l: "Bloquer" },
  { v: "unblock",             l: "Débloquer" },
];
const STATUS_LABELS: Record<StatusFilter, string> = {
  all:"Tous", vip:"VIP", expired:"Expiré", expiring:"Bientôt", nonvip:"Standard", active:"Actif", blocked:"Bloqué", new:"Nouveau",
};

/* ══════════════════════════════════════════════════════════════════════ */
export function AdminUsers() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const { data: rawUsers, refetch, isFetching } = useGetAdminUsers(undefined, { request: getAdminAuthHeaders() });
  const users = rawUsers as ExtendedAdminUser[] | undefined;
  const { data: notifStats }   = useGetAdminNotificationStats({ request: getAdminAuthHeaders() });
  const { data: allPlaylists } = useGetAdminPlaylists({ request: getAdminAuthHeaders() });
  const updateMut   = useUpdateAdminUser({ request: getAdminAuthHeaders() });
  const resetIpMut  = useResetUserIp({ request: getAdminAuthHeaders() });
  const deleteMut   = useDeleteAdminUser({ request: getAdminAuthHeaders() });
  const testPushMut = useSendUserTestPush({ request: getAdminAuthHeaders() });

  const [stats, setStats] = useState<UserStats | null>(null);
  const fetchStats = useCallback(() => {
    const h = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
    fetch("/api/admin/users/stats", { headers: h }).then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {});
  }, [getAdminAuthHeaders]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const [search, setSearch]           = useState("");
  const [courseFilter, setCourseFilter] = useState<number|"all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [notifFilter, setNotifFilter]   = useState<NotifFilter>("all");
  const [sortBy, setSortBy]   = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page, setPage]       = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [editingUser, setEditingUser] = useState<ExtendedAdminUser | null>(null);
  const [formData, setFormData]       = useState<UpdateUserInput>({});
  const [userCourseIds, setUserCourseIds]   = useState<number[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [loadingId, setLoadingId]   = useState<number | null>(null);
  const [testingId, setTestingId]   = useState<number | null>(null);
  const [resetPwUser, setResetPwUser]   = useState<ExtendedAdminUser | null>(null);
  const [resetPwForm, setResetPwForm]   = useState({ newPassword: "", confirmPassword: "" });
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError]     = useState("");
  const [resetPwSuccess, setResetPwSuccess] = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [resetIpId, setResetIpId]   = useState<number | null>(null);
  const [detailId, setDetailId]     = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkPl, setBulkPl]         = useState<number|"">("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const monthAgo = new Date(Date.now() - 30 * 86400000);

  const filtered = useMemo(() => {
    if (!users) return [];
    let r = users;
    if (courseFilter !== "all") r = r.filter(u => u.courses.some(c => c.playlistId === courseFilter));
    if (statusFilter === "vip")      r = r.filter(u => isActiveVip(u));
    else if (statusFilter === "expired")  r = r.filter(u => isExpiredVip(u));
    else if (statusFilter === "expiring") r = r.filter(u => isExpiringSoon(u));
    else if (statusFilter === "nonvip")   r = r.filter(u => u.accountType !== "vip");
    else if (statusFilter === "active")   r = r.filter(u => u.isActive);
    else if (statusFilter === "blocked")  r = r.filter(u => !u.isActive);
    else if (statusFilter === "new")      r = r.filter(u => new Date(u.createdAt) >= monthAgo);
    if (notifFilter === "enabled")  r = r.filter(u => u.pushEnabled);
    else if (notifFilter === "disabled") r = r.filter(u => !u.pushEnabled);
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(u => u.username.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) ||
        (u.phone?.includes(s)) || (u.fullName?.toLowerCase().includes(s)) || String(u.id).includes(s));
    }
    return [...r].sort((a, b) => {
      let c = 0;
      if (sortBy === "username")    c = a.username.localeCompare(b.username, "fr");
      else if (sortBy === "createdAt") c = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === "lastVisitAt") c = (a.lastVisitAt ?? "").localeCompare(b.lastVisitAt ?? "");
      else if (sortBy === "subscriptionExpiresAt") c = (a.subscriptionExpiresAt ?? "").localeCompare(b.subscriptionExpiresAt ?? "");
      return sortDir === "asc" ? c : -c;
    });
  }, [users, courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [courseFilter, statusFilter, notifFilter, search, sortBy, sortDir]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, courseFilter, statusFilter]);

  const toggleSort = (f: SortField) => {
    if (sortBy === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(f); setSortDir("desc"); }
  };
  const toggleSel = (id: number) =>
    setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selAll = () => setSelectedIds(p => { const n = new Set(p); paginated.forEach(u => n.add(u.id)); return n; });
  const deselAll = () => setSelectedIds(new Set());
  const allSel = paginated.length > 0 && paginated.every(u => selectedIds.has(u.id));

  const handleBulk = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const needsPl = bulkAction === "grant_course" || bulkAction === "revoke_course";
    if (needsPl && !bulkPl) { toast({ title: "Sélectionnez d'abord un cours", variant: "destructive" }); return; }
    setBulkLoading(true);
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string> | undefined;
      const body: Record<string, unknown> = { action: bulkAction, userIds: [...selectedIds] };
      if (needsPl) body.playlistId = Number(bulkPl);
      if (bulkAction === "extend_subscription") body.days = 30;
      if (bulkAction === "grant_vip") body.days = 365;
      const res = await fetch("/api/admin/users/bulk-action", {
        method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json() as { affected?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Échec");
      toast({ title: `Action appliquée à ${data.affected ?? selectedIds.size} utilisateur(s)` });
      deselAll(); setBulkAction(""); refetch(); fetchStats();
    } catch (e) { toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" }); }
    finally { setBulkLoading(false); }
  };

  const handleExport = () => {
    const rows = selectedIds.size > 0 ? filtered.filter(u => selectedIds.has(u.id)) : filtered;
    const csv = [
      ["ID","Utilisateur","E-mail","Téléphone","Compte","Abonnement","Expiration","Statut","Cours","Dernière visite","Inscription"].join(","),
      ...rows.map(u => [u.id,u.username,u.email,u.phone??"",u.accountType,u.subscriptionType,u.subscriptionExpiresAt??"",
        u.isActive?"Actif":"Bloqué",u.courses.map(c=>c.title).join("|"),u.lastVisitAt??"",u.createdAt]
        .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")),
    ].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" })), download: "users.csv" });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const handleTestPush = async (user: ExtendedAdminUser) => {
    setTestingId(user.id);
    try {
      const r = await testPushMut.mutateAsync({ id: user.id });
      if (r.attempted === 0) toast({ title: "Aucun abonnement aux notifications", variant: "destructive" });
      else if (r.success > 0) toast({ title: `${r.success}/${r.attempted} appareil(s) ✓` });
      else toast({ title: "Échec de l'envoi", variant: "destructive" });
      refetch();
    } catch { toast({ title: "Envoi impossible", variant: "destructive" }); }
    finally { setTestingId(null); }
  };

  const handleEdit = async (user: ExtendedAdminUser) => {
    setEditingUser(user);
    setFormData({ accountType: user.accountType, subscriptionType: user.subscriptionType, isActive: user.isActive, phone: (user as ExtendedAdminUser & { phone?: string }).phone ?? undefined });
    setCoursesLoading(true);
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string>;
      const res = await fetch(`/api/admin/users/${user.id}/courses`, { headers: h });
      if (res.ok) setUserCourseIds(await res.json() as number[]);
    } catch { /* ignore */ } finally { setCoursesLoading(false); }
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string>;
      await fetch(`/api/admin/users/${editingUser.id}/courses`, {
        method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(userCourseIds),
      });
    } catch { /* ignore */ }
    updateMut.mutate({ id: editingUser.id, data: formData }, {
      onSuccess: () => { toast({ title: "Enregistré" }); setEditingUser(null); refetch(); fetchStats(); },
    });
  };

  const confirmResetIp = () => {
    if (!resetIpId) return;
    resetIpMut.mutate({ id: resetIpId }, {
      onSuccess: () => { toast({ title: "IP réinitialisée" }); refetch(); setResetIpId(null); },
      onError: () => { toast({ title: "Erreur", variant: "destructive" }); setResetIpId(null); },
    });
  };

  const handleBlock = async (user: ExtendedAdminUser) => {
    if (!confirm("Êtes-vous sûr ?")) return;
    setLoadingId(user.id);
    try {
      const h = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`/api/admin/users/${user.id}/block`, { method: "POST", headers: h as HeadersInit });
      if (!res.ok) throw new Error();
      toast({ title: user.isActive ? "Utilisateur bloqué" : "Utilisateur débloqué" });
      refetch(); fetchStats();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    finally { setLoadingId(null); }
  };

  const handleResetPw = async () => {
    setResetPwError(""); setResetPwSuccess("");
    if (resetPwForm.newPassword !== resetPwForm.confirmPassword) { setResetPwError("Les mots de passe ne correspondent pas"); return; }
    if (resetPwForm.newPassword.length < 6) { setResetPwError("6 caractères minimum"); return; }
    setResetPwLoading(true);
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${resetPwUser!.id}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPwForm.newPassword }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) throw new Error(data.message || "Erreur");
      setResetPwSuccess("Mot de passe modifié avec succès"); setResetPwForm({ newPassword: "", confirmPassword: "" });
    } catch (err) { setResetPwError(err instanceof Error ? err.message : "Erreur"); }
    finally { setResetPwLoading(false); }
  };

  const handleDelete = (user: ExtendedAdminUser) => {
    if (!confirm(`Supprimer ${user.username} définitivement ?`)) return;
    setLoadingId(user.id);
    deleteMut.mutate({ id: user.id }, {
      onSuccess: () => { toast({ title: "Utilisateur supprimé" }); refetch(); fetchStats(); setLoadingId(null); },
      onError: () => { toast({ title: "Erreur", variant: "destructive" }); setLoadingId(null); },
    });
  };

  const courseStats = stats?.perCourse ?? [];

  /* ── STAT CARDS ──────────────────────────────────────────────────── */
  const statCards = [
    { label: "Total",             v: stats?.total       ?? "—", on: () => { setStatusFilter("all"); setCourseFilter("all"); } },
    { label: "VIP actifs",        v: stats?.vip          ?? "—", on: () => setStatusFilter("vip") },
    { label: "Non-VIP",           v: stats?.nonVip       ?? "—", on: () => setStatusFilter("nonvip") },
    { label: "Expirés",           v: stats?.expired      ?? "—", on: () => setStatusFilter("expired") },
    { label: "Expirent bientôt",  v: stats?.expiringSoon ?? "—", on: () => setStatusFilter("expiring") },
    { label: "Nouveaux (30 j)",   v: stats?.newUsers     ?? "—", on: () => setStatusFilter("new") },
    { label: "Bloqués",           v: stats?.blocked      ?? "—", on: () => setStatusFilter("blocked") },
    { label: "Notifs actives",    v: notifStats?.enabled ?? "—", on: () => setNotifFilter("enabled") },
  ];

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <TooltipProvider delayDuration={120}>
      <div dir="ltr" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* HEADER */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", lineHeight: 1.2, letterSpacing: "-0.02em" }}>Gestion des utilisateurs</h1>
            <p style={{ fontSize: 14, color: "#667085", marginTop: 4 }}>
              {filtered.length} utilisateur{filtered.length > 1 ? "s" : ""}{filtered.length !== (users?.length ?? 0) ? ` sur ${users?.length ?? 0}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { refetch(); fetchStats(); }} disabled={isFetching} className="ad-btn-sm">
              <RefreshCcw size={13} className={isFetching ? "animate-spin" : ""} />Actualiser
            </button>
            <button type="button" onClick={handleExport} className="ad-btn-sm">
              <Download size={13} />Exporter CSV
            </button>
          </div>
        </div>

        {/* STAT CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
          {statCards.map(c => (
            <button key={c.label} type="button" onClick={c.on} className="ad-stat">
              <div className="ad-stat-value">{c.v}</div>
              <div className="ad-stat-label">{c.label}</div>
            </button>
          ))}
        </div>

        {/* COURSE TABS */}
        {allPlaylists && allPlaylists.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4, marginRight: 2 }}>
              <BookOpen size={12} />Cours :
            </span>
            <button type="button" onClick={() => setCourseFilter("all")} className={`ad-course-tab${courseFilter === "all" ? " active" : ""}`}>
              Tous
              <CountPill count={users?.length ?? 0} active={courseFilter === "all"} />
            </button>
            {allPlaylists.map(pl => {
              const sc = courseStats.find(s => s.playlistId === pl.id);
              const act = courseFilter === pl.id;
              return (
                <button key={pl.id} type="button" onClick={() => setCourseFilter(pl.id)} className={`ad-course-tab${act ? " active" : ""}`}>
                  {pl.title}
                  {sc && <CountPill count={sc.count} active={act} />}
                </button>
              );
            })}
          </div>
        )}

        {/* FILTER BAR */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#98A2B3", pointerEvents: "none" }} />
            <input type="text" placeholder="Rechercher par nom, e-mail ou téléphone…" value={search}
              onChange={e => setSearch(e.target.value)} className="ad-input" style={{ paddingLeft: 32 }} />
          </div>
          <ChipGroup>
            {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(v => (
              <button key={v} type="button" onClick={() => setStatusFilter(v)} className={`ad-chip ${statusFilter === v ? "ad-chip-on" : "ad-chip-off"}`}>
                {STATUS_LABELS[v]}
              </button>
            ))}
          </ChipGroup>
          <ChipGroup>
            {(["all","enabled","disabled"] as NotifFilter[]).map(v => (
              <button key={v} type="button" onClick={() => setNotifFilter(v)} className={`ad-chip ${notifFilter === v ? "ad-chip-on" : "ad-chip-off"}`}>
                {v === "enabled" && <BellRing size={11} />}
                {v === "disabled" && <BellOff size={11} />}
                {v === "all" ? "Toutes" : v === "enabled" ? "Notifs" : "Sans"}
              </button>
            ))}
          </ChipGroup>
        </div>

        {/* BULK BAR */}
        {selectedIds.size > 0 && (
          <div className="ad-bulk-bar">
            <span style={{ fontSize: 13, fontWeight: 600, color: "#C2410C" }}>{selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}</span>
            <button type="button" onClick={deselAll} style={{ fontSize: 11, color: "#98A2B3", display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer" }}>
              <X size={11} />Effacer
            </button>
            <div style={{ width: 1, height: 16, background: "#FED7AA" }} />
            <select className="ad-select" value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
              <option value="">Choisir une action…</option>
              {BULK.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
            {(bulkAction === "grant_course" || bulkAction === "revoke_course") && (
              <select className="ad-select" value={bulkPl} onChange={e => setBulkPl(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Cours…</option>
                {allPlaylists?.map(pl => <option key={pl.id} value={pl.id}>{pl.title}</option>)}
              </select>
            )}
            <button type="button" onClick={handleBulk} disabled={!bulkAction || bulkLoading} className="ad-btn-primary">
              {bulkLoading && <Loader2 size={12} className="animate-spin" />}Appliquer
            </button>
          </div>
        )}

        {/* ── MOBILE CARDS ────────────────────────────────────────── */}
        <div className="md:hidden" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {paginated.map(user => {
            const sel = selectedIds.has(user.id);
            return (
              <div key={user.id} className="ad-card" style={{
                padding: "18px 18px", opacity: user.isActive ? 1 : 0.65,
                boxShadow: sel ? "inset 3px 0 0 #F97316, 0 1px 4px rgba(15,23,42,0.06)" : undefined,
                background: sel ? "#FFF7ED" : "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Chk checked={sel} onChange={() => toggleSel(user.id)} />
                    <div>
                      <button type="button" onClick={() => setDetailId(user.id)} style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                        {user.username}
                      </button>
                      <div style={{ fontSize: 13, color: "#64748B" }}>{user.email}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <AccountBadge user={user} /><StatusBadge isActive={user.isActive} />
                  </div>
                </div>
                {user.courses.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                    {user.courses.map(c => <span key={c.playlistId} className="ad-course-tag">{c.title}</span>)}
                  </div>
                )}
                <div style={{ fontSize: 12.5, color: "#94A3B8", marginBottom: 10 }}>
                  {user.lastVisitAt && <span>Dernière visite : {timeAgo(user.lastVisitAt)} · </span>}
                  <span>Inscrit : {formatDate(user.createdAt)}</span>
                </div>
                <div style={{ display: "flex", gap: 2, paddingTop: 10, borderTop: "1px solid #EEF2F7" }}>
                  <IBtn tip="Détails"       onClick={() => setDetailId(user.id)}><Eye size={14} /></IBtn>
                  <IBtn tip="Modifier"      onClick={() => handleEdit(user)}><Edit size={14} /></IBtn>
                  <IBtn tip="Mot de passe"  onClick={() => { setResetPwUser(user); setResetPwError(""); setResetPwSuccess(""); setShowPw(false); setShowPwConfirm(false); setResetPwForm({ newPassword: "", confirmPassword: "" }); }}><KeyRound size={14} /></IBtn>
                  <IBtn tip={user.isActive?"Bloquer":"Débloquer"} onClick={() => handleBlock(user)} disabled={loadingId===user.id}>
                    {user.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                  </IBtn>
                  <IBtn tip="Supprimer" danger onClick={() => handleDelete(user)} disabled={loadingId===user.id}><Trash2 size={14} /></IBtn>
                </div>
              </div>
            );
          })}
          {paginated.length === 0 && <EmptyState />}
        </div>

        {/* ── DESKTOP TABLE ───────────────────────────────────────── */}
        <div className="hidden md:block ad-table-wrap">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr>
                  <th className="ad-th" style={{ width: 44 }}>
                    <Chk checked={allSel} onChange={allSel ? deselAll : selAll} />
                  </th>
                  <TH onClick={() => toggleSort("username")} sort={<SortIco field="username" sortBy={sortBy} sortDir={sortDir} />}>Utilisateur</TH>
                  <TH>Téléphone</TH>
                  <TH>Cours</TH>
                  <TH>Compte</TH>
                  <TH onClick={() => toggleSort("subscriptionExpiresAt")} sort={<SortIco field="subscriptionExpiresAt" sortBy={sortBy} sortDir={sortDir} />}>Abonnement</TH>
                  <TH onClick={() => toggleSort("lastVisitAt")} sort={<SortIco field="lastVisitAt" sortBy={sortBy} sortDir={sortDir} />}>Dernière visite</TH>
                  <TH onClick={() => toggleSort("createdAt")} sort={<SortIco field="createdAt" sortBy={sortBy} sortDir={sortDir} />}>Inscription</TH>
                  <TH>Appareils</TH>
                  <TH>IP</TH>
                  <TH>Statut</TH>
                  <th className="ad-th" style={{ position: "sticky", right: 0, zIndex: 2, borderLeft: "1px solid #E5EAF2" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((user, idx) => {
                  const expired  = isExpiredVip(user);
                  const expiring = isExpiringSoon(user);
                  const sel = selectedIds.has(user.id);
                  const evenBg = "#ffffff", oddBg = "#FAFBFC", selBg = "#EFF6FF";
                  const rowBg = sel ? selBg : idx % 2 === 0 ? evenBg : oddBg;
                  return (
                    <tr key={user.id} className={`ad-tr ${sel ? "ad-tr-selected" : idx%2===0 ? "ad-tr-even" : "ad-tr-odd"}`}
                      style={{ opacity: user.isActive ? 1 : 0.6 }}>
                      <td className="ad-td"><Chk checked={sel} onChange={() => toggleSel(user.id)} /></td>
                      <td className="ad-td">
                        <button type="button" onClick={() => setDetailId(user.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", whiteSpace: "nowrap" }}>{user.username}</div>
                          <div style={{ fontSize: 12.5, color: "#94A3B8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                          {user.fullName && <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{user.fullName}</div>}
                        </button>
                      </td>
                      <td className="ad-td">
                        {user.phone ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11.5, fontFamily: "monospace", color: "#344054", whiteSpace: "nowrap" }} dir="ltr">{user.phone}</span>
                            <a href={`https://wa.me/${normalizeWA(user.phone)}`} target="_blank" rel="noopener noreferrer"
                              style={{ width: 22, height: 22, borderRadius: "50%", background: "#EFFAF3", border: "1px solid #BFE5CD", display: "flex", alignItems: "center", justifyContent: "center", color: "#157347", flexShrink: 0, textDecoration: "none" }}>
                              <MessageCircle size={11} />
                            </a>
                          </div>
                        ) : <Dash />}
                      </td>
                      <td className="ad-td">
                        {user.courses.length === 0 ? <Dash /> : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {user.courses.map(c => <span key={c.playlistId} className="ad-course-tag">{c.title}</span>)}
                          </div>
                        )}
                      </td>
                      <td className="ad-td"><AccountBadge user={user} /></td>
                      <td className="ad-td">
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: "#667085" }}>{user.subscriptionType}</span>
                          {user.subscriptionExpiresAt && (
                            <div style={{ marginTop: 2, fontWeight: 600, fontSize: 11, color: expired ? "#B42318" : expiring ? "#B45309" : "#157347" }}>
                              {formatDate(user.subscriptionExpiresAt)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="ad-td">
                        {user.lastVisitAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#667085", cursor: "default", whiteSpace: "nowrap" }}>
                                <Clock size={12} color="#98A2B3" />{timeAgo(user.lastVisitAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent style={{ fontSize: 11 }}>{formatDate(user.lastVisitAt)}</TooltipContent>
                          </Tooltip>
                        ) : <Dash />}
                      </td>
                      <td className="ad-td" style={{ fontSize: 12, color: "#667085", whiteSpace: "nowrap" }}>{formatDate(user.createdAt)}</td>
                      <td className="ad-td">
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#667085" }}>
                          {user.deviceCount > 0 ? user.deviceCount : "—"}
                          {user.pushState === "enabled" && <BellRing size={11} color="#157347" />}
                          {user.pushState === "denied"  && <BellOff  size={11} color="#B45309" />}
                          {user.pushState === "broken"  && <BellOff  size={11} color="#B42318" />}
                        </span>
                      </td>
                      <td className="ad-td">
                        {user.accountType === "vip" ? (
                          <div>
                            <span className={`ad-badge ${user.ipCount >= 2 ? "ad-badge-expired" : "ad-badge-normal"}`} style={{ fontFamily: "monospace", fontSize: 10 }}>
                              {user.ipCount}/2
                            </span>
                            {user.ipAddress && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#94A3B8", marginTop: 2 }}>{user.ipAddress}</div>}
                          </div>
                        ) : <Dash />}
                      </td>
                      <td className="ad-td"><StatusBadge isActive={user.isActive} /></td>
                      <td className="ad-td" style={{ position: "sticky", right: 0, background: rowBg, borderLeft: "1px solid #E5EAF2", zIndex: 1 }}>
                        <div style={{ display: "flex", gap: 1 }}>
                          <IBtn tip="Détails"           onClick={() => setDetailId(user.id)}><Eye size={13} /></IBtn>
                          <IBtn tip="Modifier"          onClick={() => handleEdit(user)}><Edit size={13} /></IBtn>
                          <IBtn tip="Mot de passe"      onClick={() => { setResetPwUser(user); setResetPwError(""); setResetPwSuccess(""); setShowPw(false); setShowPwConfirm(false); setResetPwForm({ newPassword: "", confirmPassword: "" }); }}><KeyRound size={13} /></IBtn>
                          <IBtn tip="Réinitialiser IP"  onClick={() => setResetIpId(user.id)} disabled={user.ipCount === 0}><RefreshCw size={13} /></IBtn>
                          <IBtn tip="Notification test" onClick={() => handleTestPush(user)} disabled={testingId === user.id}>
                            {testingId === user.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          </IBtn>
                          <IBtn tip={user.isActive?"Bloquer":"Débloquer"} onClick={() => handleBlock(user)} disabled={loadingId===user.id}>
                            {user.isActive ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                          </IBtn>
                          <IBtn tip="Supprimer" danger onClick={() => handleDelete(user)} disabled={loadingId===user.id}><Trash2 size={13} /></IBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={12} style={{ padding: "60px 0", textAlign: "center" }}><EmptyState /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #EEF2F7", fontSize: 12, color: "#667085" }}>
              <span>Page {page} sur {totalPages} — {filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <PBtn disabled={page===1} onClick={() => setPage(1)}>«</PBtn>
                <PBtn disabled={page===1} onClick={() => setPage(p => p-1)}>‹</PBtn>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const st = Math.max(1, Math.min(page-2, totalPages-4)), pg = st+i;
                  return pg <= totalPages ? <PBtn key={pg} active={pg===page} onClick={() => setPage(pg)}>{pg}</PBtn> : null;
                })}
                <PBtn disabled={page===totalPages} onClick={() => setPage(p => p+1)}>›</PBtn>
                <PBtn disabled={page===totalPages} onClick={() => setPage(totalPages)}>»</PBtn>
              </div>
            </div>
          )}
        </div>

        {/* ── MODALS ──────────────────────────────────────────────── */}
        <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} getAdminAuthHeaders={getAdminAuthHeaders} />

        {/* Reset Password */}
        <Dialog open={!!resetPwUser} onOpenChange={o => { if (!o) setResetPwUser(null); }}>
          <DialogContent dir="ltr">
            <DialogHeader><DialogTitle style={{ fontSize: 15, color: "#1F2937", textAlign: "left" }}>Mot de passe — {resetPwUser?.username}</DialogTitle></DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              {[
                { label: "Nouveau mot de passe",     key: "newPassword" as const, show: showPw, toggle: () => setShowPw(v=>!v) },
                { label: "Confirmer le mot de passe", key: "confirmPassword" as const, show: showPwConfirm, toggle: () => setShowPwConfirm(v=>!v) },
              ].map(f => (
                <div key={f.key}>
                  <Label style={{ fontSize: 12.5, color: "#344054", marginBottom: 5, display: "block" }}>{f.label}</Label>
                  <div style={{ position: "relative" }}>
                    <input type={f.show?"text":"password"} className="ad-input" placeholder="6 caractères minimum"
                      value={resetPwForm[f.key]} onChange={e => setResetPwForm({ ...resetPwForm, [f.key]: e.target.value })}
                      style={{ paddingRight: 36 }} />
                    <button type="button" onClick={f.toggle} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#98A2B3", background: "none", border: "none", cursor: "pointer" }}>
                      {f.show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ))}
              {resetPwError   && <Msg type="err">{resetPwError}</Msg>}
              {resetPwSuccess && <Msg type="ok">{resetPwSuccess}</Msg>}
              <button type="button" onClick={handleResetPw} disabled={resetPwLoading} className="ad-btn-primary" style={{ width: "100%", justifyContent: "center", height: 38 }}>
                {resetPwLoading ? "Enregistrement…" : "Changer le mot de passe"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit User */}
        <Dialog open={!!editingUser} onOpenChange={o => !o && setEditingUser(null)}>
          <DialogContent dir="ltr">
            <DialogHeader><DialogTitle style={{ fontSize: 15, color: "#1F2937", textAlign: "left" }}>Modifier — {editingUser?.username}</DialogTitle></DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              {[
                { label: "Type de compte", key: "accountType" as const, opts: [{ v:"normal",l:"Standard" }, { v:"vip",l:"VIP" }] },
                { label: "Plan d'abonnement", key: "subscriptionType" as const, opts: [{ v:"demo",l:"Démo" },{ v:"monthly",l:"Mensuel" },{ v:"annual",l:"Annuel" },{ v:"lifetime",l:"À vie" }] },
                { label: "Statut du compte", key: "isActive" as const, opts: [{ v:"true",l:"Actif" },{ v:"false",l:"Bloqué" }] },
              ].map(f => (
                <div key={f.key}>
                  <Label style={{ fontSize: 12.5, color: "#344054", marginBottom: 5, display: "block" }}>{f.label}</Label>
                  <select className="ad-select" style={{ width: "100%", height: 38 }}
                    value={f.key==="isActive" ? String(formData[f.key]) : String(formData[f.key]??"")}
                    onChange={e => setFormData({ ...formData, [f.key]: f.key==="isActive" ? e.target.value==="true" : e.target.value as "vip"|"normal"|"demo"|"monthly"|"annual"|"lifetime" })}>
                    {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <Label style={{ fontSize: 12.5, color: "#344054", marginBottom: 5, display: "block" }}>Numéro de téléphone</Label>
                <PhoneNumberInput value={formData.phone ?? undefined} onChange={v => setFormData({ ...formData, phone: v || undefined })} placeholder="5X XX XX XX XX" />
              </div>
              <div>
                <Label style={{ fontSize: 12.5, color: "#344054", marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
                  <GraduationCap size={13} />Cours accordés
                </Label>
                {coursesLoading ? (
                  <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={16} className="animate-spin" style={{ color: "#98A2B3" }} /></div>
                ) : !allPlaylists?.length ? (
                  <p style={{ fontSize: 12, color: "#98A2B3" }}>Aucun cours disponible</p>
                ) : (
                  <div style={{ border: "1px solid #E5EAF2", borderRadius: 10, overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
                    {allPlaylists.map((pl, i) => {
                      const s = userCourseIds.includes(pl.id);
                      return (
                        <button key={pl.id} type="button" onClick={() => setUserCourseIds(p => s ? p.filter(x=>x!==pl.id) : [...p, pl.id])}
                          style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background: s ? "#FFF7ED" : i%2===0 ? "#fff" : "#FAFBFC", border:"none", borderBottom: i < allPlaylists.length-1 ? "1px solid #F1F5F9":"none", cursor:"pointer", textAlign:"left" }}>
                          <span style={{ width:17, height:17, borderRadius:5, border: s?"none":"1.5px solid #CBD5E1", background: s?"#F97316":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {s && <Check size={10} color="#fff" />}
                          </span>
                          <span style={{ fontSize:13.5, color:"#344054" }}>{pl.title||`Cours #${pl.id}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleSave} disabled={updateMut.isPending} className="ad-btn-primary" style={{ width:"100%", justifyContent:"center", height:38 }}>
                {updateMut.isPending ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset IP confirm */}
        <Dialog open={resetIpId !== null} onOpenChange={o => { if (!o) setResetIpId(null); }}>
          <DialogContent dir="ltr">
            <DialogHeader><DialogTitle style={{ fontSize: 15, color: "#1F2937", textAlign: "left" }}>Réinitialiser l'adresse IP</DialogTitle></DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
              <p style={{ fontSize: 13, color: "#475467" }}>L'utilisateur pourra se connecter depuis un nouvel appareil.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={confirmResetIp} disabled={resetIpMut.isPending} className="ad-btn-primary" style={{ flex:1, justifyContent:"center", height:38 }}>
                  {resetIpMut.isPending ? "En cours…" : "Confirmer"}
                </button>
                <button type="button" onClick={() => setResetIpId(null)} className="ad-btn-sm" style={{ flex:1, justifyContent:"center", height:38 }}>Annuler</button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/* ── Micro-components ──────────────────────────────────────────────────── */

function TH({ children, onClick, sort }: { children: React.ReactNode; onClick?: () => void; sort?: React.ReactNode }) {
  return (
    <th className={`ad-th${onClick ? " sortable" : ""}`} onClick={onClick} style={{ minWidth: 80 }}>
      {sort ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>{children}{sort}</span> : children}
    </th>
  );
}

function IBtn({ tip, onClick, disabled, danger, children }: { tip: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} disabled={disabled} className={`ad-ibtn${danger ? " danger" : ""}`}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent style={{ fontSize: 11 }}>{tip}</TooltipContent>
    </Tooltip>
  );
}

function Chk({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} style={{ background: "none", border: "none", cursor: "pointer", color: checked ? "#F97316" : "#CBD5E1", display: "flex" }}>
      {checked ? <CheckSquare size={16} /> : <Square size={16} />}
    </button>
  );
}

function PBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`ad-pag-btn${active ? " active" : ""}`}>
      {children}
    </button>
  );
}

function CountPill({ count, active }: { count: number; active: boolean }) {
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: active ? "rgba(255,255,255,0.25)" : "#F2F4F7", color: active ? "#fff" : "#667085", fontWeight: 600 }}>
      {count}
    </span>
  );
}

function ChipGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", background: "#F2F4F7", borderRadius: 9, padding: 3, gap: 2, flexWrap: "wrap" }}>{children}</div>;
}

function Dash() { return <span style={{ color: "#D8DFEA", fontSize: 14 }}>—</span>; }

function Msg({ children, type }: { children: React.ReactNode; type: "err"|"ok" }) {
  const st = type === "err"
    ? { color: "#B42318", background: "#FDF1F1", border: "1px solid #F2CBCB" }
    : { color: "#157347", background: "#EFFAF3", border: "1px solid #BFE5CD" };
  return <p style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, ...st }}>{children}</p>;
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#94A3B8" }}>
      <Filter size={28} style={{ opacity: 0.3 }} />
      <p style={{ fontSize: 13 }}>Aucun utilisateur trouvé</p>
    </div>
  );
}
