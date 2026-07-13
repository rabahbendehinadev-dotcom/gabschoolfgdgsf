import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useGetCommunitySummary,
  getCommunityFeed,
} from "@workspace/api-client-react/src/generated/api";
import { CommunityPost } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Button, Skeleton } from "@/components/ui";
import { PostCard } from "@/components/community/PostCard";
import { CreatePostDialog } from "@/components/community/CreatePostDialog";
import { ProfilePictureModal } from "@/components/community/ProfilePictureModal";
import { Users, PenSquare, MessageSquareText, Sparkles, Loader2, Camera } from "lucide-react";

const PAGE_SIZE = 10;

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-3.5 py-2 backdrop-blur-md">
      <span className="text-white/90">{icon}</span>
      <div className="leading-tight">
        <div className="text-base font-extrabold text-white">{value.toLocaleString("ar")}</div>
        <div className="text-[11px] text-white/75">{label}</div>
      </div>
    </div>
  );
}

export function Community() {
  const { user, getAuthHeaders } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const { data: summary, refetch: refetchSummary } = useGetCommunitySummary({ request: getAuthHeaders() });
  const {
    data: feed,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["/api/community/posts", "infinite"],
    queryFn: ({ pageParam }) =>
      getCommunityFeed({ limit: PAGE_SIZE, cursor: pageParam }, getAuthHeaders()),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const posts = feed?.pages.flatMap((p) => p.posts) ?? [];
  const canPost = summary?.canPost ?? !!user;
  const hasProfilePicture = summary?.hasProfilePicture ?? !!user?.profileImageUrl;

  const handleComposerClick = () => {
    if (!hasProfilePicture) {
      setAvatarOpen(true);
    } else {
      setCreateOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-background to-background pb-16" dir="rtl">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-amber-500 via-orange-500 to-orange-600" />
        {summary?.coverImageUrl && (
          <img
            src={summary.coverImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-25"
          />
        )}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(#fff 1.5px, transparent 1.5px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="container relative mx-auto max-w-2xl px-4 py-10 text-center sm:py-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/20 backdrop-blur-md">
              <Users className="h-8 w-8 text-white" />
            </div>
            <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">Community GAB</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/85 sm:text-base">
              مساحة أعضاء GAB لمشاركة الخبرات، الإنجازات، والنقاش حول إصلاح الهواتف وفكّ الشفرات.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <StatChip icon={<Users className="h-4 w-4" />} value={summary?.memberCount ?? 0} label="عضو" />
              <StatChip
                icon={<Sparkles className="h-4 w-4" />}
                value={summary?.todayPostsCount ?? 0}
                label="منشور اليوم"
              />
              <StatChip
                icon={<MessageSquareText className="h-4 w-4" />}
                value={summary?.totalPostsCount ?? 0}
                label="إجمالي المنشورات"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Feed */}
      <div className="container mx-auto max-w-2xl px-3 sm:px-4">
        {/* Composer trigger */}
        <div className="-mt-6 mb-5">
          {canPost ? (
            <button
              type="button"
              onClick={handleComposerClick}
              className="flex w-full items-center gap-3 rounded-3xl border border-border bg-white/90 p-4 text-right shadow-[0_4px_20px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-shadow hover:shadow-[0_6px_24px_rgba(15,23,42,0.1)]"
            >
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={user.username}
                  className="h-11 w-11 shrink-0 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-primary/40 bg-muted text-base font-bold text-muted-foreground">
                  <Camera className="h-5 w-5" />
                </div>
              )}
              <span className="flex-1 text-muted-foreground">
                {hasProfilePicture ? "شارك شيئاً مع Community GAB…" : "أضف صورة شخصية للنشر…"}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                <PenSquare className="h-4 w-4" />
                نشر
              </span>
            </button>
          ) : user ? null : (
            <Link href="/login">
              <div className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-3xl border border-border bg-white/90 px-5 py-4 text-sm font-semibold text-muted-foreground shadow transition-shadow hover:shadow-md">
                سجّل الدخول للمشاركة في Community GAB
              </div>
            </Link>
          )}
        </div>

        {/* Posts */}
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-3xl border border-border bg-white/80 p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
                <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-white/60 py-16 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-bold text-foreground">لا توجد منشورات بعد</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canPost ? "كن أول من يشارك في Community GAB!" : "عُد قريباً لمتابعة جديد Community GAB."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post: CommunityPost, idx: number) => (
              <PostCard key={post.id} post={post} index={idx} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasNextPage && !isLoading && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              className="rounded-full px-8"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارٍ التحميل…
                </>
              ) : (
                "تحميل المزيد"
              )}
            </Button>
          </div>
        )}
      </div>

      <CreatePostDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ProfilePictureModal
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        onSaved={() => {
          refetchSummary();
          setCreateOpen(true);
        }}
      />
    </div>
  );
}
