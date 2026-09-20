import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Home, GraduationCap, Users, Bell, User, Lightbulb, Wrench } from "lucide-react";
import {
  getUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n";

export function BottomNav() {
  const [location] = useLocation();
  const { user, getAuthHeaders } = useAuth();
  const { direction, t } = useLocale();

  const { data: unread } = useQuery({
    queryKey: getGetUnreadNotificationCountQueryKey(),
    queryFn: () => getUnreadNotificationCount(getAuthHeaders()),
    enabled: !!user,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  const unreadCount = user ? unread?.count ?? 0 : 0;

  const items = [
    { label: t("nav.home"), icon: Home, href: "/", match: (l: string) => l === "/" },
    { label: t("nav.courses"), icon: GraduationCap, href: "/courses", match: (l: string) => l === "/courses" || l.startsWith("/courses/") },
    { label: t("nav.solutions"), icon: Lightbulb, href: "/solutions", match: (l: string) => l === "/solutions" || l.startsWith("/solutions/") },
    { label: t("nav.tools"), icon: Wrench, href: "/tools", match: (l: string) => l === "/tools" || l.startsWith("/tools/") },
    { label: t("nav.community"), icon: Users, href: "/community", match: (l: string) => l === "/community" || l.startsWith("/community/") },
    { label: t("nav.notifications"), icon: Bell, href: "/notifications", match: (l: string) => l.startsWith("/notifications") },
    { label: t("nav.account"), icon: User, href: user ? "/dashboard" : "/login", match: (l: string) => l === "/dashboard" || l.startsWith("/dashboard/") || l === "/login" || l === "/register" || l === "/complete-phone" },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <nav
      dir={direction}
      aria-label={items.map(item => item.label).join(", ")}
      className="fixed inset-x-0 bottom-0 z-[100] box-border border-t border-border bg-white/95 backdrop-blur-xl shadow-[0_-4px_24px_rgba(15,23,42,0.08)] xl:hidden"
      style={{
        height: "calc(70px + 1px + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="mx-auto flex h-[70px] w-full max-w-md items-stretch justify-between px-0.5 sm:px-2">
        {items.map((item) => {
          const active = item.match(location);
          const Icon = item.icon;
          const showBadge = item.href === "/notifications" && unreadCount > 0;
          return (
            <li key={item.label} className="flex-1 min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-testid={`link-bottomnav-${item.href.replace('/', '') || 'home'}`}
                className="flex h-full w-full select-none flex-col items-center justify-center gap-[3px] outline-none"
              >
                <motion.span
                  className="relative flex items-center justify-center"
                  whileTap={{ scale: 0.82 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                >
                  {active && (
                    <motion.span
                      layoutId="bottomnav-active-pill"
                      className="absolute -inset-x-2.5 -inset-y-1.5 rounded-2xl bg-primary/10"
                      transition={{ type: "spring", stiffness: 450, damping: 34 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative h-[22px] w-[22px] transition-colors duration-200",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    strokeWidth={active ? 2.4 : 2}
                  />
                  {showBadge && (
                    <span className="absolute -right-2 -top-1.5 z-10 flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-[1.5px] border-white bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </motion.span>
                <span
                  className={cn(
                    "w-full whitespace-nowrap px-0.5 text-center text-[8px] font-semibold leading-tight tracking-[-0.035em] transition-colors duration-200 min-[360px]:text-[9px] sm:text-[10px]",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>,
    document.body,
  );
}
