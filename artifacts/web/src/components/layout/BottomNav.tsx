import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Home, GraduationCap, Users, Bell, User } from "lucide-react";
import {
  getUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();
  const { user, getAuthHeaders } = useAuth();

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
    { label: "الرئيسية", icon: Home, href: "/", match: (l: string) => l === "/" },
    { label: "الدورات", icon: GraduationCap, href: "/videos", match: (l: string) => l === "/videos" || l.startsWith("/videos/") },
    { label: "المجتمع", icon: Users, href: "/community", match: (l: string) => l === "/community" || l.startsWith("/community/") },
    { label: "الإشعارات", icon: Bell, href: "/notifications", match: (l: string) => l.startsWith("/notifications") },
    { label: "حسابي", icon: User, href: user ? "/dashboard" : "/login", match: (l: string) => l === "/dashboard" },
  ];

  return (
    <nav
      dir="rtl"
      aria-label="التنقل السفلي"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 backdrop-blur-xl shadow-[0_-4px_24px_rgba(15,23,42,0.08)] lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-[70px] max-w-md items-stretch justify-around px-1">
        {items.map((item) => {
          const active = item.match(location);
          const Icon = item.icon;
          const showBadge = item.href === "/notifications" && unreadCount > 0;
          return (
            <li key={item.label} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex h-full select-none flex-col items-center justify-center gap-1 outline-none"
              >
                <motion.span
                  className="relative flex items-center justify-center"
                  whileTap={{ scale: 0.82 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                >
                  {active && (
                    <motion.span
                      layoutId="bottomnav-active-pill"
                      className="absolute -inset-x-3.5 -inset-y-1.5 rounded-2xl bg-primary/10"
                      transition={{ type: "spring", stiffness: 450, damping: 34 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative h-[23px] w-[23px] transition-colors duration-200",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    strokeWidth={active ? 2.4 : 2}
                  />
                  {showBadge && (
                    <span className="absolute -right-2 -top-1.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </motion.span>
                <span
                  className={cn(
                    "text-[11px] font-semibold leading-none transition-colors duration-200",
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
    </nav>
  );
}
