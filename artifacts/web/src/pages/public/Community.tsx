import { useEffect, useState } from "react";
import { Link } from "wouter";
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
import {
  Users, MessageCircle, Wrench, Shield, CheckCircle,
  Search, LayoutGrid, HelpCircle, Smartphone, Unlock,
  Cpu, Code, Bell, Plus, Image as ImageIcon, Video,
  FileText, BarChart2, Loader2
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

export function Community() {
  const { user, getAuthHeaders } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [composerAvatarFailed, setComposerAvatarFailed] = useState(false);

  useEffect(() => {
    setComposerAvatarFailed(false);
  }, [user?.profileImageUrl]);

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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-start">

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
          <div className="md:order-1 md:col-span-8 lg:order-2 lg:col-span-6 space-y-6">

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
              <div className="space-y-6">
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
              <div className="space-y-6">
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
          </div>

          {/* RIGHT SIDEBAR (Desktop) */}
          <div className="md:order-2 md:col-span-4 lg:order-3 lg:col-span-3 space-y-5 flex flex-col mt-4 md:mt-0 lg:sticky lg:top-24">

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
                    <div className="col-span-2 bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm text-orange-500"><MessageCircle className="w-4 h-4" /></div>
                           <span className="text-[13px] text-slate-600 font-bold">منشورات اليوم</span>
                        </div>
                        <div className="text-[18px] font-black text-slate-900" data-testid="text-stat-today">{summary?.todayPostsCount?.toLocaleString("ar") || 0}</div>
                    </div>
                </div>
             </div>

             {/* Active Members - Empty State */}
             <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-black text-[16px] text-slate-900 mb-4">الأعضاء النشطون</h3>
                <div className="flex flex-col items-center justify-center py-6 text-center">
                   <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                     <Users className="w-5 h-5 text-slate-300" />
                   </div>
                   <span className="text-[14px] font-bold text-slate-400">لا تتوفر بيانات حالياً</span>
                </div>
             </div>

             {/* Trending Topics - Empty State */}
             <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-black text-[16px] text-slate-900 mb-4">المواضيع الشائعة</h3>
                <div className="flex flex-col items-center justify-center py-6 text-center">
                   <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                     <BarChart2 className="w-5 h-5 text-slate-300" />
                   </div>
                   <span className="text-[14px] font-bold text-slate-400">لا توجد مواضيع شائعة اليوم</span>
                </div>
             </div>
          </div>

        </div>
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
