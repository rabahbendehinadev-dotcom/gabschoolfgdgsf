import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { InstallAppButton } from "@/components/InstallAppButton";
import { IosInstallGuide } from "@/components/IosInstallGuide";
import { useAuth } from "@/lib/auth";
import { LogOut, User, Crown, Menu, X, CreditCard, Home, Users, GraduationCap, Wrench, Lightbulb, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, type Locale } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  const navLinks = [
    { href: "/",          label: t("nav.home"),        icon: <Home className="w-[18px] h-[18px]" />,        match: (l: string) => l === "/" },
    { href: "/courses",   label: t("nav.courses"),     icon: <GraduationCap className="w-[18px] h-[18px]" />, match: (l: string) => l === "/courses" || l.startsWith("/courses/") },
    { href: "/solutions", label: t("nav.solutions"),   icon: <Lightbulb className="w-[18px] h-[18px]" />,   match: (l: string) => l === "/solutions" || l.startsWith("/solutions/") },
    { href: "/tools",     label: t("nav.tools"),       icon: <Wrench className="w-[18px] h-[18px]" />,      match: (l: string) => l === "/tools" || l.startsWith("/tools/") },
    { href: "/community", label: t("nav.community"),   icon: <Users className="w-[18px] h-[18px]" />,       match: (l: string) => l === "/community" || l.startsWith("/community/") },
    { href: "/subscribe", label: t("nav.subscriptions"), icon: <CreditCard className="w-[18px] h-[18px]" />, match: (l: string) => l === "/subscribe" || l.startsWith("/subscribe/") },
  ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-border bg-white/90 shadow-sm backdrop-blur-xl xl:border-slate-200/80 xl:bg-[#fffdfa] xl:shadow-[0_2px_8px_rgba(15,23,42,0.035)] xl:backdrop-blur-none"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid h-14 grid-cols-3 items-center gap-4 xl:flex xl:h-20">

          {/* --- MOBILE LAYOUT (hidden on xl) --- */}
          <div className="col-start-2 flex shrink-0 justify-center xl:hidden">
            <Link href="/" onClick={() => setMobileOpen(false)} data-testid="link-logo">
              <img
                src="/logo.png"
                alt="GAB Logo"
                className="h-9 w-auto rounded-xl bg-white px-2.5 py-1 shadow-md transition-all duration-300 hover:shadow-primary/30"
              />
            </Link>
          </div>

          <div className="col-start-3 flex items-center justify-end gap-2 xl:hidden">
            {user?.accountType === "vip" && (
              <div className="flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold text-orange-500" data-testid="badge-mobile-vip">
                <Crown className="h-3 w-3" /> {t("nav.vip")}
              </div>
            )}
            <button
              onClick={() => setMobileOpen(v => !v)}
              data-testid="button-mobile-menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground/70 transition-all hover:bg-muted hover:text-foreground"
              aria-label={t("nav.menu")}
            >
              {mobileOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>

          {/* --- DESKTOP LAYOUT (hidden below xl) --- */}
          <div className="hidden w-full items-center gap-3 xl:flex 2xl:gap-6">
            {/* 1. Logo (Left) */}
            <div className="flex shrink-0 justify-start">
              <Link
                href="/"
                data-testid="link-logo-desktop"
                className="flex h-[52px] w-[76px] items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-all hover:border-orange-200 hover:shadow"
              >
                <img
                  src="/logo.png"
                  alt="GAB Logo"
                  className="h-12 w-12 max-w-none scale-[2.05] object-contain"
                />
              </Link>
            </div>

            {/* 2. Main Navigation (Center) */}
            <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 2xl:gap-1.5">
              {navLinks.map(link => {
                const active = link.match(location);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-testid={`link-desktop-${link.href.replace('/', '') || 'home'}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors 2xl:gap-2 2xl:rounded-xl 2xl:px-3 2xl:py-2.5 2xl:text-sm ${
                      active
                        ? "bg-orange-50 text-orange-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* 3. Action Cluster (Right) */}
            <div className="flex shrink-0 items-center justify-end gap-2 2xl:gap-3">

              <div className="flex items-center gap-3">
                <InstallAppButton mode="navbar" onShowIosGuide={() => setIosGuideOpen(true)} />
                <label className="flex items-center gap-1 cursor-pointer group relative">
                  <span className="sr-only">{t("language.label")}</span>
                  <select
                    aria-label={t("language.label")}
                    value={locale}
                    onChange={event => setLocale(event.target.value as Locale)}
                    data-testid="select-desktop-language"
                    className="cursor-pointer appearance-none bg-transparent py-1 pe-5 ps-1 text-xs font-semibold text-slate-600 outline-none group-hover:text-slate-900 2xl:text-[13px]"
                  >
                    <option value="ar">{t("language.ar")}</option>
                    <option value="fr">{t("language.fr")}</option>
                    <option value="en">{t("language.en")}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-1 h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-slate-600" />
                </label>
              </div>

              <div className="h-5 w-px bg-slate-200" />

              {/* Auth / Profile Area */}
              {user ? (
                <div className="flex items-center gap-2 2xl:gap-3">
                  {user.accountType === "vip" && (
                    <div
                      className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                      data-testid="badge-desktop-vip"
                    >
                      <Crown className="w-3.5 h-3.5" /> {t("nav.vip")}
                    </div>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("nav.account")}
                        data-testid="link-desktop-account"
                        className="h-[38px] w-[38px] rounded-full border border-slate-200 bg-slate-50 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-100"
                      >
                        <User className="h-[18px] w-[18px] text-slate-700" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 mt-1 rounded-xl p-1.5 shadow-lg border-slate-200 bg-white">
                      <div className="px-2.5 py-2 mb-1">
                        <p className="text-sm font-semibold text-slate-900 truncate leading-none mb-1.5">{user.username || "User"}</p>
                        {user.email && <p className="text-[13px] text-slate-500 truncate leading-none">{user.email}</p>}
                      </div>
                      <DropdownMenuSeparator className="bg-slate-100" />
                      <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                        <Link href="/dashboard" className="flex items-center w-full">
                          <User className="me-2.5 h-4 w-4 text-slate-500" />
                          <span className="font-medium">{t("nav.account")}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-100" />
                      <DropdownMenuItem onClick={logout} data-testid="button-desktop-logout" className="rounded-lg text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer py-2.5">
                        <LogOut className="me-2.5 h-4 w-4 text-red-500" />
                        <span className="font-medium">{t("nav.logout")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 2xl:gap-1.5">
                  <Link href="/login" data-testid="link-desktop-login" className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                    {t("nav.login")}
                  </Link>
                  <Link href="/register" data-testid="link-desktop-register" className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                    {t("nav.register")}
                  </Link>
                  <Link href="/subscribe" data-testid="link-desktop-subscribe-cta">
                    <Button className="rounded-full px-5 h-[38px] bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold shadow-sm shadow-orange-500/20 border-none transition-all ml-1">
                      {t("nav.subscribe")}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
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
