import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { compressImageForUpload } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash2, Wrench, Eye, EyeOff,
  Crown, KeyRound, Lock, CheckCircle2, Loader2,
  ExternalLink, ImagePlus, X, FolderTree,
} from "lucide-react";

interface ToolCategory { id: number; name: string; sortOrder: number; isVisible: boolean; }

interface AdminTool {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  accessType: "free" | "password" | "vip" | "vip_password";
  downloadUrl: string;
  hasPassword: boolean;
  isPublished: boolean;
  os: string | null;
  sortOrder: number;
}

interface ToolForm {
  name: string;
  description: string;
  imageUrl: string;
  categoryId: number | null;
  accessType: "free" | "password" | "vip" | "vip_password";
  password: string;
  downloadUrl: string;
  isPublished: boolean;
  os: string[];
  sortOrder: number;
}

const OS_OPTIONS = ["Windows", "macOS", "All"];

const EMPTY_FORM: ToolForm = {
  name: "", description: "", imageUrl: "", categoryId: null,
  accessType: "free", password: "", downloadUrl: "",
  isPublished: true, os: [], sortOrder: 0,
};

const ACCESS_OPTIONS = [
  { value: "free",         label: "Gratuit",            icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
  { value: "password",     label: "Avec mot de passe",  icon: <KeyRound    className="w-4 h-4 text-blue-400"    /> },
  { value: "vip",          label: "VIP seulement",      icon: <Crown       className="w-4 h-4 text-indigo-400"  /> },
  { value: "vip_password", label: "VIP + mot de passe", icon: <Lock        className="w-4 h-4 text-purple-400"  /> },
];

const ACCESS_BADGE: Record<string, string> = {
  free:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  password:     "bg-blue-500/15   text-blue-400    border-blue-500/30",
  vip:          "bg-indigo-500/15 text-indigo-400  border-indigo-500/30",
  vip_password: "bg-purple-500/15 text-purple-400  border-purple-500/30",
};

const ACCESS_LABEL: Record<string, string> = {
  free: "Gratuit", password: "Avec mot de passe", vip: "VIP seulement", vip_password: "VIP + mot de passe",
};

function OsMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    if (opt === "All") { onChange(["All"]); return; }
    const next = value.filter(v => v !== "All");
    if (next.includes(opt)) onChange(next.filter(v => v !== opt));
    else onChange([...next, opt]);
  };
  return (
    <div className="flex gap-2 flex-wrap">
      {OS_OPTIONS.map(opt => {
        const active = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              active
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-muted/20 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function AdminTools() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editing, setEditing]           = useState<AdminTool | null>(null);
  const [form, setForm]                 = useState<ToolForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteId, setDeleteId]         = useState<number | null>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: tools = [], isLoading } = useQuery<AdminTool[]>({
    queryKey: ["admin-tools"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/admin/tools`, { headers: getAdminAuthHeaders()?.headers });
      if (!res.ok) throw new Error("Échec du chargement des outils");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<ToolCategory[]>({
    queryKey: ["admin-tool-categories"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/admin/tool-categories`, { headers: getAdminAuthHeaders()?.headers });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-tools"] });

  const buildBody = (data: ToolForm) => ({
    name: data.name,
    description: data.description,
    imageUrl: data.imageUrl || null,
    categoryId: data.categoryId ?? null,
    accessType: data.accessType,
    password: data.password || null,
    downloadUrl: data.downloadUrl,
    isPublished: data.isPublished,
    os: data.os.length ? data.os.join(",") : null,
    sortOrder: data.sortOrder,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ToolForm) => {
      const res = await fetch(`${base}/api/admin/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(buildBody(data)),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erreur");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Outil ajouté" }); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ToolForm }) => {
      const body: Record<string, unknown> = buildBody(data);
      if (!data.password) delete body.password;
      const res = await fetch(`${base}/api/admin/tools/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erreur");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Outil mis à jour" }); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${base}/api/admin/tools/${id}`, {
        method: "DELETE", headers: getAdminAuthHeaders()?.headers,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erreur");
    },
    onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Outil supprimé" }); },
    onError:   (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  async function handleImageFile(original: File) {
    if (!original.type.startsWith("image/")) {
      toast({ title: "Type de fichier non pris en charge", variant: "destructive" }); return;
    }
    setImgUploading(true);
    try {
      const file = await compressImageForUpload(original);
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`${base}/api/storage/uploads/data`, { method: "POST", body: fd });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error ?? `HTTP ${resp.status}`);
      }
      const { objectPath } = await resp.json() as { objectPath: string };
      setForm(f => ({ ...f, imageUrl: `${base}/api/storage${objectPath}` }));
    } catch (e) {
      console.error("[upload] tool image failed:", e);
      toast({ title: "Erreur lors de l'upload de l'image", description: (e as Error).message, variant: "destructive" });
    } finally { setImgUploading(false); }
  }

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setShowPassword(false); setDialogOpen(true); }

  function openEdit(tool: AdminTool) {
    setEditing(tool);
    setForm({
      name:        tool.name,
      description: tool.description,
      imageUrl:    tool.imageUrl ?? "",
      categoryId:  tool.categoryId,
      accessType:  tool.accessType,
      password:    "",
      downloadUrl: tool.downloadUrl,
      isPublished: tool.isPublished,
      os:          tool.os ? tool.os.split(",").map(s => s.trim()).filter(Boolean) : [],
      sortOrder:   tool.sortOrder,
    });
    setShowPassword(false);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.downloadUrl.trim()) {
      toast({ title: "Le nom et le lien de téléchargement sont requis", variant: "destructive" }); return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else         createMutation.mutate(form);
  }

  const isPending     = createMutation.isPending || updateMutation.isPending;
  const needsPassword = form.accessType === "password" || form.accessType === "vip_password";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wrench className="w-7 h-7 text-primary" />
            Gestion des outils
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tools.length} outil(s)</p>
        </div>
        <Button onClick={openCreate} className="gap-2 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" /> Nouvel outil
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : tools.length === 0 ? (
        <Card className="glass-card p-16 text-center">
          <Wrench className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Aucun outil</h3>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Ajouter un outil</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tools.map(tool => (
            <Card key={tool.id} className="glass-card p-4">
              <div className="flex items-start gap-4">
                {tool.imageUrl ? (
                  <img src={tool.imageUrl} alt={tool.name}
                    className="w-16 h-16 rounded-xl object-contain flex-shrink-0 border border-border p-1 bg-muted/10" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-muted/30 flex items-center justify-center flex-shrink-0 border border-border">
                    <Wrench className="w-7 h-7 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-base">{tool.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ACCESS_BADGE[tool.accessType]}`}>
                      {ACCESS_LABEL[tool.accessType]}
                    </span>
                    {tool.categoryName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-muted/30 text-muted-foreground">
                        <FolderTree className="w-3 h-3" />{tool.categoryName}
                      </span>
                    )}
                    {!tool.isPublished && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-slate-500/10 text-slate-500 border-slate-500/20">
                        <EyeOff className="w-3 h-3" /> Masqué
                      </span>
                    )}
                    {tool.hasPassword && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-slate-500/10 text-slate-400 border-slate-500/20">
                        <KeyRound className="w-3 h-3" /> Protégé par mot de passe
                      </span>
                    )}
                  </div>
                  {tool.description && <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{tool.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {tool.os && <span>{tool.os}</span>}
                    <span className="flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{tool.downloadUrl}</span>
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(tool)} className="gap-1">
                    <Edit className="w-3.5 h-3.5" /> Modifier
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteId(tool.id)}
                    className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" />
              {editing ? "Modifier l'outil" : "Ajouter un nouvel outil"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">

            {/* Name */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Nom de l'outil <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: CCleaner Pro" />
            </div>

            {/* Description */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brève description de l'outil..." rows={3} className="resize-none" />
            </div>

            {/* Image upload */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Image de l'outil</Label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
              {form.imageUrl ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-border group bg-muted/10 flex items-center justify-center">
                    <img src={form.imageUrl} alt="Aperçu" className="max-w-[80%] max-h-[80%] object-contain" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}
                    disabled={imgUploading} className="gap-2">
                    {imgUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    Changer l'image
                  </Button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imgUploading}
                  className="flex flex-col items-center justify-center gap-2 w-full h-28 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground">
                  {imgUploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <ImagePlus className="w-6 h-6" />}
                  <span className="text-sm">{imgUploading ? "Téléversement..." : "Cliquer pour uploader une image"}</span>
                </button>
              )}
            </div>

            {/* Download URL */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Lien de téléchargement <span className="text-destructive">*</span></Label>
              <Input value={form.downloadUrl} onChange={e => setForm(f => ({ ...f, downloadUrl: e.target.value }))} placeholder="https://..." />
              <p className="text-xs text-muted-foreground">Ce lien est confidentiel et ne sera pas affiché directement aux utilisateurs</p>
            </div>

            {/* Category dropdown */}
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              {categories.length === 0 ? (
                <Link href="/gab-ctrl-9x/tool-categories">
                  <Button variant="outline" size="sm" className="gap-2 w-full justify-start text-muted-foreground">
                    <FolderTree className="w-4 h-4" />
                    Ajoutez d'abord des catégories
                  </Button>
                </Link>
              ) : (
                <Select
                  value={form.categoryId !== null ? String(form.categoryId) : "none"}
                  onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? null : Number(v) }))}
                >
                  <SelectTrigger><SelectValue placeholder="Choisir une catégorie..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><span className="text-muted-foreground">Sans catégorie</span></SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* OS multi-select */}
            <div className="space-y-1.5">
              <Label>Système d'exploitation</Label>
              <OsMultiSelect value={form.os} onChange={v => setForm(f => ({ ...f, os: v }))} />
            </div>

            {/* Access Type */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Niveau d'accès</Label>
              <Select value={form.accessType} onValueChange={v => setForm(f => ({ ...f, accessType: v as ToolForm["accessType"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">{opt.icon}{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Password */}
            {needsPassword && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>
                  Mot de passe
                  {editing?.hasPassword && <span className="text-muted-foreground text-xs ml-2">(laisser vide pour conserver l'actuel)</span>}
                </Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editing?.hasPassword ? "••••••••" : "Entrez le mot de passe..."} className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Sort Order + Published */}
            <div className="space-y-1.5">
              <Label>Ordre d'affichage</Label>
              <Input type="number" value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} placeholder="0" />
              <p className="text-xs text-muted-foreground">Le plus petit numéro apparaît en premier</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-3">
              <div>
                <Label className="text-sm font-medium">Statut de publication</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.isPublished ? "Visible pour les visiteurs" : "Masqué des visiteurs"}
                </p>
              </div>
              <Switch checked={form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending || imgUploading} className="flex-1 gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Enregistrer" : "Ajouter l'outil"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Supprimer l'outil</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Êtes-vous sûr de vouloir supprimer cet outil ? Cette action est irréversible.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending} className="flex-1 gap-2">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Supprimer
            </Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
