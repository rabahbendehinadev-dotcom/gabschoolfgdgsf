import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminLogin } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

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
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    loginMut.mutate({ data }, {
      onSuccess: (res) => {
        setAdminAuth(res.token, res.admin);
        const concurrent = (res as any).concurrentSessions as number | undefined;
        if (concurrent && concurrent > 0) {
          toast({
            variant: "destructive",
            title: `⚠️ Session simultanée détectée`,
            description: `${concurrent} autre${concurrent > 1 ? "s sessions actives" : " session active"} sur ce compte. Vérifiez que ce n'est pas un accès non autorisé.`,
            duration: 8000,
          });
        } else {
          toast({ title: "Connexion réussie", className: "bg-green-600 text-white" });
        }
        navigate("/gab-ctrl-9x");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Erreur", description: "Identifiants incorrects" });
      },
    });
  };

  return (
    <div dir="ltr" style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 16, background: "#F8FAFC",
      fontFamily: "'Outfit', 'Inter', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Brand / logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: "linear-gradient(135deg, #F97316, #EA6C10)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 4px 14px rgba(249,115,22,0.30)",
          }}>
            <ShieldCheck size={24} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Portail d'administration
          </h1>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
            GAB School · Accès restreint
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#FFFFFF", border: "1px solid #E2E8F0",
          borderRadius: 12, padding: "28px 28px 24px",
          boxShadow: "0 1px 3px rgba(15,23,42,0.06), 0 4px 24px rgba(15,23,42,0.04)",
        }}>
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155" }}>
                Nom d'utilisateur / E-mail
              </label>
              <input
                {...register("email")}
                dir="ltr"
                autoComplete="username"
                placeholder="admin@gabschool.com"
                style={{
                  height: 38, borderRadius: 7, border: errors.email ? "1.5px solid #FECDD3" : "1px solid #CBD5E1",
                  background: "#FFFFFF", padding: "0 12px", fontSize: 13.5, color: "#0F172A",
                  outline: "none", transition: "border-color 130ms, box-shadow 130ms", width: "100%", boxSizing: "border-box",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#F97316"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.12)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = errors.email ? "#FECDD3" : "#CBD5E1"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {errors.email && <p style={{ fontSize: 11.5, color: "#9F1239", margin: 0 }}>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#334155" }}>Mot de passe</label>
              <div style={{ position: "relative" }}>
                <input
                  {...register("password")}
                  type={showPw ? "text" : "password"}
                  dir="ltr"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    height: 38, borderRadius: 7, border: errors.password ? "1.5px solid #FECDD3" : "1px solid #CBD5E1",
                    background: "#FFFFFF", padding: "0 40px 0 12px", fontSize: 13.5, color: "#0F172A",
                    outline: "none", transition: "border-color 130ms, box-shadow 130ms", width: "100%", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#F97316"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.12)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = errors.password ? "#FECDD3" : "#CBD5E1"; e.currentTarget.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", padding: 2 }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p style={{ fontSize: 11.5, color: "#9F1239", margin: 0 }}>{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loginMut.isPending}
              style={{
                height: 40, borderRadius: 8, border: "none",
                background: loginMut.isPending ? "#FDBA74" : "#F97316",
                color: "#FFFFFF", fontWeight: 600, fontSize: 13.5,
                cursor: loginMut.isPending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 120ms, box-shadow 120ms",
                boxShadow: loginMut.isPending ? "none" : "0 1px 3px rgba(249,115,22,0.30)",
                marginTop: 4,
              }}
              onMouseEnter={e => { if (!loginMut.isPending) e.currentTarget.style.background = "#EA6C10"; }}
              onMouseLeave={e => { if (!loginMut.isPending) e.currentTarget.style.background = "#F97316"; }}
            >
              {loginMut.isPending
                ? <><Loader2 size={16} style={{ animation: "spin 0.7s linear infinite" }} /> Connexion en cours…</>
                : "Accéder au panneau"}
            </button>

          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 11.5, color: "#CBD5E1", marginTop: 20 }}>
          GAB School — Panneau administrateur
        </p>
      </div>
    </div>
  );
}
