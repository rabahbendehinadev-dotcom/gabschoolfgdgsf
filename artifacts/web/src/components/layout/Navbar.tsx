import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui";
import { InstallAppButton } from "@/components/InstallAppButton";
import { IosInstallGuide } from "@/components/IosInstallGuide";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Crown, Menu, X, CreditCard, Home, Users, GraduationCap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // The iOS install guide lives at the Navbar root (always mounted) so closing
  // the mobile menu can never unmount the dialog mid-open.
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  const navLinks = [
    { href: "/",          label: "الرئيسية",     icon: <Home className="w-4 h-4" /> },
    { href: "/courses",   label: "الدورات",      icon: <GraduationCap className="w-4 h-4" /> },
    { href: "/community", label: "Community GAB",    icon: <Users className="w-4 h-4" /> },
    { href: "/subscribe", label: "الاشتراكات",   icon: <CreditCard className="w-4 h-4" /> },
  ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-border bg-white/90 backdrop-blur-xl shadow-sm"
    >
      <div className="container mx-auto px-4 sm:px-6">
        {/* 3-column grid: nav links | centered logo | actions */}
        <div className="grid grid-cols-3 h-14 lg:h-20 items-center">

          {/* Right col: nav links (RTL — visually on right) */}
          <div className="hidden lg:flex items-center gap-8 justify-start">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${location === link.href ? "text-primary" : "text-foreground/70 hover:text-primary"}`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>

          {/* Center col: Logo */}
          <div className="flex justify-center">
            <Link href="/" onClick={() => setMobileOpen(false)}>
              <img
                src="/logo.png"
                alt="GAB Logo"
                className="h-9 lg:h-14 w-auto rounded-xl bg-white px-2.5 py-1 lg:px-3 lg:py-1.5 shadow-md hover:shadow-primary/30 transition-all duration-300"
              />
            </Link>
          </div>

          {/* Left col: Actions (RTL — visually on left) */}
          <div className="hidden lg:flex items-center gap-4 justify-end">
            <InstallAppButton mode="navbar" onShowIosGuide={() => setIosGuideOpen(true)} />
            {user ? (
              <div className="flex items-center gap-3">
                {user.accountType === "vip" && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-orange-500/30 text-orange-500 text-xs font-bold">
                    <Crown className="w-3.5 h-3.5" /> VIP
                  </div>
                )}
                <Link href="/dashboard">
                  <Button variant="ghost" size="icon" className="rounded-full bg-muted/60 border border-border hover:bg-muted">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={logout} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link href="/login">
                  <Button variant="ghost" className="text-foreground/70 hover:text-foreground">دخول</Button>
                </Link>
                <Link href="/register">
                  <Button variant="outline" className="rounded-full px-5 border-border hover:border-primary/50">حساب جديد</Button>
                </Link>
                <Link href="/subscribe">
                  <Button className="rounded-full px-6 shadow-md shadow-primary/25">اشترك الآن</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile/tablet: VIP badge + hamburger (primary nav lives in the bottom bar) */}
          <div className="flex lg:hidden items-center gap-2 justify-end col-start-3">
            {user?.accountType === "vip" && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-500 text-[11px] font-bold">
                <Crown className="w-3 h-3" /> VIP
              </div>
            )}
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 border border-border text-foreground/70 hover:text-foreground hover:bg-muted transition-all"
              aria-label="القائمة"
            >
              {mobileOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
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
            className="lg:hidden border-t border-border bg-white/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-1">
              {navLinks
                .filter(link => !["/", "/courses", "/community"].includes(link.href))
                .map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${location === link.href ? "bg-primary/10 text-primary border border-primary/20" : "text-foreground/70 hover:bg-muted hover:text-foreground"}`}
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                ))}

              <InstallAppButton
                mode="menu"
                onNavigate={() => setMobileOpen(false)}
                onShowIosGuide={() => setIosGuideOpen(true)}
              />

              {!user && (
                <div className="mt-2 pt-3 border-t border-border flex flex-col gap-2">
                  <Link href="/subscribe" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full rounded-xl shadow-md shadow-primary/25">اشترك الآن</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full rounded-xl border-border">إنشاء حساب جديد</Button>
                  </Link>
                </div>
              )}

              {user && (
                <div className="mt-2 pt-3 border-t border-border">
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

      {/* Mounted once at the Navbar root — stable across menu open/close. */}
      <IosInstallGuide open={iosGuideOpen} onOpenChange={setIosGuideOpen} />
    </motion.nav>
  );
}
