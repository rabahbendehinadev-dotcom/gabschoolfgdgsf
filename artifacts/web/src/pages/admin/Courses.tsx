import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { compressImageForUpload } from "@/lib/imageCompress";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, GraduationCap, X, Loader2, Eye, EyeOff, ImageIcon, Video, FolderTree, ShieldAlert, RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useGetAdminPlaylists, useCreatePlaylist, useUpdatePlaylist, useDeletePlaylist } from "@workspace/api-client-react/src/generated/api";

interface CourseForm {
  title: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  isVisible: boolean;
}

const DEFAULT_FORM: CourseForm = {
  title: "", description: "", imageUrl: "",
  sortOrder: 0, isVisible: true,
};

interface AuditRow {
  id: number;
  user_id: number;
  playlist_id: number;
  granted_at: string | null;
  granted_by: string | null;
  grant_source: string | null;
  reason: string | null;
  status: string | null;
  username: string;
  email: string;
  account_type: string;
  playlist_title: string | null;
  classification: "tracked" | "legacy_no_tracking" | "auto_migration";
  suspicious: boolean;
}

interface AuditReport {
  total: number;
  suspicious: number;
  tracked: number;
  rows: AuditRow[];
}

const CLASS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  tracked: { label: "موثّق", color: "#16A34A", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  legacy_no_tracking: { label: "قديم / بدون تتبع", color: "#D97706", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  auto_migration: { label: "منح تلقائي (migration)", color: "#DC2626", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "يدوي",
  migration: "migration تلقائي",
  bulk: "منح جماعي",
  "": "—",
};

export function AdminCourses() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const reqOpts = { request: getAdminAuthHeaders() };

  const { data: playlists, refetch } = useGetAdminPlaylists(reqOpts);
  const createMut = useCreatePlaylist({ request: getAdminAuthHeaders() });
  const updateMut = useUpdatePlaylist({ request: getAdminAuthHeaders() });
  const deleteMut = useDeletePlaylist({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CourseForm>(DEFAULT_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Audit state
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditData, setAuditData] = useState<AuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState<"all" | "suspicious">("suspicious");
  const [revoking, setRevoking] = useState<number | null>(null);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string>;
      const r = await fetch("/api/admin/course-access-report", { headers: h });
      if (r.ok) setAuditData(await r.json() as AuditReport);
    } catch { /* ignore */ } finally { setAuditLoading(false); }
  }, [getAdminAuthHeaders]);

  useEffect(() => { if (auditOpen) fetchAudit(); }, [auditOpen, fetchAudit]);

  const handleRevoke = async (row: AuditRow) => {
    if (!confirm(`نزع دورة "${row.playlist_title ?? row.playlist_id}" من "${row.username}"؟`)) return;
    setRevoking(row.id);
    try {
      const h = getAdminAuthHeaders()?.headers as Record<string, string>;
      const r = await fetch(`/api/admin/users/${row.user_id}/revoke-course/${row.playlist_id}`, { method: "DELETE", headers: h });
      if (!r.ok) throw new Error();
      toast({ title: "تم نزع الدورة" });
      fetchAudit();
    } catch {
      toast({ variant: "destructive", title: "فشل النزع" });
    } finally { setRevoking(null); }
  };

  const handleOpen = (pl?: typeof playlists extends (infer T)[] | undefined ? T : never) => {
    if (pl) {
      setEditingId(pl.id);
      setForm({
        title: pl.title,
        description: pl.description ?? "",
        imageUrl: (pl as typeof pl & { imageUrl?: string | null }).imageUrl ?? "",
        sortOrder: pl.sortOrder,
        isVisible: pl.isVisible,
      });
    } else {
      setEditingId(null);
      setForm({ ...DEFAULT_FORM });
    }
    setIsOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original) return;
    setUploading(true);
    try {
      const file = await compressImageForUpload(original);
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/storage/uploads/data", { method: "POST", body: fd });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error ?? `HTTP ${resp.status}`);
      }
      const { objectPath } = await resp.json() as { objectPath: string };
      setForm(prev => ({ ...prev, imageUrl: `/api/storage${objectPath}` }));
      toast({ title: "✅ Image téléversée", className: "bg-green-600 text-white border-none" });
    } catch (err) {
      console.error("[upload] course image failed:", err);
      toast({ variant: "destructive", title: "Échec de l'upload", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "Le nom du cours est requis" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl || null,
      sortOrder: form.sortOrder,
      isVisible: form.isVisible,
    };
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: payload as Parameters<typeof updateMut.mutateAsync>[0]["data"] })
      : createMut.mutateAsync({ data: payload as Parameters<typeof createMut.mutateAsync>[0]["data"] });

    action
      .then(() => {
        toast({ title: editingId ? "Cours mis à jour" : "Cours créé", className: "bg-green-600 text-white border-none" });
        refetch();
        setIsOpen(false);
      })
      .catch(() => toast({ variant: "destructive", title: "Erreur lors de la sauvegarde" }));
  };

  const handleDelete = (id: number, title: string) => {
    if (!confirm(`Supprimer le cours "${title}" ? Les leçons liées seront dissociées.`)) return;
    deleteMut.mutate({ id }, {
      onSuccess: () => { toast({ title: "Supprimé" }); refetch(); },
      onError: () => toast({ variant: "destructive", title: "Échec de la suppression" }),
    });
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const filteredRows = (auditData?.rows ?? []).filter(r =>
    auditFilter === "all" ? true : r.suspicious
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            Gestion des cours
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ajoutez vos cours et personnalisez leurs images — ils apparaissent automatiquement sur la page des cours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAuditOpen(o => !o)} className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50">
            <ShieldAlert className="w-4 h-4" />
            تدقيق الصلاحيات
            {auditOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </Button>
          <Button onClick={() => handleOpen()} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouveau cours
          </Button>
        </div>
      </div>

      {/* ── Course Access Audit Section ─────────────────────────────────── */}
      {auditOpen && (
        <div style={{ border: "1px solid #FDE68A", borderRadius: 14, background: "#FFFBEB", padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }} dir="rtl">
              <ShieldAlert style={{ width: 18, height: 18, color: "#D97706" }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: "#92400E", margin: 0 }}>تدقيق صلاحيات الدورات</p>
                <p style={{ fontSize: 12, color: "#B45309", margin: 0 }}>
                  {auditLoading ? "جاري التحليل..." : auditData
                    ? `إجمالي: ${auditData.total} منحة — مشبوهة: ${auditData.suspicious} — موثّقة: ${auditData.tracked}`
                    : ""}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" onClick={fetchAudit} disabled={auditLoading}
                style={{ background: "none", border: "1px solid #D97706", color: "#D97706", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <RefreshCw style={{ width: 12, height: 12 }} />
                تحديث
              </button>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #D97706" }}>
                {(["suspicious", "all"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setAuditFilter(f)}
                    style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", border: "none", background: auditFilter === f ? "#D97706" : "transparent", color: auditFilter === f ? "#fff" : "#D97706", fontWeight: auditFilter === f ? 700 : 400 }}>
                    {f === "suspicious" ? "المشبوهة" : "الكل"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {auditLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
              <Loader2 style={{ width: 24, height: 24, color: "#D97706" }} className="animate-spin" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#92400E", fontSize: 13 }} dir="rtl">
              {auditData ? (auditFilter === "suspicious" ? "✅ لا توجد منح مشبوهة — الصلاحيات نظيفة" : "لا توجد منح مسجّلة") : "اضغط تحديث لجلب البيانات"}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }} dir="rtl">
                <thead>
                  <tr style={{ borderBottom: "1px solid #FDE68A" }}>
                    {["المستخدم", "الدورة", "مصدر المنح", "التصنيف", "تاريخ المنح", "بواسطة", "إجراء"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "right", color: "#92400E", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => {
                    const cls = CLASS_LABELS[row.classification] ?? CLASS_LABELS.tracked;
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid #FEF3C7", background: i % 2 === 0 ? "#FFFBEB" : "#FFF9E6" }}>
                        <td style={{ padding: "7px 10px" }}>
                          <div style={{ fontWeight: 600, color: "#1F2937" }}>{row.username}</div>
                          <div style={{ color: "#6B7280", fontSize: 11 }}>{row.email}</div>
                          <div style={{ marginTop: 2 }}>
                            <span style={{ fontSize: 10, background: row.account_type === "vip" ? "#FEF3C7" : "#F3F4F6", color: row.account_type === "vip" ? "#D97706" : "#6B7280", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
                              {row.account_type === "vip" ? "VIP" : "عادي"}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "7px 10px", color: "#374151", fontWeight: 500 }}>
                          {row.playlist_title ?? `#${row.playlist_id}`}
                        </td>
                        <td style={{ padding: "7px 10px", color: "#6B7280" }}>
                          {SOURCE_LABELS[row.grant_source ?? ""] ?? row.grant_source ?? "—"}
                        </td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: cls.color, fontWeight: 600, fontSize: 11.5 }}>
                            {cls.icon}
                            {cls.label}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px", color: "#9CA3AF", whiteSpace: "nowrap" }}>
                          {row.granted_at ? new Date(row.granted_at).toLocaleDateString("ar-DZ") : "—"}
                        </td>
                        <td style={{ padding: "7px 10px", color: "#6B7280" }}>
                          {row.granted_by ?? "—"}
                        </td>
                        <td style={{ padding: "7px 10px" }}>
                          <button type="button" onClick={() => handleRevoke(row)}
                            disabled={revoking === row.id}
                            style={{ background: row.suspicious ? "#FEF2F2" : "#F9FAFB", color: row.suspicious ? "#DC2626" : "#6B7280", border: `1px solid ${row.suspicious ? "#FECACA" : "#E5E7EB"}`, borderRadius: 6, padding: "3px 10px", fontSize: 11.5, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            {revoking === row.id ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Trash2 style={{ width: 11, height: 11 }} />}
                            نزع
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(playlists ?? []).map(pl => {
          const imageUrl = (pl as typeof pl & { imageUrl?: string | null }).imageUrl;
          return (
            <Card key={pl.id} className="glass-card overflow-hidden">
              <div className="relative aspect-video bg-muted/40 overflow-hidden">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={pl.title}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <GraduationCap className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                {!pl.isVisible && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-lg">
                    <EyeOff className="w-3 h-3" />
                    Masqué
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-lg">
                  {pl.videos?.length ?? 0} leçon(s)
                </div>
              </div>

              <div className="p-4">
                <h3 className="font-bold text-base leading-snug mb-1 line-clamp-1">{pl.title}</h3>
                {pl.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{pl.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Link href={`/bendehinaonline97/videos?courseId=${pl.id}`}>
                    <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                      <Video className="w-3.5 h-3.5" />
                      Vidéos
                    </Button>
                  </Link>
                  <Link href={`/bendehinaonline97/categories?courseId=${pl.id}`}>
                    <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                      <FolderTree className="w-3.5 h-3.5" />
                      Catégories
                    </Button>
                  </Link>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 gap-1.5" onClick={() => handleOpen(pl)}>
                    <Edit className="w-3.5 h-3.5" />
                    Modifier
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(pl.id, pl.title)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {(playlists ?? []).length === 0 && (
          <div className="col-span-full">
            <Card className="glass-card p-14 text-center">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Aucun cours. Ajoutez votre premier cours !</p>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg bg-background border border-white/10 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le cours" : "Nouveau cours"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Image du cours</Label>
              {form.imageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
                  <img src={form.imageUrl} alt="aperçu" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, imageUrl: "" }))}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-2 border border-dashed border-white/20 rounded-xl p-8 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {uploading
                    ? <Loader2 className="w-7 h-7 animate-spin" />
                    : <ImageIcon className="w-7 h-7" />
                  }
                  <span className="text-sm">{uploading ? "Téléversement..." : "Cliquer pour uploader l'image du cours"}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              {!form.imageUrl && !uploading && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}
              {!form.imageUrl && (
                <Input
                  placeholder="Coller un lien image direct (https://...)"
                  dir="ltr" className="text-left text-sm"
                  value={form.imageUrl}
                  onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Nom du cours *</Label>
              <Input
                placeholder="Ex: Cours Full Bias iPhone X"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Description du cours</Label>
              <textarea
                className="flex min-h-[70px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Brève description du contenu du cours..."
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ordre d'affichage</Label>
                <Input
                  type="number" min={0}
                  value={form.sortOrder}
                  onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-3 cursor-pointer pb-2">
                  <input
                    type="checkbox" checked={form.isVisible}
                    onChange={e => setForm(p => ({ ...p, isVisible: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm flex items-center gap-1.5">
                    {form.isVisible ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                    {form.isVisible ? "Visible pour les élèves" : "Masqué"}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="flex-1" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "Enregistrer" : "Créer le cours")}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Annuler</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
