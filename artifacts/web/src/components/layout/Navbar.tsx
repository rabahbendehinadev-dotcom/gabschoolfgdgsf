import { Link } from "wouter";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Crown, PlayCircle } from "lucide-react";
import { motion } from "framer-motion";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <motion.nav 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 glow-primary">
              <PlayCircle className="h-6 w-6" />
            </div>
            <span className="text-2xl font-bold font-display tracking-tight text-white group-hover:text-primary transition-colors">
              Cours <span className="text-primary">Online</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/videos" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">الدورات والفيديوهات</Link>
            <Link href="/#pricing" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">الاشتراكات</Link>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                {user.accountType === 'vip' && (
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold">
                    <Crown className="w-3.5 h-3.5" />
                    VIP
                  </div>
                )}
                <Link href="/dashboard">
                  <Button variant="ghost" size="icon" className="rounded-full bg-white/5 border border-white/10 hover:bg-white/10">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={logout} className="rounded-full hover:bg-destructive/20 hover:text-destructive">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="hidden sm:flex text-foreground/80 hover:text-white">دخول</Button>
                </Link>
                <Link href="/register">
                  <Button className="rounded-full px-6">حساب جديد</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
