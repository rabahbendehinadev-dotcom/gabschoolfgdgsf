import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useGetCommunitySummary,
  getGetCommunitySummaryQueryKey,
  getCommunityFeed,
} from "@workspace/api-client-react/src/generated/api";
import { CommunityPost } from "@workspace/api-client-react/src/generated/api.schemas";
import { hasActiveCommunityAccess, useAuth } from "@/lib/auth";
import { Button, Skeleton } from "@/components/ui";
import { PostCard } from "@/components/community/PostCard";
import { CreatePostDialog } from "@/components/community/CreatePostDialog";
import { ProfilePictureModal } from "@/components/community/ProfilePictureModal";
import {
  Users, MessageCircle, Wrench, Shield, CheckCircle, CheckCircle2,
  Search, LayoutGrid, HelpCircle, Smartphone, Unlock,
  Cpu, Code, Bell, Plus, Image as ImageIcon, Video,
  FileText, BarChart2, Loader2, ThumbsUp, Lock
} from "lucide-react";
import { useLocale } from "@/i18n";
import { commerceMessage } from "@/i18n/communityCommerceMessages";

const PAGE_SIZE = 10;

const CATEGORIES = [
  { id: "all", label: "all", icon: LayoutGrid, active: true },
  { id: "help", label: "help", icon: HelpCircle },
  { id: "iphone", label: "iPhone", icon: Smartphone },
  { id: "android", label: "Android", icon: Smartphone },
  { id: "frp", label: "frp", icon: Unlock },
  { id: "hw", label: "hw", icon: Cpu },
  { id: "sw", label: "sw", icon: Code },
  { id: "tools", label: "tools", icon: Wrench },
  { id: "solved", label: "solved", icon: CheckCircle },
  { id: "news", label: "news", icon: Bell },
];

