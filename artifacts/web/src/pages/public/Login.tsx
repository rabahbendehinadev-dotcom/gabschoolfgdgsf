import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Input, Label, Card } from "@/components/ui";
import { useLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PlayCircle, Loader2 } from "lucide-react";
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

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = (data: LoginForm) => {
    loginMut.mutate({ data }, {
      onSuccess: (res) => {
        setAuth(res.token, res.user);
        toast({ title: "تم تسجيل الدخول بنجاح", className: "bg-green-600 text-white border-none" });
        navigate("/videos");
      },
      onError: async (err) => {
        let description = "بيانات الدخول غير صحيحة";
        let title = "فشل تسجيل الدخول";
        try {
          const res = (err as Error & { response?: Response }).response;
          const body = await res?.json();
          if (body?.message) {
            description = body.message;
            if (res?.status === 403) title = "جهاز غير مسموح به";
          }
        } catch { }
        toast({ variant: "destructive", title, description });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary glow-primary">
              <PlayCircle className="h-7 w-7" />
            </div>
          </Link>
          <h1 className="text-3xl font-bold mb-2">مرحباً بعودتك</h1>
          <p className="text-foreground/60">سجل دخولك لمتابعة دروسك</p>
        </div>

        <Card className="p-8 glass-card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input {...register("email")} placeholder="name@example.com" dir="ltr" className="text-left" />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>كلمة المرور</Label>
              </div>
              <Input type="password" {...register("password")} dir="ltr" className="text-left" />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={loginMut.isPending}>
              {loginMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "دخول"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-foreground/60 border-t border-white/10 pt-6">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="text-primary hover:underline font-bold">
              سجل الآن
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
