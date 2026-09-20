import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui";
import { InstallAppButton } from "@/components/InstallAppButton";
import { IosInstallGuide } from "@/components/IosInstallGuide";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Crown, Menu, X, CreditCard, Home, Users, GraduationCap, Wrench, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, type Locale } from "@/i18n";

export function Navbar() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // The iOS install guide lives at the Navbar root (always mounted) so closing
  // the mobile menu can never unmount the dialog mid-open.
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  const navLinks = [
    { href: "/",          label: t("nav.home"),        icon: <Home className="w-4 h-4" />,        match: (l: string) => l === "/" },
    { href: "/courses",   label: t("nav.courses"),     icon: <GraduationCap className="w-4 h-4" />, match: (l: string) => l === "/courses" || l.startsWith("/courses/") },
    { href: "/solutions", label: t("nav.solutions"),   icon: <Lightbulb className="w-4 h-4" />,   match: (l: string) => l === "/solutions" || l.startsWith("/solutions/") },
    { href: "/tools",     label: t("nav.tools"),       icon: <Wrench className="w-4 h-4" />,      match: (l: string) => l === "/tools" || l.startsWith("/tools/") },
    { href: "/community", label: t("nav.community"),   icon: <Users className="w-4 h-4" />,       match: (l: string) => l === "/community" || l.startsWith("/community/") },
    { href: "/subscribe", label: t("nav.subscriptions"), icon: <CreditCard className="w-4 h-4" />, match: (l: string) => l === "/subscribe" },
  ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-border bg-white/90 backdrop-blur-xl shadow-sm"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid h-14 grid-cols-3 items-center gap-4 xl:flex xl:h-20">

          {/* Right col: nav links (RTL — visually on right) */}
          <div className="order-2 hidden min-w-0 flex-1 items-center justify-center gap-1.5 xl:flex 2xl:gap-3">
            {navLinks.map(link => {
              const active = link.match(location);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  data-testid={`link-desktop-${link.href.replace('/', '') || 'home'}`}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors 2xl:px-2.5 2xl:text-sm ${active ? "text-primary bg-primary/5" : "text-foreground/70 hover:text-primary hover:bg-muted"}`}
                >
                  {link.icon}
                  <span className="whitespace-nowrap">{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Center col: Logo */}
          <div className="order-1 col-start-2 flex shrink-0 justify-center">
            <Link href="/" onClick={() => setMobileOpen(false)} data-testid="link-logo">
              <img
                src="/logo.png"
                alt="GAB Logo"
                className="h-9 w-auto rounded-xl bg-white px-2.5 py-1 shadow-md transition-all duration-300 hover:shadow-primary/30 xl:h-14 xl:px-3 xl:py-1.5"
              />
            </Link>
          </div>

          {/* Left col: Actions (RTL — visually on left) */}
          <div className="order-3 hidden shrink-0 items-center justify-end gap-2 xl:flex 2xl:gap-3">
            <InstallAppButton mode="navbar" onShowIosGuide={() => setIosGuideOpen(true)} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
              <span className="sr-only">{t("language.label")}</span>
              <select
                aria-label={t("language.label")}
                value={locale}
                onChange={event => setLocale(event.target.value as Locale)}
                data-testid="select-desktop-language"
                className="h-9 rounded-full border border-border bg-white px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="ar">{t("language.ar")}</option>
                <option value="fr">{t("language.fr")}</option>
                <option value="en">{t("language.en")}</option>
              </select>
            </label>
            {user ? (
              <div className="flex items-center gap-3 flex-shrink-0">
                {user.accountType === "vip" && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-orange-500/30 text-orange-500 text-xs font-bold" data-testid="badge-desktop-vip">
                    <Crown className="w-3.5 h-3.5" /> VIP
                  </div>
                )}
                <Link href="/dashboard" data-testid="link-desktop-account">
                  <Button variant="ghost" size="icon" className="rounded-full bg-muted/60 border border-border hover:bg-muted">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={logout} data-testid="button-desktop-logout" className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <Link href="/login" data-testid="link-desktop-login">
                  <Button variant="ghost" className="text-foreground/70 hover:text-foreground">{t("nav.login")}</Button>
                </Link>
                <Link href="/register" data-testid="link-desktop-register">
                  <Button variant="outline" className="rounded-full px-5 border-border hover:border-primary/50">{t("nav.register")}</Button>
                </Link>
                <Link href="/subscribe" data-testid="link-desktop-subscribe-cta">
                  <Button className="rounded-full px-6 shadow-md shadow-primary/25">{t("nav.subscribe")}</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile/tablet: VIP badge + hamburger */}
          <div className="col-start-3 flex items-center justify-end gap-2 xl:hidden">
            {user?.accountType === "vip" && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-500 text-[11px] font-bold" data-testid="badge-mobile-vip">
                <Crown className="w-3 h-3" /> {t("nav.vip")}
              </div>
            )}
            <button
              onClick={() => setMobileOpen(v => !v)}
              data-testid="button-mobile-menu"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 border border-border text-foreground/70 hover:text-foreground hover:bg-muted transition-all"
              aria-label={t("nav.menu")}
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
            className="overflow-hidden border-t border-border bg-white/95 backdrop-blur-xl xl:hidden"
            data-testid="mobile-menu-drawer"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-1">
              <label className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground/70">
                <span>{t("language.label")}</span>
                <select
                  aria-label={t("language.label")}
                  value={locale}
                  onChange={event => setLocale(event.target.value as Locale)}
                  data-testid="select-mobile-language"
                  className="rounded-lg border border-border bg-white px-2 py-1.5 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="ar">{t("language.ar")}</option>
                  <option value="fr">{t("language.fr")}</option>
                  <option value="en">{t("language.en")}</option>
                </select>
              </label>

              <Link
                href="/subscribe"
                onClick={() => setMobileOpen(false)}
                data-testid="link-mobile-subscribe"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${location === "/subscribe" ? "bg-primary/10 text-primary border border-primary/20" : "text-foreground/70 hover:bg-muted hover:text-foreground"}`}
              >
                <CreditCard className="w-4 h-4" />
                {t("nav.subscriptions")}
              </Link>

              <InstallAppButton
                mode="menu"
                onNavigate={() => setMobileOpen(false)}
                onShowIosGuide={() => setIosGuideOpen(true)}
              />

              {!user && (
                <div className="mt-2 pt-3 border-t border-border flex flex-col gap-2">
                  <Link href="/subscribe" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full rounded-xl shadow-md shadow-primary/25" data-testid="button-mobile-subscribe-cta">{t("nav.subscribe")}</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full rounded-xl border-border" data-testid="button-mobile-register">{t("nav.register")}</Button>
                  </Link>
                </div>
              )}

              {user && (
                <div className="mt-2 pt-3 border-t border-border">
                  <button
                    onClick={() => { logout(); setMobileOpen(false); }}
                    data-testid="button-mobile-logout"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all w-full"
                  >
                     <LogOut className="w-4 h-4" />
                     {t("nav.logout")}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <IosInstallGuide open={iosGuideOpen} onOpenChange={setIosGuideOpen} />
    </motion.nav>
  );
}