function CommunitySubscriberGate() {
  const { locale } = useLocale();
  const m = (key: string) => commerceMessage(locale, key);
  return (
    <div
      className="relative min-h-[540px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
      data-testid="community-subscriber-gate"
    >
      <div className="pointer-events-none space-y-4 p-4 opacity-55 blur-[4px]" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded-full bg-slate-300" />
                <div className="h-2.5 w-20 rounded-full bg-slate-200" />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="h-3.5 w-full rounded-full bg-slate-200" />
              <div className="h-3.5 w-4/5 rounded-full bg-slate-200" />
              <div className="h-32 rounded-2xl bg-slate-100" />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex items-start justify-center bg-white/35 p-5 pt-8 backdrop-blur-[2px] sm:items-center sm:pt-5">
        <div className="w-full max-w-md rounded-[28px] border border-orange-100 bg-white/95 p-5 text-center shadow-2xl shadow-slate-900/10 sm:p-9">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 ring-1 ring-orange-100 sm:mb-5 sm:h-14 sm:w-14">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900 sm:text-2xl">
            {m("communitySubscriberTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] font-medium leading-6 text-slate-600 sm:mt-3 sm:text-[14px] sm:leading-7">
            {m("communitySubscriberText")}
          </p>
          <Link href="/subscribe">
            <Button className="mt-4 h-11 w-full rounded-2xl bg-orange-500 text-[14px] font-black text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 sm:mt-6 sm:h-12 sm:text-[15px]">
              {m("viewSubscriptions")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CommunityPublicAbout() {
  const { locale } = useLocale();
  const m = (key: string) => commerceMessage(locale, key);
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-[16px] font-black text-slate-900">{m("communityAbout")}</h3>
      <p className="text-[14px] font-medium leading-relaxed text-slate-500">
        {m("communityAboutText")}
      </p>
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <p className="text-[12px] font-bold leading-5 text-slate-600">
          {m("communityMembersOnly")}
        </p>
      </div>
    </div>
  );
}

export function Community() {
  const { locale, direction } = useLocale();
  const m = (key: string) => commerceMessage(locale, key);
  const { user, getAuthHeaders, bootstrapped } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [composerAvatarFailed, setComposerAvatarFailed] = useState(false);

  useEffect(() => {
    setComposerAvatarFailed(false);
  }, [user?.profileImageUrl]);

  const hasCommunityAccess = bootstrapped && hasActiveCommunityAccess(user);
  const { data: summary, refetch: refetchSummary } = useGetCommunitySummary({
    request: getAuthHeaders(),
    query: {
      queryKey: getGetCommunitySummaryQueryKey(),
      enabled: hasCommunityAccess,
    },
  });
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
    enabled: hasCommunityAccess,
  });

  const posts = feed?.pages.flatMap((p) => p.posts) ?? [];
  const canPost = hasCommunityAccess && (summary?.canPost ?? !!user);
  const hasProfilePicture = summary?.hasProfilePicture ?? !!user?.profileImageUrl;

  const handleComposerClick = () => {
    if (!hasProfilePicture) {
      setAvatarOpen(true);
    } else {
      setCreateOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16" dir={direction}>
      {/* COMPACT HERO SECTION */}
      <div className="container mx-auto px-4 mt-4 md:mt-6 max-w-[1450px] mb-6">
        <div className="flex flex-col items-start gap-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">GAB Community</h1>
          <p className="text-sm md:text-base text-slate-500 font-medium">{m("communityDescription")}</p>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="container mx-auto px-4 max-w-[1450px]">
        {/* Mobile Categories (Horizontal Scroll) */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              disabled
              title={m("displayOnly")}
              aria-label={`${c.label} (${m("displayOnly")})`}
              data-testid={`button-category-mobile-${c.id}`}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-colors cursor-not-allowed opacity-90 ${
                c.active
                  ? 'bg-orange-50 border-orange-200 text-orange-600'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <c.icon className="w-4 h-4" />
              {["iPhone", "Android"].includes(c.label) ? c.label : m(c.label)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-7 items-start">
          {/* LEFT SIDEBAR (Desktop) */}
          <div className="hidden lg:order-1 lg:block lg:col-span-3 space-y-5 sticky top-24">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder={m("searchCommunity")}
                disabled
                title={m("unavailable")}
                aria-label={m("unavailable")}
                data-testid="input-search-community"
                className="w-full h-12 bg-white border border-slate-200 rounded-2xl pr-12 pl-4 text-[15px] font-bold focus:outline-none opacity-90 cursor-not-allowed shadow-sm text-slate-600 placeholder:text-slate-400 transition-shadow"
              />
            </div>

            {/* Categories Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-black text-[16px] text-slate-900 mb-4 px-2">{m("sections")}</h3>
              <div className="space-y-1">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    disabled
                    title={m("displayOnly")}
                    aria-label={`${c.label} (${m("displayOnly")})`}
                    data-testid={`button-category-desktop-${c.id}`}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl text-[14px] transition-colors cursor-not-allowed opacity-90 ${
                      c.active
                        ? 'bg-orange-50 text-orange-600 font-black'
                        : 'text-slate-600 bg-transparent font-bold hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <c.icon className={`w-5 h-5 ${c.active ? 'text-orange-500' : 'text-slate-400'}`} />
                      {["iPhone", "Android"].includes(c.label) ? c.label : m(c.label)}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 pt-5 border-t border-slate-100">
                <button
                  disabled
                  title={m("displayOnly")}
                  aria-label={m("allSections")}
                  data-testid="button-all-categories-disabled"
                  className="w-full flex items-center justify-center gap-2 py-2 text-[13px] font-bold text-slate-400 cursor-not-allowed hover:text-slate-500 transition-colors"
                >
                  <LayoutGrid className="w-4 h-4" />
                  {m("allSections")}
                </button>
              </div>
            </div>
          </div>

          {/* CENTER FEED */}
          <div className="md:order-1 md:col-span-8 lg:order-2 lg:col-span-6 space-y-4">
            {hasCommunityAccess ? (
              <>
                {/* Top Filters & New Post Action */}
                <div className="flex items-center justify-between bg-white p-3 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl overflow-x-auto no-scrollbar">
                    <button className="px-4 py-1.5 rounded-[12px] bg-white text-orange-600 shadow-sm text-[13px] font-black whitespace-nowrap transition-colors" data-testid="filter-newest">
                      {m("newest")}
                    </button>
                    <button disabled title={m("unavailable")} aria-label={m("unavailable")} data-testid="filter-popular-disabled" className="px-4 py-1.5 rounded-[12px] text-slate-500 text-[13px] font-bold opacity-60 cursor-not-allowed whitespace-nowrap transition-colors">
                      {m("mostEngaging")}
                    </button>
                    <button disabled title={m("unavailable")} aria-label={m("unavailable")} data-testid="filter-unanswered-disabled" className="px-4 py-1.5 rounded-[12px] text-slate-500 text-[13px] font-bold opacity-60 cursor-not-allowed whitespace-nowrap transition-colors">
                      {m("unanswered")}
                    </button>
                  </div>
                  {canPost && (
                    <Button
                      className="hidden sm:flex shrink-0 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black h-10 px-4 shadow-sm transition-all active:scale-[0.98]"
                      onClick={handleComposerClick}
                      data-testid="button-new-post-header"
                    >
                      <Plus className="w-4 h-4 ml-1.5" /> {m("newPost")}
                    </Button>
                  )}
                </div>

                {/* Inline Create Post Card */}
                {canPost ? (
                  <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm transition-shadow hover:shadow-md">
                    <div
                      className="flex items-center gap-3 mb-3 cursor-text group"
                      onClick={handleComposerClick}
                      data-testid="input-inline-create-post"
                    >
                      {user?.profileImageUrl && !composerAvatarFailed ? (
                        <img
                          src={user.profileImageUrl}
                          alt=""
                          onError={() => setComposerAvatarFailed(true)}
                          className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm ring-1 ring-slate-100"
                          data-testid="img-avatar-composer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm text-slate-400 font-black text-lg ring-1 ring-slate-100" data-testid="div-avatar-placeholder-composer">
                          {user?.username?.trim().charAt(0).toUpperCase() || <Users className="w-5 h-5" />}
                        </div>
                      )}
                      <div className="flex-1 bg-slate-50 group-hover:bg-slate-100 transition-colors border border-slate-200 rounded-2xl px-4 py-2.5 text-[14px] text-slate-500 font-bold text-start truncate">
                        {m("shareQuestion")}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 px-1 lg:px-14 border-t border-slate-100 pt-3 flex-wrap">
                      <button onClick={handleComposerClick} data-testid="button-inline-image" className="flex items-center gap-1.5 text-[13px] font-black text-slate-600 hover:text-orange-600 transition-colors">
                        <ImageIcon className="w-4 h-4 text-emerald-500" /> {m("image")}
                      </button>
                      <button onClick={handleComposerClick} data-testid="button-inline-video" className="flex items-center gap-1.5 text-[13px] font-black text-slate-600 hover:text-orange-600 transition-colors">
                        <Video className="w-4 h-4 text-slate-400" /> {m("video")}
                      </button>
                      <button onClick={handleComposerClick} data-testid="button-inline-file" className="flex items-center gap-1.5 text-[13px] font-black text-slate-600 hover:text-orange-600 transition-colors">
                        <FileText className="w-4 h-4 text-slate-400" /> {m("file")}
                      </button>
                      <button onClick={handleComposerClick} data-testid="button-inline-poll" className="flex items-center gap-1.5 text-[13px] font-black text-slate-600 hover:text-orange-600 transition-colors">
                        <BarChart2 className="w-4 h-4 text-slate-400" /> {m("poll")}
                      </button>
                    </div>
                  </div>
                ) : user ? null : (
                  <Link href="/login">
                    <div className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-[14px] font-black text-slate-600 shadow-sm transition-shadow hover:shadow-md" data-testid="button-login-to-post">
                      {m("loginToPost")}
                    </div>
                  </Link>
                )}

                {/* Posts Feed */}
                {isLoading ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
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
                  <div className="rounded-[24px] border-2 border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
                    <MessageCircle className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="font-black text-slate-800 text-lg">{m("noPosts")}</p>
                    <p className="mt-2 text-[14px] font-medium text-slate-500 mb-6 max-w-xs mx-auto">
                      {canPost ? m("firstDiscussion") : m("comeBack")}
                    </p>
                    {canPost && (
                      <Button onClick={handleComposerClick} data-testid="button-create-post-empty" className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black h-10 px-6 shadow-sm active:scale-[0.98] transition-all">
                        {m("createFirstPost")}
                      </Button>
                    )}
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
                  <div className="mt-6 flex justify-center pb-12">
                    <Button
                      variant="outline"
                      className="rounded-xl h-10 px-8 font-black text-slate-600 border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      data-testid="button-load-more"
                    >
                      {isFetchingNextPage ? (
                        <>
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          {m("loading")}
                        </>
                      ) : (
                        m("loadMore")
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <CommunitySubscriberGate />
            )}
          </div>

          {/* RIGHT SIDEBAR (Desktop) */}
          <div className="md:order-2 md:col-span-4 lg:order-3 lg:col-span-3 space-y-5 flex flex-col mt-4 md:mt-0 lg:sticky lg:top-24">
            {hasCommunityAccess ? (
              <>
                {/* About Community */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="font-black text-[15px] text-slate-900 mb-2">{m("communityAbout")}</h3>
                  <p className="text-[13px] text-slate-500 leading-relaxed mb-5 font-medium">
                    {m("communityAboutText")}
                  </p>
                  <div className="grid grid-cols-2 gap-y-5 gap-x-3">
                    <div>
                      <div className="text-[20px] font-black text-slate-900 drop-shadow-sm" data-testid="text-stat-members">{summary?.memberCount?.toLocaleString(locale) || 0}</div>
                      <div className="text-[11px] text-slate-500 font-bold mt-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-400" /> {m("members")}</div>
                    </div>
                    <div>
                      <div className="text-[20px] font-black text-slate-900 drop-shadow-sm" data-testid="text-stat-topics">{summary?.totalPostsCount?.toLocaleString(locale) || 0}</div>
                      <div className="text-[11px] text-slate-500 font-bold mt-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-400" /> {m("topics")}</div>
                    </div>
                    <div className="col-span-2 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm text-orange-500"><MessageCircle className="w-3.5 h-3.5" /></div>
                          <span className="text-[12px] text-slate-600 font-bold">{m("weeklyPosts")}</span>
                        </div>
                        <div className="text-[16px] font-black text-slate-900" data-testid="text-stat-weekly">{summary?.weeklyPostsCount?.toLocaleString(locale) || 0}</div>
                      </div>
                      {summary?.activityThisWeek && summary.activityThisWeek.length > 0 && (
                        <div className="flex items-end justify-between h-8 gap-1 mt-2">
                          {summary.activityThisWeek.slice(-7).map((day, i) => {
                            const max = Math.max(...summary.activityThisWeek.map(d => d.count), 1);
                            const height = Math.max((day.count / max) * 100, 10);
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div className="w-full bg-orange-200/50 rounded-sm relative overflow-hidden group-hover:bg-orange-300 transition-colors" style={{ height: '32px' }}>
                                  <div className="absolute bottom-0 left-0 right-0 bg-orange-500 rounded-sm transition-all" style={{ height: `${height}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="font-black text-[15px] text-slate-900 mb-3">{m("latestActivity")}</h3>
                  <div className="space-y-2">
                    {summary?.latestPost ? (
                      <a href={`#post-${summary.latestPost.id}`} className="block rounded-2xl bg-slate-50 p-3 hover:bg-orange-50 transition-colors">
                        <span className="block text-[10px] font-black text-orange-600 mb-0.5">{m("latestPost")}</span>
                        <span className="block text-[12px] font-bold text-slate-700 line-clamp-2">{summary.latestPost.label}</span>
                      </a>
                    ) : <p className="text-[12px] font-bold text-slate-400">{m("noPosts")}</p>}
                    {summary?.latestSolution ? (
                      <a href={`#post-${summary.latestSolution.id}`} className="block rounded-2xl bg-emerald-50 p-3 hover:bg-emerald-100 transition-colors">
                        <span className="block text-[10px] font-black text-emerald-700 mb-0.5">{m("latestSolution")}</span>
                        <span className="block text-[12px] font-bold text-slate-700 line-clamp-2">{summary.latestSolution.label}</span>
                      </a>
                    ) : <p className="text-[12px] font-bold text-slate-400">{m("noMarkedSolutions")}</p>}
                  </div>
                </div>

                {/* Trending Topics */}
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="font-black text-[15px] text-slate-900 mb-3 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-orange-500" />
                    {m("trending")}
                  </h3>
                  {summary?.trendingPosts && summary.trendingPosts.length > 0 ? (
                    <div className="space-y-3">
                      {summary.trendingPosts.map(post => (
                        <a key={post.id} href={`#post-${post.id}`} className="group block">
                          <h4 className="text-[13px] font-black text-slate-800 group-hover:text-orange-600 transition-colors line-clamp-2 leading-tight">
                            {post.title || post.content || m("untitled")}
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] font-bold text-slate-400">
                            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post.commentsCount || 0}</span>
                            <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {post.likesCount || 0}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2 border border-slate-100">
                        <BarChart2 className="w-4 h-4 text-slate-300" />
                      </div>
                      <span className="text-[12px] font-bold text-slate-400">{m("noTrending")}</span>
                    </div>
                  )}
                </div>

                {/* Unanswered Question */}
                {summary?.unansweredQuestion && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl border border-blue-100 p-5 shadow-sm">
                    <h3 className="font-black text-[15px] text-blue-900 mb-2 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-blue-500" />
                      {m("waitingHelp")}
                    </h3>
                    <a href={`#post-${summary.unansweredQuestion.id}`} className="block group">
                      <h4 className="text-[13px] font-black text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2 leading-tight">
                        {summary.unansweredQuestion.title || summary.unansweredQuestion.content || m("untitled")}
                      </h4>
                      <span className="inline-block mt-2 px-2.5 py-1 bg-white rounded-lg text-[11px] font-bold text-blue-600 shadow-sm">
                        {m("beFirstToAnswer")}
                      </span>
                    </a>
                  </div>
                )}
              </>
            ) : (
              <CommunityPublicAbout />
            )}
          </div>
        </div>
      </div>

      {hasCommunityAccess && (
        <>
          <CreatePostDialog open={createOpen} onOpenChange={setCreateOpen} />
          <ProfilePictureModal
            open={avatarOpen}
            onOpenChange={setAvatarOpen}
            onSaved={() => {
              refetchSummary();
              setCreateOpen(true);
            }}
          />
        </>
      )}
    </div>
  );
}
