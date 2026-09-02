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

const PAGE_SIZE = 10;

const CATEGORIES = [
  { id: "all", label: "الكل", icon: LayoutGrid, active: true },
  { id: "help", label: "مساعدة عامة", icon: HelpCircle },
  { id: "iphone", label: "iPhone", icon: Smartphone },
  { id: "android", label: "Android", icon: Smartphone },
  { id: "frp", label: "FRP & Unlock", icon: Unlock },
  { id: "hw", label: "Hardware", icon: Cpu },
  { id: "sw", label: "Software", icon: Code },
  { id: "tools", label: "Tools & برامج", icon: Wrench },
  { id: "solved", label: "حلول وتم حلها", icon: CheckCircle },
  { id: "news", label: "أخبار وتحديثات", icon: Bell },
];

function CommunitySubscriberGate() {
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
            مجتمع GAB مخصص للمشتركين
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] font-medium leading-6 text-slate-600 sm:mt-3 sm:text-[14px] sm:leading-7">
            انضم إلى مجتمع الطلبة والمحترفين، شارك أسئلتك واستفد من الحلول والتجارب الحقيقية لأعضاء GAB.
          </p>
          <Link href="/subscribe">
            <Button className="mt-4 h-11 w-full rounded-2xl bg-orange-500 text-[14px] font-black text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 sm:mt-6 sm:h-12 sm:text-[15px]">
              عرض الاشتراكات
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CommunityPublicAbout() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-3 text-[16px] font-black text-slate-900">حول المجتمع</h3>
      <p className="text-[14px] font-medium leading-relaxed text-slate-500">
        مساحة مخصصة لأعضاء GAB لمشاركة الخبرات، طرح الأسئلة، وإيجاد الحلول للمشاكل التقنية.
      </p>
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <p className="text-[12px] font-bold leading-5 text-slate-600">
          تفاصيل الأعضاء والنشاط متاحة للمشتركين فقط.
        </p>
      </div>
    </div>
  );
}

