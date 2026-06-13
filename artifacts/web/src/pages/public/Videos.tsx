import { useState, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useGetVideos, useGetCategories } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Input, Dialog, DialogContent } from "@/components/ui";
import { Search, Crown, PlayCircle, Lock, X, Rocket, ChevronLeft, LayoutGrid, Play, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CategoryCard } from "@/components/public/CategoryCard";
import { LessonCard } from "@/components/public/LessonCard";
import { getCategoryMeta } from "@/lib/categoryMeta";

export function Videos() {
  const { user, getAuthHeaders } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [search, setSearch] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  /* ── القسم المحدّد من الـURL (?categoryId=) ── */
  const categoryIdParam = new URLSearchParams(searchString).get("categoryId");
  const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined;

  const selectCategory = (id?: number) => {
    setSearch("");
    navigate(id ? `/videos?categoryId=${id}` : "/videos");
  };

  /* ── طلب مستقل لجلب كل الفيديوهات (للفيديو المجاني + عدّ الدروس لكل قسم) ── */
  const { data: allVideosUnfiltered } = useGetVideos({}, { request: getAuthHeaders() });
  const freeVideo = allVideosUnfiltered?.find(v => v.accessType === "visitor");

  /* ── الفيديوهات حسب الفلاتر الحالية (قسم / بحث) ── */
  const { data: videos, isLoading } = useGetVideos(
    { search: search || undefined, categoryId },
    { request: getAuthHeaders() }
  );

  const { data: categories } = useGetCategories();

  /* ── عدد الدروس لكل قسم ── */
  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    (allVideosUnfiltered ?? []).forEach(v => {
      map.set(v.categoryId, (map.get(v.categoryId) ?? 0) + 1);
    });
    return map;
  }, [allVideosUnfiltered]);

  const isLoggedIn = !!user;
  const isDemo = user?.subscriptionType === "demo";
  const isVipUser = user?.accountType === "vip";
  const isLocked = !isLoggedIn || isDemo;

  /* ── منطق وصول الفيديو (لم يتغير) ── */
  const accessInfo = (video: { accessType?: string }) => {
    const at = video.accessType || "normal";
    const isVipVideo = at === "vip";
    const isVisitorVideo = at === "visitor";
    const videoLocked = isVisitorVideo ? false : isVipVideo ? !isVipUser : isLocked;
    const lockMessage = isVipVideo
      ? "مخصص لحسابات VIP فقط"
      : isDemo
        ? "ترقية حسابك للمشاهدة"
        : "اشترك لمشاهدة هذا الدرس";
    return { isVipVideo, isVisitorVideo, videoLocked, lockMessage };
  };
  const hrefFor = (videoId: number, locked: boolean) =>
    locked ? (isLoggedIn ? "/subscribe" : "/login") : `/videos/${videoId}`;

  const activeCategory = categories?.find(c => c.id === categoryId);
  const isSearching = search.trim().length > 0;

  /* القسم المحدّد: الدروس مرتبة تسلسلياً (الـAPI يرتّبها حسب sortOrder) */
  const lessons = videos ?? [];

  return (
    <div className="min-h-screen">

      {/* ════════════════════════════════════════════════════
           Modal مشاهدة الفيديو المجاني
      ════════════════════════════════════════════════════ */}
      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-white/10 gap-0">
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-white/10">
            <p className="text-white font-bold text-sm line-clamp-1 flex-1 text-right">
              {freeVideo?.title}
            </p>
            <button
              onClick={() => setVideoModalOpen(false)}
              className="mr-3 shrink-0 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="aspect-video w-full bg-black">
            {videoModalOpen && freeVideo?.driveEmbedUrl && (
              <iframe
                src={freeVideo.driveEmbedUrl}
                className="w-full h-full"
                allow="autoplay"
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════
           الوضع B — قسم محدّد: مسار تعليمي مرتب
      ════════════════════════════════════════════════════ */}
      {activeCategory ? (
        <CategoryDetail
          category={activeCategory}
          lessons={lessons}
          isLoading={isLoading}
          accessInfo={accessInfo}
          hrefFor={hrefFor}
          onBack={() => selectCategory(undefined)}
          isLocked={isLocked}
          isDemo={isDemo}
        />
      ) : (
        /* ════════════════════════════════════════════════════
             الوضع A — الصفحة الرئيسية للدورات
        ════════════════════════════════════════════════════ */
        <>
          {/* Hero — الفيديو المجاني */}
          <AnimatePresence>
            {freeVideo && (
              <motion.section
                key="free-hero"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="border-b border-border/60 bg-gradient-to-br from-primary/5 via-background to-orange-50/50"
              >
                <div className="container mx-auto px-4 py-12 md:py-16">
                  <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-14">
                    <div className="w-full md:w-[46%] shrink-0">
                      <button
                        onClick={() => setVideoModalOpen(true)}
                        className="relative w-full aspect-video rounded-2xl overflow-hidden group shadow-2xl shadow-black/10 border border-border/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <img
                          src={freeVideo.thumbnailUrl || "https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80"}
                          alt={freeVideo.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/50 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-primary/70">
                            <PlayCircle className="w-11 h-11 ml-1" />
                          </div>
                        </div>
                        <div className="absolute top-3 right-3">
                          <span className="inline-flex items-center gap-1 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                            ✓ مجاني
                          </span>
                        </div>
                        <div className="absolute bottom-4 right-4 left-4 text-right">
                          <p className="text-white font-semibold text-sm line-clamp-2 drop-shadow">
                            {freeVideo.title}
                          </p>
                        </div>
                      </button>
                    </div>

                    <div className="flex-1 text-center md:text-right space-y-5">
                      <span className="inline-block bg-primary/10 text-primary border border-primary/25 text-sm font-semibold px-4 py-1.5 rounded-full">
                        محتوى مجاني 🎁
                      </span>
                      <h2 className="text-3xl md:text-4xl font-extrabold leading-snug">
                        شاهد قبل الاشتراك 👇
                      </h2>
                      <p className="text-foreground/60 text-base md:text-lg leading-relaxed max-w-md mx-auto md:mx-0">
                        هذا فيديو حقيقي من داخل الدورة باش تشوف المستوى قبل ما تشترك
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start pt-1">
                        <Button
                          size="lg"
                          className="gap-2 text-base shadow-lg shadow-primary/25 h-12 px-6"
                          onClick={() => setVideoModalOpen(true)}
                        >
                          <PlayCircle className="w-5 h-5" />
                          شاهد الفيديو الآن
                        </Button>
                        <Link href="/subscribe">
                          <Button size="lg" variant="outline" className="gap-2 text-base h-12 px-6 w-full sm:w-auto border-border hover:border-primary/50">
                            <Rocket className="w-5 h-5" />
                            اشترك وشاهد جميع الدروس
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── الأقسام / البحث ── */}
          <div className="container mx-auto px-4 py-12">
            {/* ترويسة + بحث */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">اختر القسم الذي تريد تعلّمه</h1>
                <p className="text-foreground/60">كل قسم يحتوي على دروسه الخاصة مرتبة كمسار تعليمي متكامل</p>
              </div>
              <div className="w-full md:w-96 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="ابحث عن درس أو هاتف..."
                  className="pl-4 pr-10 border-border bg-background h-12 rounded-xl"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {isSearching ? (
              /* نتائج البحث عبر كل الأقسام */
              <SearchResults
                videos={lessons}
                isLoading={isLoading}
                accessInfo={accessInfo}
                hrefFor={hrefFor}
                onClear={() => setSearch("")}
              />
            ) : (
              /* شبكة بطاقات الأقسام */
              <>
                {!categories ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {[1,2,3,4,5,6,7,8].map(i => (
                      <Card key={i} className="h-44 animate-pulse bg-muted/50 border-border" />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-24 bg-muted/40 rounded-2xl border border-border">
                    <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-bold mb-2">لا توجد أقسام بعد</h3>
                    <p className="text-muted-foreground">سيتم إضافة الأقسام قريباً</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                    {categories.map((cat, i) => (
                      <CategoryCard
                        key={cat.id}
                        category={cat}
                        lessonCount={countByCategory.get(cat.id) ?? 0}
                        index={i}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
     نتائج البحث (شبكة بطاقات دروس)
═══════════════════════════════════════════════════════════ */
function SearchResults({
  videos,
  isLoading,
  accessInfo,
  hrefFor,
  onClear,
}: {
  videos: any[];
  isLoading: boolean;
  accessInfo: (v: { accessType?: string }) => { isVipVideo: boolean; isVisitorVideo: boolean; videoLocked: boolean; lockMessage: string };
  hrefFor: (id: number, locked: boolean) => string;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-foreground/70 font-medium">
          نتائج البحث ({videos.length})
        </p>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-primary">
          <X className="w-4 h-4 ml-1" /> مسح البحث
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1,2,3,4].map(i => <Card key={i} className="h-64 animate-pulse bg-muted/50 border-border" />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-24 bg-muted/40 rounded-2xl border border-border">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">لم يتم العثور على دروس</h3>
          <p className="text-muted-foreground">جرب كلمات بحث أخرى</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {videos.map((video, i) => {
            const { isVipVideo, isVisitorVideo, videoLocked } = accessInfo(video);
            return (
              <LessonCard
                key={video.id}
                video={video}
                locked={videoLocked}
                isVip={isVipVideo}
                isVisitor={isVisitorVideo}
                href={hrefFor(video.id, videoLocked)}
                index={i}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
     تفاصيل القسم — مسار تعليمي مرتب (الحلقة 1، 2، 3...)
═══════════════════════════════════════════════════════════ */
function CategoryDetail({
  category,
  lessons,
  isLoading,
  accessInfo,
  hrefFor,
  onBack,
  isLocked,
  isDemo,
}: {
  category: { id: number; name: string; slug: string; icon?: string | null; description?: string | null; imageUrl?: string | null; accentColor?: string | null };
  lessons: any[];
  isLoading: boolean;
  accessInfo: (v: { accessType?: string }) => { isVipVideo: boolean; isVisitorVideo: boolean; videoLocked: boolean; lockMessage: string };
  hrefFor: (id: number, locked: boolean) => string;
  onBack: () => void;
  isLocked: boolean;
  isDemo: boolean;
}) {
  const meta = getCategoryMeta(category.name, category.slug);
  const Icon = meta.Icon;
  const isEmojiIcon = !!category.icon && /\p{Extended_Pictographic}/u.test(category.icon);
  const accent = category.accentColor || "";
  const description = category.description || meta.description;
  const imageUrl = (() => {
    const u = category.imageUrl || "";
    if (!u) return "";
    try {
      const parsed = new URL(u);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return parsed.pathname + parsed.search;
    } catch { /* نسبي */ }
    return u;
  })();

  return (
    <div className="container mx-auto px-4 py-8 md:py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-foreground/55 mb-6 flex-wrap">
        <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
        <ChevronLeft className="w-4 h-4" />
        <Link href="/videos" className="hover:text-primary transition-colors">الدورات</Link>
        <ChevronLeft className="w-4 h-4" />
        <span className="text-primary font-semibold">{category.name}</span>
      </nav>

      {/* Header / Banner للقسم */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-background p-6 md:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden ${imageUrl || accent ? "" : `bg-gradient-to-br ${meta.gradient}`}`}
            style={accent && !imageUrl ? { background: `${accent}26` } : accent && imageUrl ? { background: `${accent}14` } : undefined}
          >
            {imageUrl ? (
              <img src={imageUrl} alt={category.name} className="w-full h-full object-contain p-1.5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : isEmojiIcon ? (
              <span className="text-3xl leading-none">{category.icon}</span>
            ) : (
              <Icon className={`w-8 h-8 ${meta.text}`} style={accent ? { color: accent } : undefined} />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold mb-1.5">{category.name}</h1>
            <p className="text-foreground/60 text-sm md:text-base leading-relaxed max-w-2xl">{description}</p>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                <PlayCircle className="w-3.5 h-3.5 ml-1" />
                {lessons.length} درس
              </Badge>
              <Badge variant="outline" className="bg-muted/60">
                <Sparkles className="w-3.5 h-3.5 ml-1" />
                مسار تعليمي مرتب
              </Badge>
            </div>
          </div>
          <Button variant="outline" onClick={onBack} className="shrink-0 gap-1.5 rounded-xl">
            <LayoutGrid className="w-4 h-4" />
            كل الأقسام
          </Button>
        </div>
      </div>

      {/* Locked notice */}
      {isLocked && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-primary/10 border border-primary/30 rounded-xl px-5 py-4 mb-8"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm font-medium">
              {isDemo
                ? "حسابك التجريبي لا يتيح مشاهدة الدروس — قم بترقيته الآن"
                : "قم بتسجيل الدخول والاشتراك للوصول إلى جميع الدروس"}
            </p>
          </div>
          <Link href="/subscribe">
            <Button size="sm" className="shrink-0">
              {isDemo ? "ترقية الحساب" : "عرض الاشتراكات"}
            </Button>
          </Link>
        </motion.div>
      )}

      {/* المسار التعليمي */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="h-28 animate-pulse bg-muted/50 border-border" />
          ))}
        </div>
      ) : lessons.length === 0 ? (
        <div className="text-center py-24 bg-muted/40 rounded-2xl border border-border">
          <PlayCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">لا توجد دروس في هذا القسم بعد</h3>
          <p className="text-muted-foreground mb-6">سيتم إضافة الدروس قريباً</p>
          <Button variant="outline" onClick={onBack}>العودة لكل الأقسام</Button>
        </div>
      ) : (
        <div className="relative space-y-3 md:space-y-4">
          {lessons.map((video, i) => {
            const { isVipVideo, isVisitorVideo, videoLocked, lockMessage } = accessInfo(video);
            const episode = i + 1;
            const isLast = i === lessons.length - 1;
            return (
              <div key={video.id} className="relative flex gap-3 md:gap-4">
                {/* رقم الحلقة + خط الربط */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center font-black text-sm shadow-sm z-10 ${
                    videoLocked ? "bg-muted text-foreground/50 border border-border" : "bg-primary text-white"
                  }`}>
                    {episode}
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
                </div>

                {/* بطاقة الدرس */}
                <Link href={hrefFor(video.id, videoLocked)} className="flex-1 min-w-0 pb-1">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.04 }}
                    className="group flex gap-3 md:gap-4 rounded-2xl border border-border bg-card p-3 transition-all duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10"
                  >
                    {/* مصغّرة */}
                    <div className="relative w-32 sm:w-44 aspect-video shrink-0 rounded-xl overflow-hidden bg-muted">
                      <img
                        src={video.thumbnailUrl || "https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80"}
                        alt={video.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
                      {!videoLocked && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                            <Play className="w-4 h-4 ml-0.5" />
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {isVipVideo && (
                          <span className="inline-flex items-center gap-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">
                            <Crown className="w-2 h-2" /> VIP
                          </span>
                        )}
                        {isVisitorVideo && (
                          <span className="inline-flex items-center bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                            مجاني
                          </span>
                        )}
                      </div>
                    </div>

                    {/* المحتوى */}
                    <div className="flex-1 min-w-0 flex flex-col py-0.5">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[11px] font-bold text-primary">الحلقة {episode}</span>
                        {i === 0 && (
                          <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            ابدأ من هنا
                          </span>
                        )}
                      </div>
                      <h3 className={`font-bold text-sm md:text-base leading-snug line-clamp-2 transition-colors ${
                        videoLocked ? "text-foreground/80" : "group-hover:text-primary"
                      }`}>
                        {video.title}
                      </h3>
                      {video.description && (
                        <p className="text-xs text-foreground/55 mt-1 line-clamp-1 md:line-clamp-2">
                          {video.description}
                        </p>
                      )}
                      <div className="mt-auto pt-2 flex items-center justify-between">
                        {videoLocked ? (
                          <span className="text-[11px] font-semibold text-foreground/45 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> {lockMessage}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-green-600 flex items-center gap-1">
                            {isVisitorVideo ? "مجاني" : "متاح للمشاهدة"}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-primary flex items-center gap-1 shrink-0">
                          {videoLocked ? "اشترك" : "شاهد"}
                          <Play className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
