import { Link } from "wouter";
import { Card } from "@/components/ui";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/i18n";
import { accountMessage } from "@/i18n/accountMessages";

export function Register() {
  const { locale, direction } = useLocale();
  const m = (key: string) => accountMessage(locale, key);
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" dir={direction}>
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center mb-6">
            <img src="/logo.png" alt="GAB" className="h-16 w-auto" />
          </Link>
          <h1 className="text-3xl font-bold mb-2">{m("createAccountTitle")}</h1>
          <p className="text-foreground/60">{m("createAccountSubtitle")}</p>
        </div>

        <Card className="p-7 sm:p-8 glass-card">
          {/* Gmail notice — the key instruction for new users */}
          <div className="flex items-start gap-3 rounded-xl bg-primary/10 border border-primary/20 p-4 mb-6">
            <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/80 leading-relaxed">
              {m("gmailInstruction")}
            </p>
          </div>

          {/* Primary (and only) sign-up method: Google */}
          <GoogleSignInButton redirectTo="/videos" />

          {/* Simple, clear next-step guidance */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-sm text-foreground/70">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageCircle className="h-4 w-4" />
              </span>
              {m("addWhatsapp")}
            </div>
            <div className="flex items-center gap-3 text-sm text-foreground/70">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </span>
              {m("secureLogin")}
            </div>
          </div>

          <div className="mt-6 text-center text-sm text-foreground/60 border-t border-border pt-6">
            {m("alreadyAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline font-bold">
              {m("login")}
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
