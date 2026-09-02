import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  getUnreadNotificationCount,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
} from "@workspace/api-client-react/src/generated/api";
import type { NotificationItem } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Button, Skeleton } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { isPushSupported, resubscribePush } from "@/lib/push";
import {
  Bell,
  CheckCheck,
  Loader2,
  Heart,
  MessageCircle,
  CornerDownLeft,
  Megaphone,
  Sparkles,
  PlayCircle,
  Crown,
  Settings2,
  type LucideIcon,
} from "lucide-react";

const PAGE_SIZE = 20;

type TypeMeta = { Icon: LucideIcon; color: string; ring: string };

function metaFor(type: string): TypeMeta {
  if (type === "video") return { Icon: PlayCircle, color: "text-blue-500", ring: "from-blue-100 to-indigo-100/50" };

  if (type.startsWith("community") || type === "like" || type === "comment" || type === "reply") {
    if (type === "like") return { Icon: Heart, color: "text-rose-500", ring: "from-rose-100 to-pink-100/50" };
    if (type === "comment") return { Icon: MessageCircle, color: "text-sky-500", ring: "from-sky-100 to-blue-100/50" };
    if (type === "reply") return { Icon: CornerDownLeft, color: "text-violet-500", ring: "from-violet-100 to-fuchsia-100/50" };
    return { Icon: Sparkles, color: "text-amber-500", ring: "from-amber-100 to-orange-100/50" };
  }

  if (type.startsWith("vip") || type === "vip") {
    return { Icon: Crown, color: "text-yellow-600", ring: "from-yellow-100 to-amber-100/50" };
  }

  if (type === "admin_broadcast") {
    return { Icon: Megaphone, color: "text-primary", ring: "from-orange-100 to-amber-100/50" };
  }

  return { Icon: Bell, color: "text-slate-500", ring: "from-slate-100 to-slate-200/50" };
}

function getFamily(type: string): string {
  if (type === "video") return "lessons";
  if (type.startsWith("community") || ["like", "comment", "reply"].includes(type)) return "community";
  if (type.startsWith("vip") || type === "vip") return "vip";
  return "system";
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return "الآن";
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `قبل ${day} يوم`;
  return new Date(iso).toLocaleDateString("ar-DZ", { dateStyle: "medium" });
}

type FilterType = "all" | "lessons" | "community" | "vip" | "system";

const TABS: { id: FilterType; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "lessons", label: "الدروس" },
  { id: "community", label: "Community" },
  { id: "vip", label: "VIP" },
  { id: "system", label: "النظام" },
];

