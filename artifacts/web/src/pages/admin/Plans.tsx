import { useState } from "react";
import { useGetAdminSubscriptionPlans, useUpdateSubscriptionPlan } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Edit, CreditCard } from "lucide-react";

export function AdminPlans() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();

  const reqOpts = { request: getAdminAuthHeaders() };
  const { data: plans, refetch } = useGetAdminSubscriptionPlans(reqOpts);
  const updateMut = useUpdateSubscriptionPlan({ request: getAdminAuthHeaders() });

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ price: "", description: "", durationDays: null as number | null });

  const handleOpen = (plan: any) => {
    setEditingId(plan.id);
    setFormData({ price: plan.price, description: plan.description, durationDays: plan.durationDays });
    setIsOpen(true);
  };

  const handleSave = () => {
    if (!editingId) return;
    updateMut.mutate(
      { id: editingId, data: formData },
      {
        onSuccess: () => {
          toast({ title: "تم التحديث" });
          setIsOpen(false);
          refetch();
        },
        onError: () => toast({ variant: "destructive", title: "حدث خطأ" }),
      }
    );
  };

  const planLabels: Record<string, string> = {
    demo: "تجريبي",
    annual: "سنوي",
    lifetime: "مدى الحياة",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold">إدارة خطط الاشتراك</h1>

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

            <Button variant="secondary" className="w-full" onClick={() => handleOpen(plan)}>
              <Edit className="w-4 h-4 ml-2" /> تعديل
            </Button>
          </Card>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل خطة الاشتراك</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <Button className="w-full mt-4" onClick={handleSave} disabled={updateMut.isPending}>
              حفظ التغييرات
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
