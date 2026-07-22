import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FolderTree, Loader2, Eye, EyeOff, Link } from "lucide-react";

interface ToolCategory {
  id: number;
  name: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
}

interface CatForm {
  name: string;
  sortOrder: number;
  isVisible: boolean;
}

const EMPTY: CatForm = { name: "", sortOrder: 0, isVisible: true };

export function AdminToolCategories() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ToolCategory | null>(null);
  const [form, setForm] = useState<CatForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: cats = [], isLoading } = useQuery<ToolCategory[]>({
    queryKey: ["admin-tool-categories"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/admin/tool-categories`, { headers: getAdminAuthHeaders()?.headers });
      if (!res.ok) throw new Error("Échec du chargement");
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-tool-categories"] });

  const createMut = useMutation({
    mutationFn: async (data: CatForm) => {
      const res = await fetch(`${base}/api/admin/tool-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erreur");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Catégorie ajoutée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CatForm }) => {
      const res = await fetch(`${base}/api/admin/tool-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminAuthHeaders()?.headers },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erreur");
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Catégorie mise à jour" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${base}/api/admin/tool-categories/${id}`, {
        method: "DELETE", headers: getAdminAuthHeaders()?.headers,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Erreur");
    },
    onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Catégorie supprimée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const toggleVisible = (cat: ToolCategory) =>
    updateMut.mutate({ id: cat.id, data: { name: cat.name, sortOrder: cat.sortOrder, isVisible: !cat.isVisible } });

  function openCreate() { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  function openEdit(cat: ToolCategory) {
    setEditing(cat);
    setForm({ name: cat.name, sortOrder: cat.sortOrder, isVisible: cat.isVisible });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Le nom de la catégorie est requis", variant: "destructive" }); return;
    }
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FolderTree className="w-7 h-7 text-primary" />
            Gestion des catégories d'outils
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cats.length} catégorie(s) — L'ordre ici est celui vu par l'utilisateur
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" />
          Nouvelle catégorie
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : cats.length === 0 ? (
        <Card className="glass-card p-16 text-center">
          <FolderTree className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Aucune catégorie</h3>
          <p className="text-muted-foreground mb-6 text-sm">Ajoutez une catégorie pour organiser vos outils</p>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Ajouter une catégorie
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cats.map((cat, idx) => (
            <Card key={cat.id} className="glass-card p-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base">{cat.name}</span>
                    {!cat.isVisible && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-orange-500/10 text-orange-400 border-orange-500/20">
                        <EyeOff className="w-3 h-3" /> Masqué
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Ordre d'affichage : {cat.sortOrder}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleVisible(cat)}
                    title={cat.isVisible ? "Masquer la catégorie" : "Afficher la catégorie"}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      cat.isVisible
                        ? "bg-emerald-500/10 text-emerald-400 hover:bg-red-500/10 hover:text-red-400"
                        : "bg-muted/30 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
                    }`}
                  >
                    {cat.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(cat)} className="gap-1">
                    <Edit className="w-3.5 h-3.5" /> Modifier
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteId(cat.id)}
                    className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Info note */}
      {cats.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-muted/20 border border-border px-4 py-3 text-sm text-muted-foreground">
          <Link className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Les catégories sont affichées dans l'ordre numérique — modifiez le champ "Ordre d'affichage" pour changer l'ordre.
            Les catégories masquées n'apparaissent pas sur le site mais les outils liés restent accessibles.
          </span>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-primary" />
              {editing ? "Modifier la catégorie" : "Ajouter une catégorie"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nom de la catégorie <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Maintenance, Design, Programmation..."
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Ordre d'affichage</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Le plus petit numéro apparaît en premier</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-3">
              <div>
                <Label className="text-sm font-medium">Visible pour les utilisateurs</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.isVisible ? "Affiché dans les onglets des outils" : "Masqué du site"}
                </p>
              </div>
              <Switch checked={form.isVisible} onCheckedChange={v => setForm(f => ({ ...f, isVisible: v }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending} className="flex-1 gap-2">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Enregistrer" : "Ajouter la catégorie"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Supprimer la catégorie</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Êtes-vous sûr ? Les outils liés ne seront pas supprimés mais perdront leur catégorie.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
              disabled={deleteMut.isPending} className="flex-1 gap-2">
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Supprimer
            </Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
