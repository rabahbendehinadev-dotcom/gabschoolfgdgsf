import { useState } from "react";
import {
  useGetAdminSubscriptionPlans,
  useGetAdminPlaylists,
} from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import {
  Edit, CreditCard, Plus, Trash2, Loader2, EyeOff, Eye,
  BookOpen, Check, ChevronDown, ChevronUp, Crown, RefreshCcw, AlertCircle,
} from "lucide-react";

const API_BASE = "";

type PlanWithCount = {
  id: number;
  type: string;
  price: string;
  description: string;
  durationDays: number | null;
  isHidden: boolean;
  courseCount?: number;
};

const PLAN_LABELS: Record<string, string> = {
  demo: "Essai", annual: "Annuel", lifetime: "À vie", monthly: "Mensuel",
};

const PLAN_COLORS: Record<string, string> = {
  demo: "#94A3B8", monthly: "#F97316", annual: "#F97316", lifetime: "#EA6C10",
};

export function AdminPlans() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const reqOpts = { request: getAdminAuthHeaders() };
  const h = () => (getAdminAuthHeaders()?.headers ?? {}) as Record<string, string>;

  const {
    data: rawPlans,
    refetch,
    isFetching,
    isError,
    error,
  } = useGetAdminSubscriptionPlans(reqOpts);
  const plans = rawPlans as PlanWithCount[] | undefined;

  const { data: allPlaylists } = useGetAdminPlaylists(reqOpts);

  /* ── local state ─────────────────────────────────────── */
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [savingCourses, setSavingCourses] = useState(false);

  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [planCourses, setPlanCourses] = useState<Record<number, number[]>>({});
  const [loadingCoursesFor, setLoadingCoursesFor] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    type: "", price: "", description: "", durationDays: null as number | null, isHidden: false,
  });
  const [formCourseIds, setFormCourseIds] = useState<number[]>([]);
  const [formCoursesLoading, setFormCoursesLoading] = useState(false);

  /* ── helpers ─────────────────────────────────────────── */
  const fetchPlanCourses = async (planId: number): Promise<number[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/subscription-plans/${planId}/courses`, { headers: h() });
      if (res.ok) return (await res.json()) as number[];
    } catch { /* ignore */ }
    return [];
  };

  const handleExpandCourses = async (planId: number) => {
    if (expandedPlan === planId) { setExpandedPlan(null); return; }
    setExpandedPlan(planId);
    if (!(planId in planCourses)) {
      setLoadingCoursesFor(planId);
      const ids = await fetchPlanCourses(planId);
      setPlanCourses(prev => ({ ...prev, [planId]: ids }));
      setLoadingCoursesFor(null);
    }
  };

  const handleOpen = async (plan: PlanWithCount) => {
    setEditingId(plan.id);
    setFormData({
      type: plan.type, price: plan.price, description: plan.description,
      durationDays: plan.durationDays ?? null, isHidden: plan.isHidden ?? false,
    });
    setFormCourseIds([]);
    setIsOpen(true);
    setFormCoursesLoading(true);
    const ids = await fetchPlanCourses(plan.id);
    setFormCourseIds(ids);
    setFormCoursesLoading(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ type: "", price: "", description: "", durationDays: null, isHidden: false });
    setFormCourseIds([]);
    setIsOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId !== null) {
        const r = await fetch(`${API_BASE}/api/admin/subscription-plans/${editingId}`, {
          method: "PATCH",
          headers: { ...h(), "Content-Type": "application/json" },
          body: JSON.stringify({ price: formData.price, description: formData.description, durationDays: formData.durationDays, isHidden: formData.isHidden }),
        });
        if (!r.ok) throw new Error("Échec de la mise à jour");
        await fetch(`${API_BASE}/api/admin/subscription-plans/${editingId}/courses`, {
          method: "PUT",
          headers: { ...h(), "Content-Type": "application/json" },
          body: JSON.stringify(formCourseIds),
        });
        setPlanCourses(prev => ({ ...prev, [editingId]: formCourseIds }));
        toast({ title: "Plan mis à jour" });
      } else {
        const r = await fetch(`${API_BASE}/api/admin/subscription-plans`, {
          method: "POST",
          headers: { ...h(), "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!r.ok) throw new Error("Échec de la création");
        const created = await r.json() as { id: number };
        if (formCourseIds.length > 0) {
          await fetch(`${API_BASE}/api/admin/subscription-plans/${created.id}/courses`, {
            method: "PUT",
            headers: { ...h(), "Content-Type": "application/json" },
            body: JSON.stringify(formCourseIds),
          });
        }
        toast({ title: "Plan créé" });
      }
      setIsOpen(false);
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCourses = async (planId: number) => {
    const ids = planCourses[planId] ?? [];
    setSavingCourses(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/subscription-plans/${planId}/courses`, {
        method: "PUT",
        headers: { ...h(), "Content-Type": "application/json" },
        body: JSON.stringify(ids),
      });
      if (!r.ok) throw new Error();
      const data = await r.json() as { added: number; removed: number; subscribers: number };
      toast({ title: `${data.added} ajouté(s), ${data.removed} retiré(s) · ${data.subscribers} abonné(s) synchronisé(s)` });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "Erreur lors de la mise à jour des cours" });
    } finally {
      setSavingCourses(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce plan ?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`${API_BASE}/api/admin/subscription-plans/${id}`, { method: "DELETE", headers: h() });
      if (!r.ok) throw new Error();
      toast({ title: "Plan supprimé" });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "Erreur lors de la suppression" });
    } finally {
      setDeletingId(null); }
  };

  const handleToggle = async (plan: PlanWithCount) => {
    setTogglingId(plan.id);
    try {
      const r = await fetch(`${API_BASE}/api/admin/subscription-plans/${plan.id}`, {
        method: "PATCH",
        headers: { ...h(), "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: !plan.isHidden }),
      });
      if (!r.ok) throw new Error();
      toast({ title: plan.isHidden ? "Plan visible" : "Plan masqué" });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "Une erreur est survenue" });
    } finally {
      setTogglingId(null);
    }
  };

  const toggleFormCourse = (id: number) =>
    setFormCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleCardCourse = (planId: number, pid: number) =>
    setPlanCourses(prev => {
      const cur = prev[planId] ?? [];
      return { ...prev, [planId]: cur.includes(pid) ? cur.filter(x => x !== pid) : [...cur, pid] };
    });

  /* ── render ──────────────────────────────────────────── */
  return (
    <div dir="ltr" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", margin: 0 }}>
            Gestion des plans
          </h1>
          <p style={{ fontSize: 14, color: "#94A3B8", marginTop: 4 }}>
            Associez chaque plan aux cours inclus — les abonnés sont synchronisés automatiquement
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="ad-btn-sm">
            <RefreshCcw size={13} style={isFetching ? { animation: "spin 0.7s linear infinite" } : undefined} />
            Actualiser
          </button>
          <button type="button" onClick={handleCreate} className="ad-btn-primary">
            <Plus size={14} />Nouveau plan
          </button>
        </div>
      </div>

      {/* ERROR STATE */}
      {isError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
          background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 10, color: "#9F1239",
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Erreur de chargement</div>
            <div style={{ fontSize: 12, marginTop: 2, color: "#BE123C" }}>
              {error instanceof Error ? error.message : "Impossible de charger les plans"}
            </div>
          </div>
          <button type="button" onClick={() => refetch()} className="ad-btn-sm" style={{ marginLeft: "auto" }}>
            Réessayer
          </button>
        </div>
      )}

      {/* LOADING STATE (first load) */}
      {isFetching && !plans && !isError && (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <Loader2 size={28} color="#F97316" style={{ animation: "spin 0.7s linear infinite" }} />
        </div>
      )}

      {/* PLAN CARDS */}
      {plans && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {plans.map(plan => {
            const accentColor = PLAN_COLORS[plan.type] ?? "#F97316";
            const isExpanded = expandedPlan === plan.id;
            const cardCourseIds = planCourses[plan.id] ?? [];
            const courseCount = plan.courseCount ?? 0;

            return (
              <div key={plan.id} style={{
                background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 12,
                overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
                opacity: plan.isHidden ? 0.72 : 1,
                display: "flex", flexDirection: "column",
              }}>
                {/* accent bar */}
                <div style={{ height: 4, background: accentColor }} />

                <div style={{ padding: "18px 20px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* plan header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${accentColor}1A`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <CreditCard size={18} color={accentColor} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                          {PLAN_LABELS[plan.type] || plan.type}
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {plan.type}
                        </div>
                      </div>
                    </div>
                    {plan.isHidden && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, background: "#F1F5F9", color: "#64748B",
                        padding: "2px 8px", borderRadius: 20, border: "1px solid #E2E8F0",
                      }}>
                        <EyeOff size={10} />Masqué
                      </span>
                    )}
                  </div>

                  {/* price */}
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: accentColor, lineHeight: 1, letterSpacing: "-0.03em" }}>
                      {plan.price}
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                      {plan.durationDays ? `${plan.durationDays} jour(s)` : "Durée illimitée"}
                    </div>
                  </div>

                  {/* description */}
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, margin: 0 }}>
                    {plan.description}
                  </p>

                  {/* course expand toggle */}
                  <button
                    type="button"
                    onClick={() => handleExpandCourses(plan.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: isExpanded ? "#FFF7ED" : "#F8FAFC",
                      border: `1px solid ${isExpanded ? "#FED7AA" : "#E2E8F0"}`,
                      borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <BookOpen size={14} color={isExpanded ? "#F97316" : "#64748B"} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: isExpanded ? "#C2410C" : "#334155" }}>
                        {courseCount} cours inclus
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                  </button>

                  {/* expanded course list */}
                  {isExpanded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                        {loadingCoursesFor === plan.id ? (
                          <div style={{ padding: 20, textAlign: "center" }}>
                            <Loader2 size={16} color="#F97316" style={{ animation: "spin 0.7s linear infinite" }} />
                          </div>
                        ) : !allPlaylists || allPlaylists.length === 0 ? (
                          <div style={{ padding: "12px 14px", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
                            Aucun cours disponible
                          </div>
                        ) : (
                          allPlaylists.map((pl, i) => {
                            const checked = cardCourseIds.includes(pl.id);
                            return (
                              <button key={pl.id} type="button"
                                onClick={() => toggleCardCourse(plan.id, pl.id)}
                                style={{
                                  width: "100%", display: "flex", alignItems: "center", gap: 9,
                                  padding: "9px 12px", textAlign: "left", cursor: "pointer",
                                  background: checked ? "#FFF7ED" : i % 2 === 0 ? "#fff" : "#FAFBFC",
                                  border: "none",
                                  borderBottom: i < allPlaylists.length - 1 ? "1px solid #F1F5F9" : "none",
                                }}>
                                <span style={{
                                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                  border: checked ? "none" : "1.5px solid #CBD5E1",
                                  background: checked ? "#F97316" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  {checked && <Check size={10} color="#fff" />}
                                </span>
                                <span style={{ fontSize: 13, color: "#334155" }}>{pl.title}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <button type="button" onClick={() => handleSaveCourses(plan.id)}
                        disabled={savingCourses} className="ad-btn-primary"
                        style={{ justifyContent: "center", height: 34 }}>
                        {savingCourses
                          ? <><Loader2 size={12} style={{ animation: "spin 0.7s linear infinite" }} />Enregistrement…</>
                          : "Enregistrer les cours"}
                      </button>
                    </div>
                  )}

                  {/* actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => handleOpen(plan)}
                        className="ad-btn-sm" style={{ flex: 1, justifyContent: "center" }}>
                        <Edit size={13} />Modifier
                      </button>
                      <button type="button" onClick={() => handleDelete(plan.id)}
                        disabled={deletingId === plan.id}
                        style={{
                          width: 34, height: 34, borderRadius: 7, border: "1px solid #FECDD3",
                          background: "#FFF1F2", color: "#9F1239", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                        {deletingId === plan.id
                          ? <Loader2 size={13} style={{ animation: "spin 0.7s linear infinite" }} />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                    <button type="button" onClick={() => handleToggle(plan)} disabled={togglingId === plan.id}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", background: "none", border: "none",
                        color: plan.isHidden ? "#15803D" : "#64748B",
                      }}>
                      {togglingId === plan.id
                        ? <Loader2 size={12} style={{ animation: "spin 0.7s linear infinite" }} />
                        : plan.isHidden
                          ? <><Eye size={12} />Afficher aux clients</>
                          : <><EyeOff size={12} />Masquer aux clients</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* empty state */}
          {plans.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "#94A3B8" }}>
              <Crown size={32} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14 }}>Aucun plan d'abonnement</p>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={isOpen} onOpenChange={open => { if (!open) setIsOpen(false); }}>
        <DialogContent dir="ltr" style={{ maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, color: "#0F172A", textAlign: "left" }}>
              {editingId !== null ? "Modifier le plan" : "Nouveau plan d'abonnement"}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
            {editingId === null && (
              <div>
                <Label style={{ fontSize: 12.5, color: "#334155", marginBottom: 5, display: "block" }}>
                  Identifiant <span style={{ color: "#94A3B8" }}>(ex: monthly, annual, vip_pro)</span>
                </Label>
                <input dir="ltr" className="ad-input" placeholder="monthly"
                  value={formData.type}
                  onChange={e => setFormData(f => ({ ...f, type: e.target.value }))} />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label style={{ fontSize: 12.5, color: "#334155", marginBottom: 5, display: "block" }}>Prix</Label>
                <input className="ad-input" placeholder="Ex: 700 DA" value={formData.price}
                  onChange={e => setFormData(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div>
                <Label style={{ fontSize: 12.5, color: "#334155", marginBottom: 5, display: "block" }}>Durée (jours)</Label>
                <input className="ad-input" type="number" placeholder="Ex: 30"
                  value={formData.durationDays ?? ""}
                  onChange={e => setFormData(f => ({ ...f, durationDays: e.target.value ? parseInt(e.target.value) : null }))} />
              </div>
            </div>

            <div>
              <Label style={{ fontSize: 12.5, color: "#334155", marginBottom: 5, display: "block" }}>Description</Label>
              <textarea className="ad-input" rows={3}
                style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Description visible par les clients" />
            </div>

            {/* course multi-select */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <BookOpen size={13} color="#F97316" />
                <span style={{ fontSize: 12.5, color: "#334155", fontWeight: 600 }}>
                  Cours inclus dans ce plan
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: 11, fontWeight: 700,
                  background: "#FFF7ED", color: "#C2410C",
                  padding: "1px 7px", borderRadius: 20, border: "1px solid #FED7AA",
                }}>
                  {formCourseIds.length} sélectionné{formCourseIds.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {formCoursesLoading ? (
                  <div style={{ padding: 20, textAlign: "center" }}>
                    <Loader2 size={16} color="#94A3B8" style={{ animation: "spin 0.7s linear infinite" }} />
                  </div>
                ) : !allPlaylists || allPlaylists.length === 0 ? (
                  <div style={{ padding: "14px", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
                    Aucun cours disponible — créez d'abord des cours
                  </div>
                ) : (
                  allPlaylists.map((pl, i) => {
                    const checked = formCourseIds.includes(pl.id);
                    return (
                      <button key={pl.id} type="button" onClick={() => toggleFormCourse(pl.id)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px", textAlign: "left", cursor: "pointer",
                          background: checked ? "#FFF7ED" : i % 2 === 0 ? "#fff" : "#FAFBFC",
                          border: "none",
                          borderBottom: i < allPlaylists.length - 1 ? "1px solid #F1F5F9" : "none",
                        }}>
                        <span style={{
                          width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                          border: checked ? "none" : "1.5px solid #CBD5E1",
                          background: checked ? "#F97316" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {checked && <Check size={10} color="#fff" />}
                        </span>
                        <span style={{ fontSize: 13.5, color: checked ? "#C2410C" : "#334155", fontWeight: checked ? 600 : 400 }}>
                          {pl.title || `Cours #${pl.id}`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {allPlaylists && allPlaylists.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                  <button type="button" onClick={() => setFormCourseIds(allPlaylists.map(p => p.id))}
                    style={{ fontSize: 11.5, color: "#F97316", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
                    Tout sélectionner
                  </button>
                  <span style={{ color: "#E2E8F0" }}>|</span>
                  <button type="button" onClick={() => setFormCourseIds([])}
                    style={{ fontSize: 11.5, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
                    Tout désélectionner
                  </button>
                </div>
              )}
            </div>

            {/* visibility toggle */}
            <div onClick={() => setFormData(f => ({ ...f, isHidden: !f.isHidden }))}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer",
              }}>
              <div style={{
                width: 38, height: 22, borderRadius: 99, flexShrink: 0,
                background: formData.isHidden ? "#CBD5E1" : "#F97316",
                position: "relative", transition: "background 130ms",
              }}>
                <div style={{
                  position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left 130ms",
                  left: formData.isHidden ? 3 : 19,
                }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", display: "flex", alignItems: "center", gap: 5 }}>
                  {formData.isHidden
                    ? <><EyeOff size={13} color="#94A3B8" />Masqué des clients</>
                    : <><Eye size={13} color="#F97316" />Visible aux clients</>
                  }
                </div>
                <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 2 }}>
                  {formData.isHidden ? "N'apparaîtra pas sur la page d'abonnement" : "Visible sur la page publique d'abonnement"}
                </div>
              </div>
            </div>

            <button type="button" onClick={handleSave} disabled={saving}
              className="ad-btn-primary"
              style={{ width: "100%", justifyContent: "center", height: 40, marginTop: 4 }}>
              {saving
                ? <><Loader2 size={14} style={{ animation: "spin 0.7s linear infinite" }} />Enregistrement…</>
                : editingId !== null ? "Enregistrer les modifications" : "Créer le plan"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
