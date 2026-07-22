import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button, Input, Label, Card } from "@/components/ui";
import { useAdminLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().min(1, "Requis"),
  password: z.string().min(1, "Requis"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function AdminLogin() {
  const [, navigate] = useLocation();
  const { setAdminAuth } = useAuth();
  const { toast } = useToast();
  const loginMut = useAdminLogin();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = (data: LoginForm) => {
    loginMut.mutate({ data }, {
      onSuccess: (res) => {
        setAdminAuth(res.token, res.admin);
        toast({ title: "Connexion réussie", className: "bg-green-600 text-white" });
        navigate("/gab-ctrl-9x");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Erreur", description: "Identifiants incorrects" });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-8 border-destructive/20 bg-card">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Portail d'administration</h1>
          <p className="text-muted-foreground text-sm">Réservé aux administrateurs de la plateforme</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label>Nom d'utilisateur / E-mail</Label>
            <Input {...register("email")} dir="ltr" className="text-left bg-black/50" />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label>Mot de passe</Label>
            <Input type="password" {...register("password")} dir="ltr" className="text-left bg-black/50" />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          <Button type="submit" variant="destructive" className="w-full h-12 text-lg glow-none" disabled={loginMut.isPending}>
            {loginMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accéder au panneau"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
