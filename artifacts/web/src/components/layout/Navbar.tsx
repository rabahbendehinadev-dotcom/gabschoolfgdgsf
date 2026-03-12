import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Crown, PlayCircle, Menu, X, BookOpen, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/videos",    label: "الدورات",      icon: <BookOpen className="w-4 h-4" /> },
    { href: "/subscribe", label: "الاشتراكات",   icon: <CreditCard className="w-4 h-4" /> },
  ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-16 md:h-20 items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group" onClick={() => setMobileOpen(false)}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 glow-primary">
              <PlayCircle className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight text-white group-hover:text-primary transition-colors">
              Cours <span className="text-primary">Online</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${location === link.href ? "text-primary" : "text-foreground/80 hover:text-primary"}`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                {user.accountType === "vip" && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold">
                    <Crown className="w-3.5 h-3.5" /> VIP
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
              <div className="flex items-center gap-3">
                <Link href="/login">
                  <Button variant="ghost" className="text-foreground/80 hover:text-white">دخول</Button>
                </Link>
                <Link href="/register">
                  <Button className="rounded-full px-6">حساب جديد</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile: action icons + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            {user ? (
              <>
                {user.accountType === "vip" && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold">
                    <Crown className="w-3 h-3" /> VIP
                  </div>
                )}
                <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" size="icon" className="rounded-full bg-white/5 border border-white/10 w-9 h-9">
                    <User className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button size="sm" variant="ghost" className="text-sm px-3">دخول</Button>
              </Link>
            )}

            <button
              onClick={() => setMobileOpen(v => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-foreground/80 hover:text-white hover:bg-white/10 transition-all"
              aria-label="القائمة"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-white/10 bg-background/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-1">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${location === link.href ? "bg-primary/10 text-primary border border-primary/20" : "text-foreground/80 hover:bg-white/5 hover:text-white"}`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}

              {!user && (
                <div className="mt-2 pt-3 border-t border-white/10">
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full rounded-xl">إنشاء حساب جديد</Button>
                  </Link>
                </div>
              )}

              {user && (
                <div className="mt-2 pt-3 border-t border-white/10">
                  <button
                    onClick={() => { logout(); setMobileOpen(false); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
