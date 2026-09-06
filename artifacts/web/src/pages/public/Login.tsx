import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Input, Label, Card } from "@/components/ui";
import { useLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function Login() {
  const [, navigate] = useLocation();
  const { setAuth } = useAuth();
  const { toast } = useToast();
  const loginMut = useLogin();
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const navigateAfterLogin = async (token: string, phone: string | null | undefined, deviceCredential?: string) => {
    if (!phone) { navigate("/complete-phone"); return; }
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (deviceCredential) {
        headers["X-Device-Credential"] = deviceCredential;
      } else {
        const stored = localStorage.getItem("device_credential");
        if (stored) headers["X-Device-Credential"] = stored;
      }
      const res = await fetch("/api/user/courses", { headers });
      const courses: { id: number }[] = res.ok ? await res.json() : [];
      navigate(courses.length === 1 ? `/courses/${courses[0].id}` : "/courses");
    } catch {
      navigate("/courses");
    }
  };

  const onSubmit = (data: LoginForm) => {
    loginMut.mutate({ data }, {
      onSuccess: (res) => {
        setAuth(res.token, res.user, res.deviceCredential);
        toast({ title: "تم تسجيل الدخول بنجاح", className: "bg-green-600 text-white border-none" });
        void navigateAfterLogin(res.token, res.user.phone, res.deviceCredential);
      },
      onError: (err) => {
        const apiErr = err as Error & {
          status?: number;
          data?: { code?: string; message?: string; deviceCredential?: string };
        };
        if (apiErr.data?.deviceCredential) {
          localStorage.setItem("device_credential", apiErr.data.deviceCredential);
        }
        const description = apiErr.data?.message || "بيانات الدخول غير صحيحة";
        const title = apiErr.status === 403 ? "جهاز غير مسموح به" : "فشل تسجيل الدخول";
        toast({ variant: "destructive", title, description });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center mb-6">
            <img src="/logo.png" alt="GAB" className="h-16 w-auto" />
          </Link>
          <h1 className="text-3xl font-bold mb-2">مرحباً بعودتك</h1>
          <p className="text-foreground/60">سجّل دخولك لمتابعة دروسك</p>
        </div>

        <Card className="p-7 sm:p-8 glass-card">
          {/* Gmail notice */}
          <div className="flex items-start gap-3 rounded-xl bg-primary/10 border border-primary/20 p-4 mb-6">
            <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/80 leading-relaxed">
              سجّل الدخول بنفس حساب Gmail الذي تم تفعيل الدورة عليه.
            </p>
          </div>

          {/* Primary: Google */}
          <GoogleSignInButton redirectTo="/videos" />

          {/* Secondary: email + password (for existing accounts) */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowEmailLogin((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 text-sm text-foreground/50 hover:text-foreground/80 transition-colors"
            >
              تسجيل الدخول بالبريد الإلكتروني
              <ChevronDown className={`h-4 w-4 transition-transform ${showEmailLogin ? "rotate-180" : ""}`} />
            </button>

            {showEmailLogin && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4 mt-4 overflow-hidden"
              >
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input {...register("email")} placeholder="name@example.com" dir="ltr" className="text-left" />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>كلمة المرور</Label>
                  <Input type="password" {...register("password")} dir="ltr" className="text-left" />
                  {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>

                <Button type="submit" variant="secondary" className="w-full h-11" disabled={loginMut.isPending}>
                  {loginMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "دخول"}
                </Button>
              </motion.form>
            )}
          </div>

          <div className="mt-6 text-center text-sm text-foreground/60 border-t border-border pt-6">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="text-primary hover:underline font-bold">
              أنشئ حسابك الآن
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