export function Notifications() {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [reenabling, setReenabling] = useState(false);
  const [pushSupported] = useState(() => isPushSupported());
  const [filter, setFilter] = useState<FilterType>("all");

  const listKey = getGetNotificationsQueryKey({ limit: PAGE_SIZE });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      getNotifications(
        { limit: PAGE_SIZE, cursor: pageParam as number | undefined },
        getAuthHeaders(),
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!user,
  });
  const { data: unreadData } = useQuery({
    queryKey: getGetUnreadNotificationCountQueryKey(),
    queryFn: () => getUnreadNotificationCount(getAuthHeaders()),
    enabled: !!user,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const markRead = useMarkNotificationRead({ request: getAuthHeaders() });
  const markAllRead = useMarkAllNotificationsRead({ request: getAuthHeaders() });

  const items: NotificationItem[] = data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = unreadData?.count ?? items.filter((n) => !n.isRead).length;
  const hasUnread = unreadCount > 0;

  const filteredItems = items.filter((n) => filter === "all" || getFamily(n.type) === filter);

  const refreshCount = () =>
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });

  const onOpen = (n: NotificationItem) => {
    if (!n.isRead) {
      markRead.mutate(
        { id: n.id },
        {
          onSuccess: () => {
            refreshCount();
            queryClient.invalidateQueries({ queryKey: listKey });
          },
        },
      );
    }
    if (n.targetPath) navigate(n.targetPath);
  };

  const onMarkAll = () => {
    if (!hasUnread || markAllRead.isPending) return;
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        refreshCount();
        queryClient.invalidateQueries({ queryKey: listKey });
      },
    });
  };

  const onReenable = async () => {
    if (reenabling) return;
    setReenabling(true);
    try {
      const { publicKey } = await getVapidPublicKey();
      if (!publicKey) {
        toast({ title: "الإشعارات غير متاحة حاليًا", variant: "destructive" });
        return;
      }
      const fresh = await resubscribePush(publicKey);
      if (!fresh) {
        toast({
          title: "تعذّر تفعيل الإشعارات",
          description: "تأكد من السماح بالإشعارات في إعدادات المتصفح ثم أعد المحاولة.",
          variant: "destructive",
        });
        return;
      }
      await savePushSubscription(fresh.sub, getAuthHeaders());
      if (fresh.staleEndpoint) {
        await deletePushSubscription({ endpoint: fresh.staleEndpoint }, getAuthHeaders()).catch(
          () => {},
        );
      }
      toast({
        title: "تم إعادة تفعيل الإشعارات بنجاح",
        description: "ستصلك الإشعارات الآن حتى عندما يكون هاتفك مقفلًا.",
      });
    } catch {
      toast({ title: "تعذّر إعادة التفعيل", variant: "destructive" });
    } finally {
      setReenabling(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-foreground">
            <Bell className="h-7 w-7 text-primary" strokeWidth={2.5} />
            الإشعارات
            {unreadCount > 0 && (
              <span className="relative -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-sm">
                {unreadCount}
              </span>
            )}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pushSupported && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReenable}
              disabled={reenabling}
              className="h-8 px-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="إصلاح الإشعارات"
            >
              {reenabling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Settings2 className="h-4 w-4" />
              )}
            </Button>
          )}
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAll}
              disabled={markAllRead.isPending}
              className="h-8 gap-1.5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary sm:text-sm"
            >
              {markAllRead.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide sm:gap-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 sm:px-4 sm:text-[13px]",
              filter === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/70 text-secondary-foreground hover:bg-secondary/90"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-3 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-2xl border border-border/50 bg-white/50 p-4"
            >
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2.5 pt-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Empty State */}
          {filteredItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-white/40 px-6 py-16 text-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80">
                <Bell className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <h2 className="mb-1.5 text-lg font-bold text-foreground">
                {filter === "all" ? "لا توجد إشعارات بعد" : "لا توجد إشعارات في هذا القسم"}
              </h2>
              <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground">
                {filter === "all"
                  ? "سنُعلمك هنا بأحدث الدروس والمنشورات والتحديثات المهمة."
                  : "لم نجد أي إشعارات تطابق هذا التصنيف حالياً."}
              </p>
            </motion.div>
          ) : (
            /* Items List */
            <ul className="space-y-3">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((n) => {
                  const meta = metaFor(n.type);
                  const Icon = meta.Icon;
                  return (
                    <motion.li
                      layout
                      initial={{ opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                      transition={{ duration: 0.2 }}
                      key={n.id}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(n)}
                        className={cn(
                          "group relative flex w-full items-start gap-4 rounded-2xl border p-4 text-right transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                          n.isRead
                            ? "bg-white border-border/60 hover:border-border hover:shadow-sm"
                            : "bg-primary/[0.03] border-primary/20 hover:border-primary/40 hover:bg-primary/[0.05] shadow-sm"
                        )}
                      >
                        {/* Unread Left Indicator Stripe */}
                        {!n.isRead && (
                          <div className="absolute top-4 bottom-4 right-0 w-[3px] rounded-l-full bg-primary" />
                        )}

                        {/* Thumbnail / Icon */}
                        {n.thumbnailUrl ? (
                          <div className="relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-muted border border-border/50">
                            <img
                              src={n.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                              <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-md" />
                            </div>
                          </div>
                        ) : (
                          <div className={cn("shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br border border-black/[0.03]", meta.ring)}>
                            <Icon className={cn("w-5 h-5", meta.color)} />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0 space-y-0.5">
                              {n.courseTitle && (
                                <p className="text-[11px] font-bold text-primary truncate">
                                  {n.courseTitle}
                                </p>
                              )}
                              <h3 className={cn("text-sm truncate", n.isRead ? "font-semibold text-foreground/80" : "font-bold text-foreground")}>
                                {n.title}
                              </h3>
                            </div>
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap shrink-0 pt-1">
                              {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm" />}
                              {formatRelative(n.createdAt)}
                            </span>
                          </div>

                          {n.body && (
                            <p className={cn("text-[13px] line-clamp-2 leading-relaxed mt-1.5", n.isRead ? "text-muted-foreground/70" : "text-muted-foreground")}>
                              {n.body}
                            </p>
                          )}
                        </div>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}

          {/* Load More */}
          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="gap-2 rounded-full px-6 font-semibold shadow-sm"
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                عرض المزيد
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