export function Community() {
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
    <div className="min-h-screen bg-[#F8FAFC] pb-16" dir="rtl">
      {/* HERO SECTION */}
      <div className="container mx-auto px-4 mt-6 max-w-[1450px]">
        <div className="bg-[#0F172A] rounded-[32px] border border-slate-800 relative overflow-hidden shadow-xl mb-8">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/20 via-[#0F172A]/80 to-[#0F172A] opacity-100" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
          />

          <div className="relative z-10 px-6 py-10 md:py-12 flex flex-col items-center text-center">
              <h1 className="text-3xl md:text-[40px] font-black text-white mb-4 tracking-tight drop-shadow-sm leading-tight">GAB Community</h1>
              <p className="text-slate-300 text-sm md:text-[16px] mb-8 font-medium max-w-lg">مجتمع طلبة ومحترفي صيانة وبرمجة الهواتف</p>

              <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-slate-200 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-md">
                    <MessageCircle className="w-4 h-4 text-orange-400" /> تفاعل ونقاش مفيد
                  </span>
                  <span className="flex items-center gap-2 text-[13px] font-bold text-slate-200 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-md">
                    <Shield className="w-4 h-4 text-emerald-400" /> حلول عملية
                  </span>
                  <span className="flex items-center gap-2 text-[13px] font-bold text-slate-200 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-md">
                    <Users className="w-4 h-4 text-blue-400" /> مساعدة متبادلة
                  </span>
                  <span className="flex items-center gap-2 text-[13px] font-bold text-slate-200 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-md">
                    <Wrench className="w-4 h-4 text-purple-400" /> تطوير مستمر
                  </span>
              </div>
          </div>
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
              title="هذا القسم للعرض فقط"
              aria-label={`قسم ${c.label} (للعرض فقط)`}
              data-testid={`button-category-mobile-${c.id}`}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-not-allowed opacity-90 ${
                c.active
                  ? 'bg-orange-50 border-orange-200 text-orange-600'
                  : 'bg-white border-border text-slate-600'
              }`}
            >
              <c.icon className="w-4 h-4" />
              {c.label}
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
                placeholder="ابحث في المجتمع..."
                disabled
                title="ميزة البحث غير متوفرة حالياً"
                aria-label="البحث غير متوفر حالياً"
                data-testid="input-search-community"
                className="w-full h-12 bg-white border border-slate-200 rounded-2xl pr-12 pl-4 text-[15px] font-medium focus:outline-none opacity-90 cursor-not-allowed shadow-sm text-slate-600 placeholder:text-slate-400 transition-shadow"
              />
            </div>

            {/* Categories Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-black text-[16px] text-slate-900 mb-4 px-2">الأقسام</h3>
              <div className="space-y-1">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    disabled
                    title="هذا القسم للعرض فقط"
                    aria-label={`قسم ${c.label} (للعرض فقط)`}
                    data-testid={`button-category-desktop-${c.id}`}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl text-[14px] transition-colors cursor-not-allowed opacity-90 ${
                      c.active
                        ? 'bg-orange-50 text-orange-600 font-black'
                        : 'text-slate-600 bg-transparent font-semibold hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <c.icon className={`w-5 h-5 ${c.active ? 'text-orange-500' : 'text-slate-400'}`} />
                      {c.label}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 pt-5 border-t border-slate-100">
                <button
                  disabled
                  title="هذا القسم للعرض فقط"
                  aria-label="عرض جميع الأقسام (غير متوفر)"
                  data-testid="button-all-categories-disabled"
                  className="w-full flex items-center justify-center gap-2 py-2 text-[13px] font-bold text-slate-400 cursor-not-allowed hover:text-slate-500 transition-colors"
                >
                  <LayoutGrid className="w-4 h-4" />
                  عرض جميع الأقسام
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
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <button className="px-5 py-2.5 rounded-2xl bg-orange-50 text-orange-600 text-[14px] font-black whitespace-nowrap transition-colors" data-testid="filter-newest">الأحدث</button>
                  <button disabled title="غير متوفر حالياً" aria-label="فلتر الأكثر تفاعلاً غير متوفر" data-testid="filter-popular-disabled" className="px-5 py-2.5 rounded-2xl text-slate-500 text-[14px] font-bold opacity-60 cursor-not-allowed whitespace-nowrap transition-colors hover:bg-slate-50">الأكثر تفاعلاً</button>
                  <button disabled title="غير متوفر حالياً" aria-label="فلتر بدون إجابة غير متوفر" data-testid="filter-unanswered-disabled" className="px-5 py-2.5 rounded-2xl text-slate-500 text-[14px] font-bold opacity-60 cursor-not-allowed whitespace-nowrap transition-colors hover:bg-slate-50">بدون إجابة</button>
                  <button disabled title="غير متوفر حالياً" aria-label="فلتر المحفوظات غير متوفر" data-testid="filter-saved-disabled" className="px-5 py-2.5 rounded-2xl text-slate-500 text-[14px] font-bold opacity-60 cursor-not-allowed whitespace-nowrap transition-colors hover:bg-slate-50">المحفوظات</button>
              </div>
              {canPost && (
                <Button
                  className="hidden sm:flex shrink-0 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black h-11 px-5 shadow-sm shadow-orange-500/20 transition-all active:scale-[0.98]"
                  onClick={handleComposerClick}
                  data-testid="button-new-post-header"
                >
                    <Plus className="w-4 h-4 ml-1.5" /> منشور جديد
                </Button>
              )}
            </div>

            {/* Inline Create Post Card */}
            {canPost ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div
                    className="flex items-center gap-4 mb-4 cursor-text group"
                    onClick={handleComposerClick}
                    data-testid="input-inline-create-post"
                  >
                      {user?.profileImageUrl && !composerAvatarFailed ? (
                        <img
                          src={user.profileImageUrl}
                          alt=""
                          onError={() => setComposerAvatarFailed(true)}
                          className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-white ring-1 ring-slate-100 shadow-sm"
                          data-testid="img-avatar-composer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-white ring-1 ring-slate-100 shadow-sm text-slate-400 font-black text-[18px]" data-testid="div-avatar-placeholder-composer">
                          {user?.username?.trim().charAt(0).toUpperCase() || <Users className="w-5 h-5" />}
                        </div>
                      )}
                      <div className="flex-1 bg-slate-50 group-hover:bg-slate-100 transition-colors border border-slate-200 rounded-2xl px-5 py-3.5 text-[15px] text-slate-500 font-bold">
                          شارك سؤالاً أو فكرة مع أعضاء المجتمع...
                      </div>
                  </div>
                  <div className="flex items-center gap-6 px-2 sm:px-16 border-t border-slate-100 pt-4">
                      <button onClick={handleComposerClick} data-testid="button-inline-image" className="flex items-center gap-2 text-[14px] font-black text-slate-600 hover:text-orange-600 transition-colors">
                        <ImageIcon className="w-5 h-5 text-emerald-500"/> صورة
                      </button>
                      <button disabled title="ميزة الفيديو غير متوفرة حالياً" aria-label="فيديو غير متوفر" data-testid="button-inline-video-disabled" className="flex items-center gap-2 text-[14px] font-black text-slate-400 cursor-not-allowed opacity-70">
                        <Video className="w-5 h-5 text-blue-400"/> فيديو
                      </button>
                      <button disabled title="ميزة الملفات غير متوفرة حالياً" aria-label="ملف غير متوفر" data-testid="button-inline-file-disabled" className="flex items-center gap-2 text-[14px] font-black text-slate-400 cursor-not-allowed opacity-70">
                        <FileText className="w-5 h-5 text-purple-400"/> ملف
                      </button>
                      <button disabled title="ميزة الاستطلاع غير متوفرة حالياً" aria-label="استطلاع غير متوفر" data-testid="button-inline-poll-disabled" className="flex items-center gap-2 text-[14px] font-black text-slate-400 cursor-not-allowed opacity-70">
                        <BarChart2 className="w-5 h-5 text-amber-400"/> استطلاع
                      </button>
                  </div>
              </div>
            ) : user ? null : (
              <Link href="/login">
                <div className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white px-5 py-5 text-[15px] font-black text-slate-600 shadow-sm transition-shadow hover:shadow-md" data-testid="button-login-to-post">
                  سجّل الدخول للمشاركة في GAB Community
                </div>
              </Link>
            )}

            {/* Posts Feed */}
            {isLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="mt-5 h-4 w-full" />
                    <Skeleton className="mt-3 h-4 w-2/3" />
                    <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-[24px] border-2 border-dashed border-slate-200 bg-white py-20 text-center shadow-sm">
                <MessageCircle className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                <p className="font-black text-slate-800 text-xl">لا توجد منشورات بعد</p>
                <p className="mt-2 text-[15px] font-medium text-slate-500 mb-8 max-w-sm mx-auto">
                  {canPost ? "كن أول من يبدأ النقاش ويشارك خبراته في مجتمع GAB" : "عُد قريباً لمتابعة جديد Community GAB"}
                </p>
                {canPost && (
                  <Button onClick={handleComposerClick} data-testid="button-create-post-empty" className="rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black h-12 px-8 shadow-sm shadow-orange-500/20 active:scale-[0.98] transition-all">
                    إنشاء أول منشور
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
              <div className="mt-8 flex justify-center pb-12">
                <Button
                  variant="outline"
                  className="rounded-2xl h-12 px-10 font-black text-slate-600 border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  data-testid="button-load-more"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                      جارٍ التحميل…
                    </>
                  ) : (
                    "تحميل المزيد"
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
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-black text-[16px] text-slate-900 mb-3">حول المجتمع</h3>
                <p className="text-[14px] text-slate-500 leading-relaxed mb-6 font-medium">
                  مساحة مخصصة لأعضاء GAB لمشاركة الخبرات، طرح الأسئلة، وإيجاد الحلول للمشاكل التقنية.
                </p>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                        <div className="text-[22px] font-black text-slate-900 drop-shadow-sm" data-testid="text-stat-members">{summary?.memberCount?.toLocaleString("ar") || 0}</div>
                        <div className="text-[12px] text-slate-500 font-bold mt-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-400"/> أعضاء</div>
                    </div>
                    <div>
                        <div className="text-[22px] font-black text-slate-900 drop-shadow-sm" data-testid="text-stat-topics">{summary?.totalPostsCount?.toLocaleString("ar") || 0}</div>
                        <div className="text-[12px] text-slate-500 font-bold mt-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-400"/> المواضيع</div>
                    </div>
                    <div className="col-span-2 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm text-orange-500"><MessageCircle className="w-4 h-4" /></div>
                             <span className="text-[13px] text-slate-600 font-bold">منشورات الأسبوع</span>
                          </div>
                          <div className="text-[18px] font-black text-slate-900" data-testid="text-stat-weekly">{summary?.weeklyPostsCount?.toLocaleString("ar") || 0}</div>
                        </div>
                        {summary?.activityThisWeek && summary.activityThisWeek.length > 0 && (
                          <div className="flex items-end justify-between h-10 gap-1 mt-2">
                             {summary.activityThisWeek.slice(-7).map((day, i) => {
                               const max = Math.max(...summary.activityThisWeek.map(d => d.count), 1);
                               const height = Math.max((day.count / max) * 100, 10); // min 10% height
                               return (
                                 <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                   <div className="w-full bg-orange-200/50 rounded-sm relative overflow-hidden group-hover:bg-orange-300 transition-colors" style={{ height: '40px' }}>
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

             <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
               <h3 className="font-black text-[16px] text-slate-900 mb-4">آخر النشاطات</h3>
               <div className="space-y-3">
                 {summary?.latestPost ? (
                   <a href={`#post-${summary.latestPost.id}`} className="block rounded-2xl bg-slate-50 p-3 hover:bg-orange-50 transition-colors">
                     <span className="block text-[11px] font-black text-orange-600 mb-1">آخر منشور</span>
                     <span className="block text-[13px] font-bold text-slate-700 line-clamp-2">{summary.latestPost.label}</span>
                   </a>
                 ) : <p className="text-[13px] font-bold text-slate-400">لا توجد منشورات بعد</p>}
                 {summary?.latestSolution ? (
                   <a href={`#post-${summary.latestSolution.id}`} className="block rounded-2xl bg-emerald-50 p-3 hover:bg-emerald-100 transition-colors">
                     <span className="block text-[11px] font-black text-emerald-700 mb-1">آخر حل</span>
                     <span className="block text-[13px] font-bold text-slate-700 line-clamp-2">{summary.latestSolution.label}</span>
                   </a>
                 ) : <p className="text-[13px] font-bold text-slate-400">لا توجد حلول معلّمة بعد</p>}
               </div>
             </div>

             {/* Trending Topics */}
             <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-black text-[16px] text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-orange-500" />
                  المواضيع الشائعة
                </h3>
                {summary?.trendingPosts && summary.trendingPosts.length > 0 ? (
                  <div className="space-y-4">
                    {summary.trendingPosts.map(post => (
                      <a key={post.id} href={`#post-${post.id}`} className="group block">
                        <h4 className="text-[14px] font-black text-slate-800 group-hover:text-orange-600 transition-colors line-clamp-2 leading-tight">
                          {post.title || post.content || "بدون عنوان"}
                        </h4>
                        <div className="flex items-center gap-3 mt-2 text-[12px] font-bold text-slate-400">
                          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {post.commentsCount || 0}</span>
                          <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> {post.likesCount || 0}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                     <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                       <BarChart2 className="w-5 h-5 text-slate-300" />
                     </div>
                     <span className="text-[14px] font-bold text-slate-400">لا توجد مواضيع شائعة حالياً</span>
                  </div>
                )}
             </div>

             {/* Unanswered Question */}
             {summary?.unansweredQuestion && (
               <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl border border-blue-100 p-6 shadow-sm">
                  <h3 className="font-black text-[16px] text-blue-900 mb-3 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-blue-500" />
                    بانتظار المساعدة
                  </h3>
                  <a href={`#post-${summary.unansweredQuestion.id}`} className="block group">
                    <h4 className="text-[14px] font-black text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2 leading-tight">
                      {summary.unansweredQuestion.title || summary.unansweredQuestion.content || "سؤال بدون عنوان"}
                    </h4>
                    <span className="inline-block mt-3 px-3 py-1 bg-white rounded-lg text-[12px] font-bold text-blue-600 shadow-sm">
                      كن أول من يجيب
                    </span>
                  </a>
               </div>
             )}

             {/* Most Active Category */}
             {summary?.mostActiveCategory && (
               <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
                 <div className="flex flex-col">
                   <span className="text-[13px] font-bold text-slate-500">القسم الأنشط</span>
                    <span className="text-[15px] font-black text-slate-900 mt-0.5">
                      {CATEGORIES.find((category) => category.id === summary.mostActiveCategory?.category)?.label
                        || summary.mostActiveCategory.category}
                    </span>
                 </div>
                 <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 font-black text-[14px]">
                   {summary.mostActiveCategory.postsCount}
                 </div>
               </div>
             )}

             {/* Active Members */}
             <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-black text-[16px] text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-500" />
                  الأعضاء النشطون
                </h3>
                {summary?.activeMembers && summary.activeMembers.length > 0 ? (
                  <div className="space-y-4">
                    {summary.activeMembers.map((member, idx) => (
                      <div key={member.id} className="flex items-center gap-3">
                        <div className="relative">
                          {member.profileImageUrl ? (
                            <img src={member.profileImageUrl} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-100" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-black text-sm shadow-sm border border-white ring-1 ring-slate-100">
                              {member.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {idx < 3 && (
                            <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white border-2 border-white ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : 'bg-orange-300'}`}>
                              {idx + 1}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[14px] font-black text-slate-900 truncate">{member.username}</span>
                            {member.role === 'admin' ? (
                               <Shield className="w-3.5 h-3.5 text-red-500" />
                            ) : member.role === 'formateur' ? (
                               <Shield className="w-3.5 h-3.5 text-emerald-500" />
                            ) : member.accountType === 'vip' ? (
                               <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-50" />
                            ) : null}
                          </div>
                          <span className="text-[12px] font-bold text-slate-400 block truncate">
                            {member.postsCount} مشاركة
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                     <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                       <Users className="w-5 h-5 text-slate-300" />
                     </div>
                     <span className="text-[14px] font-bold text-slate-400">لا تتوفر بيانات حالياً</span>
                  </div>
                )}
             </div>
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
