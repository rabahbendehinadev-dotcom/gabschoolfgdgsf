import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useGetVideos, useGetCategories, useGetVideo, getGetVideoQueryKey, useGetPlaylist } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Input, Dialog, DialogContent } from "@/components/ui";
import { Search, PlayCircle, Lock, X, Rocket, LayoutGrid, Sparkles, Loader2, GraduationCap, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { CategoryCard } from "@/components/public/CategoryCard";
import { LessonCard } from "@/components/public/LessonCard";
import { CoursePlayer } from "@/components/public/CoursePlayer";
import { CourseVideoPlayer } from "@/components/CourseVideoPlayer";
import { getCategoryMeta } from "@/lib/categoryMeta";

export function Videos() {
  const { user, getAuthHeaders } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [search, setSearch] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  /* ── المعاملات من الـURL ── */
  const params = new URLSearchParams(searchString);
  const categoryIdParam = params.get("categoryId");
  const courseIdParam = params.get("courseId");
  const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined;
  const courseId = courseIdParam ? Number(courseIdParam) : undefined;

  /* إذا فُتحت الصفحة بدون courseId، أعد التوجيه إلى صفحة الدورات */
  useEffect(() => {
    if (!courseIdParam) navigate("/courses", { replace: true });
  }, [courseIdParam, navigate]);

  const lessonsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* بيانات الدورة المختارة — لعرض البانر والعنوان فقط */
  const { data: coursePlaylist } = useGetPlaylist(courseId ?? 0, {
    request: getAuthHeaders(),
    query: { enabled: !!courseId },
  });

  const selectCategory = (id?: number) => {
    setSearch("");
    if (id) {
      navigate(courseId ? `/videos?courseId=${courseId}&categoryId=${id}` : `/videos?categoryId=${id}`);
    } else {
      navigate(courseId ? `/videos?courseId=${courseId}` : "/videos");
      requestAnimationFrame(() =>
        gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  };

  /* ── الأقسام — مفلترة من الـ backend حسب playlistId (courseId) ── */
  const { data: categories } = useGetCategories(
    courseId ? { playlistId: courseId } : undefined,
  );

  /* ── كل فيديوهات الدورة (للفيديو المجاني + عدّ الدروس لكل قسم) ── */
  const { data: allVideosUnfiltered } = useGetVideos(
    courseId ? { playlistId: courseId } : {},
    { request: getAuthHeaders() },
  );
  const freeVideo = allVideosUnfiltered?.find(v => v.accessType === "visitor");

  /* تفاصيل الفيديو المجاني (روابط البثّ الآمنة) — تُجلب فقط عند فتح النافذة */
  const { data: freeDetail } = useGetVideo(freeVideo?.id ?? 0, {
    request: getAuthHeaders(),
    query: {
      queryKey: getGetVideoQueryKey(freeVideo?.id ?? 0),
      enabled: videoModalOpen && !!freeVideo?.id,
    },
  });
  const freeStreamUrl = freeDetail?.streamParts?.[0]?.url ?? "";

  /* ── الفيديوهات حسب الفلاتر الحالية (قسم / بحث) — مفلترة من الـ backend ── */
  const { data: videos, isLoading } = useGetVideos(
    {
      search: search || undefined,
      categoryId,
      ...(courseId ? { playlistId: courseId } : {}),
    },
    { request: getAuthHeaders() },
  );

  /* ── عدد الدروس لكل قسم (مبني على فيديوهات الدورة فقط) ── */
  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    (allVideosUnfiltered ?? []).forEach(v => {
      if (v.categoryId) map.set(v.categoryId, (map.get(v.categoryId) ?? 0) + 1);
    });
    return map;
  }, [allVideosUnfiltered]);

  const isLoggedIn = !!user;
  const isDemo = user?.subscriptionType === "demo";
  const isVipUser =
    user?.accountType === "vip" &&
    !user.subscriptionIsExpired &&
    (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
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
  const hrefFor = (videoId: number, _locked: boolean) => `/videos/${videoId}`;

  const activeCategory = categories?.find(c => c.id === categoryId);
  const isSearching = search.trim().length > 0;

  /* الدروس المعروضة — الـ backend يضمن أنها تابعة للدورة الصحيحة فقط */
  const lessons = videos ?? [];

  /* عند اختيار قسم: انزل تلقائياً إلى قسم الدروس بالأسفل
     (نعتمد أيضاً على activeCategory لتعمل عند الدخول المباشر برابط ?categoryId=) */
  useEffect(() => {
    if (categoryId && activeCategory && lessonsRef.current) {
      lessonsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [categoryId, activeCategory]);

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
          <div className="w-full bg-black p-3">
            {videoModalOpen && (
              freeStreamUrl ? (
                <CourseVideoPlayer
                  src={freeStreamUrl}
                  poster={freeVideo?.thumbnailUrl}
                  title={freeVideo?.title}
                  username={user?.username}
                  email={user?.email}
                  userId={user?.id}
                  videoId={freeVideo?.id}
                />
              ) : (
                <div
                  className="relative w-full bg-black rounded-2xl flex items-center justify-center"
                  style={{ aspectRatio: "16 / 9" }}
                >
                  <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════
           صفحة موحّدة: كروت الأقسام أعلى + دروس القسم المختار أسفل
      ════════════════════════════════════════════════════ */}
      <>
          {/* ── الأقسام (دائماً أعلى الصفحة) ثم دروس القسم المختار أسفلها ── */}
          <div className="container mx-auto px-4 py-12">
            {/* بانر الدورة عند الفلترة */}
            {courseId && coursePlaylist && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4"
              >
                {(coursePlaylist as typeof coursePlaylist & { imageUrl?: string | null }).imageUrl ? (
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
                    <img
                      src={(coursePlaylist as typeof coursePlaylist & { imageUrl?: string | null }).imageUrl!}
                      alt={coursePlaylist.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">الدورة المختارة</p>
                  <p className="font-bold text-foreground truncate">{coursePlaylist.title}</p>
                </div>
                <button
                  onClick={() => navigate("/videos")}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  كل الأقسام
                </button>
              </motion.div>
            )}

            {/* ترويسة + بحث */}
            <div ref={gridRef} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 scroll-mt-24">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">
                  {courseId && coursePlaylist ? `تصنيفات: ${coursePlaylist.title}` : "اختر القسم الذي تريد تعلّمه"}
                </h1>
                <p className="text-foreground/60">
                  {courseId ? "اختر تصنيفاً لتظهر دروسه بالأسفل" : "اختر قسماً من الكروت بالأعلى لتظهر دروسه بالأسفل، مرتّبة كمسار تعليمي متكامل"}
                </p>
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
              /* شبكة بطاقات الأقسام (أعلى) ثم دروس القسم المختار (أسفل) */
              <>
                {!categories ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1,2,3,4,5,6,7,8].map(i => (
                      <Card key={i} className="h-80 animate-pulse bg-muted/50 border-border rounded-3xl" />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-24 bg-muted/40 rounded-2xl border border-border">
                    <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-bold mb-2">لا توجد أقسام بعد</h3>
                    <p className="text-muted-foreground">سيتم إضافة الأقسام قريباً</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {categories.map((cat, i) => (
                      <CategoryCard
                        key={cat.id}
                        category={cat}
                        lessonCount={countByCategory.get(cat.id) ?? 0}
                        index={i}
                        active={cat.id === categoryId}
                      />
                    ))}
                  </div>
                )}

                {/* ── أسفل الكروت: دروس القسم المختار، أو رسالة + فيديو مجاني في العرض الأولي ── */}
                {activeCategory ? (
                  <section ref={lessonsRef} className="mt-14 scroll-mt-24 border-t border-border pt-10">
                    <CategoryDetail
                      category={activeCategory}
                      lessons={lessons}
                      isLoading={isLoading}
                      accessInfo={accessInfo}
                      onBack={() => selectCategory(undefined)}
                      isLocked={isLocked}
                      isDemo={isDemo}
                    />
                  </section>
                ) : (
                  <>
                    {/* رسالة: اختر قسماً لعرض دروسه */}
                    <div className="mt-12 text-center bg-muted/40 rounded-2xl border border-border py-12 px-6">
                      <LayoutGrid className="w-10 h-10 text-primary/70 mx-auto mb-3" />
                      <h3 className="text-lg md:text-xl font-bold mb-1.5">اختر أحد الأقسام لعرض الدروس</h3>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto">
                        اضغط على أي كارت بالأعلى لتظهر دروسه هنا، مرتّبة كمسار تعليمي متكامل.
                      </p>
                    </div>

                    {/* الفيديو المجاني — أسفل الكروت فقط (شاهد قبل الاشتراك) */}
                    {freeVideo && (
                      <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="mt-10 rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-orange-50/50 p-6 md:p-8"
                      >
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
                      </motion.section>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </>
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

/* يتحقّق من صحّة لون الـaccent القادم من لوحة التحكم قبل حقنه في CSS */
function safeAccent(input?: string | null): string {
  const c = (input || "").trim();
  if (!c) return "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return c;
  if (/^(rgb|hsl)a?\([0-9.,%\s/]+\)$/i.test(c)) return c;
  return "";
}

/* ═══════════════════════════════════════════════════════════
     تفاصيل القسم — مسار تعليمي مرتب (الحلقة 1، 2، 3...)
═══════════════════════════════════════════════════════════ */
function CategoryDetail({
  category,
  lessons,
  isLoading,
  accessInfo,
  onBack,
  isLocked,
  isDemo,
}: {
  category: { id: number; name: string; slug: string; icon?: string | null; description?: string | null; imageUrl?: string | null; accentColor?: string | null };
  lessons: any[];
  isLoading: boolean;
  accessInfo: (v: { accessType?: string }) => { isVipVideo: boolean; isVisitorVideo: boolean; videoLocked: boolean; lockMessage: string };
  onBack: () => void;
  isLocked: boolean;
  isDemo: boolean;
}) {
  const meta = getCategoryMeta(category.name, category.slug);
  const Icon = meta.Icon;
  const isEmojiIcon = !!category.icon && /\p{Extended_Pictographic}/u.test(category.icon);
  const accent = safeAccent(category.accentColor);
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
    <div>
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
        <CoursePlayer lessons={lessons} accessInfo={accessInfo} />
      )}
    </div>
  );
}
