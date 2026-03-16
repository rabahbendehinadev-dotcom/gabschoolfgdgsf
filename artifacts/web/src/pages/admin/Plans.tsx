import { useState } from "react";
import { useGetAdminSubscriptionPlans, useUpdateSubscriptionPlan } from "@workspace/api-client-react/src/generated/api";
import { SubscriptionPlan } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Edit, CreditCard, Plus, Trash2, Loader2 } from "lucide-react";

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
  const [formData, setFormData] = useState<{ type: string; price: string; description: string; durationDays: number | null }>({
    type: "", price: "", description: "", durationDays: null,
  });

  const handleOpen = (plan: SubscriptionPlan) => {
    setEditingId(plan.id);
    setFormData({ type: plan.type, price: plan.price, description: plan.description, durationDays: plan.durationDays ?? null });
    setIsOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ type: "", price: "", description: "", durationDays: null });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (editingId !== null) {
      updateMut.mutate(
        { id: editingId, data: { price: formData.price, description: formData.description, durationDays: formData.durationDays } },
        {
          onSuccess: () => {
            toast({ title: "تم التحديث" });
            setIsOpen(false);
            refetch();
          },
          onError: () => toast({ variant: "destructive", title: "حدث خطأ" }),
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
        if (!res.ok) throw new Error("فشل الإنشاء");
        toast({ title: "تم إنشاء الخطة" });
        setIsOpen(false);
        refetch();
      } catch {
        toast({ variant: "destructive", title: "حدث خطأ في الإنشاء" });
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه الخطة؟")) return;
    setDeletingId(id);
    try {
      const headers = getAdminAuthHeaders()?.headers || {};
      const res = await fetch(`${API_BASE}/api/admin/subscription-plans/${id}`, {
        method: "DELETE",
        headers: headers as HeadersInit,
      });
      if (!res.ok) throw new Error("فشل الحذف");
      toast({ title: "تم حذف الخطة" });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ في الحذف" });
    } finally {
      setDeletingId(null);
    }
  };

  const planLabels: Record<string, string> = {
    demo: "تجريبي",
    annual: "سنوي",
    lifetime: "مدى الحياة",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">إدارة خطط الاشتراك</h1>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> خطة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans?.map((plan) => (
          <Card key={plan.id} className="p-6 border-white/5 bg-card relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-amber-500" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{planLabels[plan.type] || plan.type}</h3>
                <p className="text-xs text-muted-foreground uppercase">{plan.type}</p>
              </div>
            </div>

            <div className="text-3xl font-black text-primary mb-2">{plan.price}</div>
            <p className="text-sm text-muted-foreground mb-2">
              {plan.durationDays ? `${plan.durationDays} يوم` : "غير محدود"}
            </p>
            <p className="text-sm text-foreground/70 mb-4 line-clamp-3">{plan.description}</p>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => handleOpen(plan)}>
                <Edit className="w-4 h-4 ml-2" /> تعديل
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
          </Card>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "تعديل خطة الاشتراك" : "إنشاء خطة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingId === null && (
              <div className="space-y-2">
                <Label>نوع الخطة (type)</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  placeholder="مثال: annual أو demo"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>السعر</Label>
              <Input
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="مثال: 5000 DA"
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>مدة الاشتراك (بالأيام)</Label>
              <Input
                type="number"
                value={formData.durationDays ?? ""}
                onChange={(e) => setFormData({ ...formData, durationDays: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="اترك فارغاً لمدى الحياة"
              />
            </div>
            <Button className="w-full mt-4" onClick={handleSave} disabled={updateMut.isPending || isCreating}>
              {(updateMut.isPending || isCreating) ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId !== null ? "حفظ التغييرات" : "إنشاء الخطة")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
