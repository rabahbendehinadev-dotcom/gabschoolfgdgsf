import { useState } from "react";
import { useGetAdminSubscriptionPlans, useUpdateSubscriptionPlan } from "@workspace/api-client-react/src/generated/api";
import { SubscriptionPlan } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Edit, CreditCard, Plus, Trash2, Loader2, EyeOff, Eye } from "lucide-react";

const API_BASE = "";

export function AdminPlans() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const reqOpts = { request: getAdminAuthHeaders() };
  const { data: plans, refetch } = useGetAdminSubscriptionPlans(reqOpts);
  const updateMut = useUpdateSubscriptionPlan({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    type: string; price: string; description: string;
    durationDays: number | null; isHidden: boolean;
  }>({ type: "", price: "", description: "", durationDays: null, isHidden: false });

  const handleOpen = (plan: SubscriptionPlan) => {
    setEditingId(plan.id);
    setFormData({
      type: plan.type, price: plan.price, description: plan.description,
      durationDays: plan.durationDays ?? null, isHidden: plan.isHidden ?? false,
    });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ type: "", price: "", description: "", durationDays: null, isHidden: false });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (editingId !== null) {
      updateMut.mutate(
        { id: editingId, data: { price: formData.price, description: formData.description, durationDays: formData.durationDays, isHidden: formData.isHidden } },
        {
          onSuccess: () => { toast({ title: "Mis à jour" }); setIsOpen(false); refetch(); },
          onError: () => toast({ variant: "destructive", title: "Une erreur est survenue" }),
        }
      );
    } else {
      setIsCreating(true);
      try {
        const headers = getAdminAuthHeaders()?.headers || {};
        const res = await fetch(`${API_BASE}/api/admin/subscription-plans`, {
          method: "POST",
          headers: { ...(headers as HeadersInit), "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error("Échec de la création");
        toast({ title: "Plan créé" });
        setIsOpen(false);
        refetch();
      } catch {
        toast({ variant: "destructive", title: "Erreur lors de la création" });
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce plan ?")) return;
    setDeletingId(id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/subscription-plans/${id}`, {
        method: "DELETE",
        headers: headers as HeadersInit,
      });
      if (!res.ok) throw new Error("Échec de la suppression");
      toast({ title: "Plan supprimé" });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "Erreur lors de la suppression" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleHidden = async (plan: SubscriptionPlan) => {
    setTogglingId(plan.id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/subscription-plans/${plan.id}`, {
        method: "PATCH",
        headers: { ...(headers as HeadersInit), "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: !plan.isHidden }),
      });
      if (!res.ok) throw new Error();
      toast({
        title: plan.isHidden ? "✅ Le plan est maintenant visible pour les clients" : "🔒 Le plan a été masqué aux clients",
        className: plan.isHidden ? "bg-green-600 text-white border-none" : "bg-gray-700 text-white border-none",
      });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "Une erreur est survenue" });
    } finally {
      setTogglingId(null);
    }
  };

  const planLabels: Record<string, string> = {
    demo: "Essai", annual: "Annuel", lifetime: "À vie", monthly: "Mensuel",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des plans d'abonnement</h1>
          <p className="text-sm text-muted-foreground mt-1">Les plans masqués n'apparaissent que ici et non pour les clients</p>
        </div>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouveau plan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans?.map((plan) => (
          <Card
            key={plan.id}
            className={`p-6 border-white/5 bg-card relative overflow-hidden group transition-all ${
              plan.isHidden ? "opacity-70 border-dashed border-white/10" : ""
            }`}
          >
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${plan.isHidden ? "from-gray-400 to-gray-500" : "from-blue-500 to-blue-400"}`} />

            {plan.isHidden && (
              <div className="absolute top-3 left-3">
                <span className="inline-flex items-center gap-1 text-xs bg-gray-600/80 text-gray-300 px-2 py-0.5 rounded-full border border-gray-500/40">
                  <EyeOff className="w-3 h-3" />
                  Masqué des clients
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${plan.isHidden ? "bg-gray-500/10 text-gray-400" : "bg-primary/10 text-primary"}`}>
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{planLabels[plan.type] || plan.type}</h3>
                <p className="text-xs text-muted-foreground uppercase">{plan.type}</p>
              </div>
            </div>

            <div className="text-3xl font-black text-primary mb-2">{plan.price}</div>
            <p className="text-sm text-muted-foreground mb-2">
              {plan.durationDays ? `${plan.durationDays} jour(s)` : "Illimité"}
            </p>
            <p className="text-sm text-foreground/70 mb-4 line-clamp-3">{plan.description}</p>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => handleOpen(plan)}>
                  <Edit className="w-4 h-4 mr-2" /> Modifier
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDelete(plan.id)}
                  disabled={deletingId === plan.id}
                >
                  {deletingId === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>

              <button
                onClick={() => handleToggleHidden(plan)}
                disabled={togglingId === plan.id}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all border ${
                  plan.isHidden
                    ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                    : "border-gray-500/30 text-gray-400 hover:bg-gray-500/10"
                }`}
              >
                {togglingId === plan.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : plan.isHidden
                    ? <><Eye className="w-3.5 h-3.5" /> Afficher aux clients</>
                    : <><EyeOff className="w-3.5 h-3.5" /> Masquer aux clients</>
                }
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Modifier le plan d'abonnement" : "Créer un nouveau plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingId === null && (
              <div className="space-y-2">
                <Label>Type de plan (type)</Label>
                <Input
                  dir="ltr" className="text-left"
                  placeholder="Exemple: monthly ou annual"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Prix</Label>
              <Input
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="Ex: 700 DA"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Durée d'abonnement (jours)</Label>
              <Input
                type="number"
                value={formData.durationDays ?? ""}
                onChange={(e) => setFormData({ ...formData, durationDays: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Ex: 30 pour 1 mois"
              />
            </div>

            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${formData.isHidden ? "border-gray-500/40 bg-gray-500/10" : "border-border bg-muted/30"}`}
              onClick={() => setFormData(f => ({ ...f, isHidden: !f.isHidden }))}>
              <div className={`w-10 h-6 rounded-full transition-all relative ${formData.isHidden ? "bg-gray-500" : "bg-primary"}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.isHidden ? "right-1" : "left-1"}`} />
              </div>
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  {formData.isHidden ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-primary" />}
                  {formData.isHidden ? "Masqué des clients (admin seulement)" : "Visible pour les clients sur la page d'abonnement"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formData.isHidden ? "N'apparaîtra pas sur la page d'abonnement publique" : "Visible par tous sur la page d'abonnement"}
                </p>
              </div>
            </div>

            <Button className="w-full mt-4" onClick={handleSave} disabled={updateMut.isPending || isCreating}>
              {(updateMut.isPending || isCreating) ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId !== null ? "Enregistrer" : "Créer le plan")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
