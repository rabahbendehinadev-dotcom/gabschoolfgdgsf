import { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { isValidPhoneNumber } from "react-phone-number-input";
import { Button, Label, Card } from "@/components/ui";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { useUpdateMyPhone } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const phoneSchema = z.object({
  phone: z
    .string()
    .min(1, "رقم الواتساب مطلوب")
    .refine((value) => isValidPhoneNumber(value), "أدخل رقم واتساب دولي صحيح مع رمز الدولة"),
});

type PhoneForm = z.infer<typeof phoneSchema>;

export function CompletePhone() {
  const [, navigate] = useLocation();
  const { token, user, bootstrapped, updateUser, logout, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const updatePhoneMut = useUpdateMyPhone({ request: getAuthHeaders() });

  const { control, handleSubmit, formState: { errors } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  // Not logged in -> send to login. Already has a phone -> straight into the app.
  useEffect(() => {
    if (!bootstrapped) return;
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (user?.phone) {
      navigate("/videos", { replace: true });
    }
  }, [bootstrapped, token, user, navigate]);

  const onSubmit = (data: PhoneForm) => {
    updatePhoneMut.mutate({ data: { phone: data.phone } }, {
      onSuccess: (updated) => {
        updateUser(updated);
        toast({ title: "تم حفظ رقم الواتساب بنجاح", className: "bg-green-600 text-white border-none" });
        navigate("/videos", { replace: true });
      },
      onError: (err) => {
        const apiErr = err as Error & { status?: number; data?: { message?: string } };
        const description = apiErr.data?.message || "تعذّر حفظ الرقم، حاول مرة أخرى";
        toast({ variant: "destructive", title: "فشل حفظ الرقم", description });
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary glow-primary mb-6">
            <MessageCircle className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold mb-2">خطوة أخيرة</h1>
          <p className="text-foreground/60">
            أدخل رقم الواتساب الخاص بك لإكمال إنشاء حسابك والدخول إلى الدروس
          </p>
        </div>

        <Card className="p-8 glass-card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>رقم الواتساب</Label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneNumberInput
                    id={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="5X XX XX XX XX"
                  />
                )}
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              <p className="text-xs text-foreground/50">
                اختر دولتك وأدخل رقم واتساب صحيح — ندعم جميع الدول
              </p>
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={updatePhoneMut.isPending}>
              {updatePhoneMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "حفظ والمتابعة"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-foreground/60 border-t border-border pt-6">
            <button type="button" onClick={logout} className="text-primary hover:underline font-bold">
              تسجيل الخروج
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
