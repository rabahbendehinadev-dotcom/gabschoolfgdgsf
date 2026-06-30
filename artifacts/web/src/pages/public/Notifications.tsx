import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
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
  BellRing,
  CheckCheck,
  Loader2,
  Heart,
  MessageCircle,
  CornerUpLeft,
  Megaphone,
  Sparkles,
} from "lucide-react";

const PAGE_SIZE = 20;

type TypeMeta = { Icon: typeof Bell; color: string; ring: string };

const TYPE_META: Record<string, TypeMeta> = {
  community_vip_post: { Icon: Sparkles, color: "text-amber-500", ring: "from-amber-100 to-orange-100" },
  like: { Icon: Heart, color: "text-rose-500", ring: "from-rose-100 to-pink-100" },
  comment: { Icon: MessageCircle, color: "text-sky-500", ring: "from-sky-100 to-blue-100" },
  reply: { Icon: CornerUpLeft, color: "text-violet-500", ring: "from-violet-100 to-indigo-100" },
  admin_broadcast: { Icon: Megaphone, color: "text-primary", ring: "from-primary/15 to-primary/5" },
};

function metaFor(type: string): TypeMeta {
  return TYPE_META[type] ?? { Icon: Bell, color: "text-primary", ring: "from-primary/15 to-primary/5" };
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

export function Notifications() {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [reenabling, setReenabling] = useState(false);
  const [pushSupported] = useState(() => isPushSupported());

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

  const markRead = useMarkNotificationRead({ request: getAuthHeaders() });
  const markAllRead = useMarkAllNotificationsRead({ request: getAuthHeaders() });

  const items: NotificationItem[] = data?.pages.flatMap((p) => p.items) ?? [];
  const hasUnread = items.some((n) => !n.isRead);

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

  // Manual self-heal for users whose push silently stopped working (e.g. a
  // subscription bound to an old VAPID key): tear down whatever the browser has
  // and recreate a fresh, deliverable subscription, then prune the dead one.
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
        title: "تم إعادة تفعيل الإشعارات ✅",
        description: "ستصلك الإشعارات الآن حتى عندما يكون هاتفك مقفلًا.",
      });
    } catch {
      toast({ title: "تعذّر إعادة التفعيل", variant: "destructive" });
    } finally {
      setReenabling(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
          <Bell className="h-6 w-6 text-primary" />
          الإشعارات
        </h1>
        <div className="flex items-center gap-1.5">
          {pushSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReenable}
              disabled={reenabling}
              className="gap-1.5"
              title="أعد تفعيل الإشعارات إذا توقفت عن الوصول إلى هاتفك"
            >
              {reenabling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              إعادة تفعيل الإشعارات
            </Button>
          )}
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAll}
              disabled={markAllRead.isPending}
              className="gap-1.5 text-primary hover:text-primary"
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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border bg-white/70 p-4"
            >
              <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center rounded-3xl border border-border bg-white/80 px-6 py-16 text-center shadow-[0_4px_20px_rgba(15,23,42,0.05)] backdrop-blur-xl"
        >
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
            <Bell className="h-10 w-10 text-orange-500" />
          </div>
          <h2 className="mb-2 text-lg font-bold text-foreground">لا توجد إشعارات بعد</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            سنُعلمك هنا بأحدث الدورات والمنشورات والتحديثات المهمة في منصة GAB.
          </p>
        </motion.div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {items.map((n, idx) => {
              const meta = metaFor(n.type);
              const Icon = meta.Icon;
              return (
                <motion.li
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(idx * 0.02, 0.2) }}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(n)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-2xl border p-4 text-right transition-all",
                      "hover:shadow-[0_6px_22px_rgba(15,23,42,0.08)]",
                      n.isRead
                        ? "border-border bg-white/70"
                        : "border-primary/25 bg-primary/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br",
                        meta.ring,
                      )}
                    >
                      <Icon className={cn("h-6 w-6", meta.color)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-[15px] leading-snug",
                            n.isRead ? "font-semibold text-foreground" : "font-bold text-foreground",
                          )}
                        >
                          {n.title}
                        </span>
                        {!n.isRead && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />
                        )}
                      </span>
                      {n.body && (
                        <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1.5 block text-xs text-muted-foreground/80">
                        {formatRelative(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>

          {hasNextPage && (
            <div className="mt-5 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="gap-2"
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
