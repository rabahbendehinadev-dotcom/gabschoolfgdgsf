import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Input, Label, Card } from "@/components/ui";
import { useRegister } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PlayCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const registerSchema = z.object({
  username: z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function Register() {
  const [, navigate] = useLocation();
  const { setAuth } = useAuth();
  const { toast } = useToast();
  const regMut = useRegister();

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema)
  });

  const onSubmit = (data: RegisterForm) => {
    regMut.mutate({ data }, {
      onSuccess: (res) => {
        setAuth(res.token, res.user);
        toast({ title: "تم إنشاء الحساب بنجاح", className: "bg-green-600 text-white border-none" });
        navigate("/dashboard");
      },
      onError: () => {
        toast({ 
          variant: "destructive", 
          title: "خطأ في التسجيل", 
          description: "حدث خطأ غير متوقع" 
        });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary glow-primary">
              <PlayCircle className="h-7 w-7" />
            </div>
          </Link>
          <h1 className="text-3xl font-bold mb-2">إنشاء حساب جديد</h1>
          <p className="text-foreground/60">انضم لمنصة المحترفين الآن</p>
        </div>

        <Card className="p-8 glass-card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input {...register("username")} placeholder="ahmed_123" dir="ltr" className="text-left" />
              {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
            </div>

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

            <Button type="submit" className="w-full h-12 text-lg mt-2" disabled={regMut.isPending}>
              {regMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "إنشاء حساب"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-foreground/60 border-t border-white/10 pt-6">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="text-primary hover:underline font-bold">
              تسجيل الدخول
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
