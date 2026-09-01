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
import {
  Users, MessageCircle, Wrench, Shield, CheckCircle,
  Search, LayoutGrid, HelpCircle, Smartphone, Unlock,
  Cpu, Code, Bell, Plus, Image as ImageIcon, Video,
  FileText, BarChart2, Loader2, Camera
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
      <div className="bg-[#0A0F1C] border-b border-border/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-500/15 via-transparent to-transparent opacity-70" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }}
        />

        <div className="container mx-auto px-4 py-8 relative z-10 text-center max-w-4xl">
            <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">GAB Community</h1>
            <p className="text-slate-400 text-sm mb-6">مجتمع طلبة ومحترفي صيانة وبرمجة الهواتف</p>

            <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
                  <MessageCircle className="w-3.5 h-3.5 text-orange-400" /> تفاعل ونقاش مفيد
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" /> حلول عملية
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
                  <Users className="w-3.5 h-3.5 text-blue-400" /> مساعدة متبادلة
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
                  <Wrench className="w-3.5 h-3.5 text-purple-400" /> تطوير مستمر
                </span>
            </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="container mx-auto px-4 mt-6 max-w-[1200px]">

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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">

          {/* LEFT SIDEBAR (Desktop) */}
          <div className="hidden lg:order-3 lg:block lg:col-span-3 space-y-4 sticky top-20">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="ابحث في المجتمع..."
                disabled
                title="ميزة البحث غير متوفرة حالياً"
                aria-label="البحث غير متوفر حالياً"
                data-testid="input-search-community"
                className="w-full h-11 bg-slate-50 border border-border rounded-xl pr-10 pl-4 text-sm focus:outline-none opacity-80 cursor-not-allowed shadow-sm"
              />
            </div>

            {/* Categories Card */}
            <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
              <h3 className="font-bold text-sm text-slate-900 mb-3 px-2">الأقسام</h3>
              <div className="space-y-0.5">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    disabled
                    title="هذا القسم للعرض فقط"
                    aria-label={`قسم ${c.label} (للعرض فقط)`}
                    data-testid={`button-category-desktop-${c.id}`}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors cursor-not-allowed opacity-90 ${
                      c.active
                        ? 'bg-orange-50 text-orange-600 font-bold'
                        : 'text-slate-600 bg-transparent font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <c.icon className={`w-4 h-4 ${c.active ? 'text-orange-500' : 'text-slate-400'}`} />
                      {c.label}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border/60">
                <button
                  disabled
                  title="هذا القسم للعرض فقط"
                  aria-label="عرض جميع الأقسام (غير متوفر)"
                  data-testid="button-all-categories-disabled"
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed"
                >
                  <LayoutGrid className="w-4 h-4" />
                  عرض جميع الأقسام
                </button>
              </div>
            </div>
          </div>

          {/* CENTER FEED */}
          <div className="md:order-1 md:col-span-8 lg:order-2 lg:col-span-6 space-y-4">

            {/* Top Filters & New Post Action */}
            <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-border shadow-sm">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  <button className="px-4 py-2 rounded-xl bg-orange-50 text-orange-600 text-sm font-bold whitespace-nowrap" data-testid="filter-newest">الأحدث</button>
                  <button disabled title="غير متوفر حالياً" aria-label="فلتر الأكثر تفاعلاً غير متوفر" data-testid="filter-popular-disabled" className="px-4 py-2 rounded-xl text-slate-500 text-sm font-medium opacity-60 cursor-not-allowed whitespace-nowrap">الأكثر تفاعلاً</button>
                  <button disabled title="غير متوفر حالياً" aria-label="فلتر بدون إجابة غير متوفر" data-testid="filter-unanswered-disabled" className="px-4 py-2 rounded-xl text-slate-500 text-sm font-medium opacity-60 cursor-not-allowed whitespace-nowrap">بدون إجابة</button>
                  <button disabled title="غير متوفر حالياً" aria-label="فلتر المحفوظات غير متوفر" data-testid="filter-saved-disabled" className="px-4 py-2 rounded-xl text-slate-500 text-sm font-medium opacity-60 cursor-not-allowed whitespace-nowrap">المحفوظات</button>
              </div>
              {canPost && (
                <Button
                  className="hidden sm:flex shrink-0 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold"
                  onClick={handleComposerClick}
                  data-testid="button-new-post-header"
                >
                    <Plus className="w-4 h-4 ml-1" /> منشور جديد
                </Button>
              )}
            </div>

            {/* Inline Create Post Card */}
            {canPost ? (
              <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
                  <div
                    className="flex items-center gap-3 mb-3 cursor-text group"
                    onClick={handleComposerClick}
                    data-testid="input-inline-create-post"
                  >
                      {user?.profileImageUrl ? (
                        <img src={user.profileImageUrl} alt="Avatar" className="w-10 h-10 rounded-full object-cover shrink-0" data-testid="img-avatar-composer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-400" data-testid="div-avatar-placeholder-composer">
                          <Users className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 bg-slate-50 group-hover:bg-slate-100 transition-colors border border-slate-200 rounded-full px-4 py-2.5 text-sm text-slate-500">
                          شارك سؤالاً أو فكرة مع أعضاء المجتمع...
                      </div>
                  </div>
                  <div className="flex items-center gap-4 px-2 sm:px-14">
                      <button onClick={handleComposerClick} data-testid="button-inline-image" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                        <ImageIcon className="w-4 h-4 text-emerald-500"/> صورة
                      </button>
                      <button disabled title="ميزة الفيديو غير متوفرة حالياً" aria-label="فيديو غير متوفر" data-testid="button-inline-video-disabled" className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed">
                        <Video className="w-4 h-4 text-slate-300"/> فيديو
                      </button>
                      <button disabled title="ميزة الملفات غير متوفرة حالياً" aria-label="ملف غير متوفر" data-testid="button-inline-file-disabled" className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed">
                        <FileText className="w-4 h-4 text-slate-300"/> ملف
                      </button>
                      <button disabled title="ميزة الاستطلاع غير متوفرة حالياً" aria-label="استطلاع غير متوفر" data-testid="button-inline-poll-disabled" className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed">
                        <BarChart2 className="w-4 h-4 text-slate-300"/> استطلاع
                      </button>
                  </div>
              </div>
            ) : user ? null : (
              <Link href="/login">
                <div className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm transition-shadow hover:shadow-md" data-testid="button-login-to-post">
                  سجّل الدخول للمشاركة في GAB Community
                </div>
              </Link>
            )}

            {/* Posts Feed */}
            {isLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2.5 w-20" />
                      </div>
                    </div>
                    <Skeleton className="mt-4 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-2/3" />
                    <Skeleton className="mt-4 h-48 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white py-16 text-center shadow-sm">
                <MessageCircle className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="font-bold text-slate-800 text-lg">لا توجد منشورات بعد</p>
                <p className="mt-1 text-sm text-slate-500 mb-6">
                  {canPost ? "كن أول من يبدأ النقاش في مجتمع GAB" : "عُد قريباً لمتابعة جديد Community GAB"}
                </p>
                {canPost && (
                  <Button onClick={handleComposerClick} data-testid="button-create-post-empty" className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold">
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
              <div className="mt-6 flex justify-center pb-8">
                <Button
                  variant="outline"
                  className="rounded-xl px-8 font-bold text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  data-testid="button-load-more"
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

          {/* RIGHT SIDEBAR (Desktop & Mobile at bottom) */}
          <div className="md:order-2 md:col-span-4 lg:order-1 lg:col-span-3 space-y-4 flex flex-col mt-4 md:mt-0 sticky lg:top-20">

             {/* Trending Tags (Static) */}
             <div className="order-2 bg-white rounded-2xl border border-border p-5 shadow-sm">
                <h3 className="font-bold text-sm text-slate-900 mb-4">مواضيع مقترحة</h3>
                <div className="flex flex-wrap gap-2">
                    {["#iPhone", "#FRP", "#Android", "#Bypass", "#iOS16", "#Samsung"].map(tag => (
                       <span key={tag} data-testid={`tag-${tag}`} className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[13px] font-medium text-slate-600">
                        {tag}
                      </span>
                    ))}
                </div>
             </div>

             {/* About Community */}
              <div className="order-1 bg-white rounded-2xl border border-border p-5 shadow-sm">
                <h3 className="font-bold text-sm text-slate-900 mb-2">حول المجتمع</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed mb-5">
                  مساحة مخصصة لأعضاء GAB لمشاركة الخبرات، طرح الأسئلة، و إيجاد الحلول للمشاكل التقنية.
                </p>
                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                    <div>
                        <div className="text-xl font-extrabold text-slate-900" data-testid="text-stat-members">{summary?.memberCount?.toLocaleString("ar") || 0}</div>
                        <div className="text-[11px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1"><Users className="w-3 h-3"/> أعضاء</div>
                    </div>
                    <div>
                        <div className="text-xl font-extrabold text-slate-900" data-testid="text-stat-topics">{summary?.totalPostsCount?.toLocaleString("ar") || 0}</div>
                        <div className="text-[11px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1"><FileText className="w-3 h-3"/> المواضيع</div>
                    </div>
                    <div>
                        <div className="text-xl font-extrabold text-slate-900" data-testid="text-stat-today">{summary?.todayPostsCount?.toLocaleString("ar") || 0}</div>
                        <div className="text-[11px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1"><MessageCircle className="w-3 h-3"/> منشورات اليوم</div>
                    </div>
                    {/* Placeholder for Online or other stats if they existed, kept balanced */}
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
