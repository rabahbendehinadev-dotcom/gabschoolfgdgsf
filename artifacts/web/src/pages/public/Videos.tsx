import { useState } from "react";
import { Link } from "wouter";
import { useGetVideos, useGetCategories } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Input, Dialog, DialogContent } from "@/components/ui";
import { Search, Crown, PlayCircle, Filter, Lock, X, Rocket } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Videos() {
  const { user, getAuthHeaders } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  /* ── طلب مستقل لجلب الفيديو المجاني (بلا فلاتر) ── */
  const { data: allVideosUnfiltered } = useGetVideos({}, { request: getAuthHeaders() });
  const freeVideo = allVideosUnfiltered?.find(v => v.accessType === "visitor");

  /* ── طلب الفيديوهات الرئيسي (مع الفلاتر) ── */
  const { data: videos, isLoading } = useGetVideos(
    { search: search || undefined, categoryId },
    { request: getAuthHeaders() }
  );

  /* ── استثناء الفيديو المجاني من الشبكة ── */
  const gridVideos = freeVideo
    ? (videos ?? []).filter(v => v.id !== freeVideo.id)
    : (videos ?? []);

  const { data: categories } = useGetCategories();

  const isLoggedIn = !!user;
  const isDemo = user?.subscriptionType === "demo";
  const isVipUser = user?.accountType === "vip";
  const isLocked = !isLoggedIn || isDemo;

  return (
    <div className="min-h-screen">

      {/* ════════════════════════════════════════════════════
           Hero Section — الفيديو المجاني
      ════════════════════════════════════════════════════ */}
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
              {/* flex-col on mobile (video top, text bottom), row on desktop */}
              <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-14">

                {/* ── يمين (ديسكتوب) / أعلى (موبايل): Thumbnail ── */}
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
                    {/* dark overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                    {/* Play button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/50 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-primary/70">
                        <PlayCircle className="w-11 h-11 ml-1" />
                      </div>
                    </div>

                    {/* مجاني badge */}
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                        ✓ مجاني
                      </span>
                    </div>

                    {/* title overlay */}
                    <div className="absolute bottom-4 right-4 left-4 text-right">
                      <p className="text-white font-semibold text-sm line-clamp-2 drop-shadow">
                        {freeVideo.title}
                      </p>
                    </div>
                  </button>
                </div>

                {/* ── يسار (ديسكتوب) / أسفل (موبايل): النص والأزرار ── */}
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

      {/* ════════════════════════════════════════════════════
           Modal مشاهدة الفيديو
      ════════════════════════════════════════════════════ */}
      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-white/10 gap-0">
          {/* header */}
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
          {/* iframe */}
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
           مكتبة الدروس (الشبكة الرئيسية)
      ════════════════════════════════════════════════════ */}
      <div className="container mx-auto px-4 py-12">

        {/* ── الترويسة والفلاتر ── */}
        <div className="mb-10 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">مكتبة الدروس</h1>
              <p className="text-foreground/60">تصفح جميع دروس الفلاش والديكوداج</p>
            </div>
            <div className="w-full md:w-96 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="ابحث عن درس أو هاتف..."
                className="pl-4 pr-10 border-border bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <Badge
              variant={!categoryId ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap text-sm py-1.5 px-4"
              onClick={() => setCategoryId(undefined)}
            >
              الكل
            </Badge>
            {categories?.map(cat => (
              <Badge
                key={cat.id}
                variant={categoryId === cat.id ? "default" : "outline"}
                className="cursor-pointer whitespace-nowrap text-sm py-1.5 px-4 bg-muted/50"
                onClick={() => setCategoryId(cat.id)}
              >
                {cat.name}
              </Badge>
            ))}
          </div>

          {/* Locked notice */}
          {isLocked && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-4 bg-primary/10 border border-primary/30 rounded-xl px-5 py-4"
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
        </div>

        {/* ── شبكة الفيديوهات ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => (
              <Card key={i} className="h-72 animate-pulse bg-muted/50 border-border" />
            ))}
          </div>
        ) : gridVideos.length === 0 ? (
          <div className="text-center py-24 bg-muted/50 rounded-2xl border border-border">
            <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">لم يتم العثور على دروس</h3>
            <p className="text-muted-foreground">جرب تغيير كلمات البحث أو التصنيف</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {gridVideos.map((video, i) => {
              const at = video.accessType || "normal";
              const isVipVideo = at === "vip";
              const isVisitorVideo = at === "visitor";

              const videoLocked = isVisitorVideo
                ? false
                : isVipVideo
                  ? !isVipUser
                  : isLocked;

              const lockMessage = isVipVideo
                ? "مخصص لحسابات VIP فقط"
                : isDemo
                  ? "ترقية حسابك للمشاهدة"
                  : "اشترك لمشاهدة هذا الدرس";

              const href = videoLocked
                ? isLoggedIn ? "/subscribe" : "/login"
                : `/videos/${video.id}`;

              const card = (
                <Card className={`overflow-hidden glass-card transition-all duration-300 group h-full flex flex-col cursor-pointer ${!videoLocked ? "hover:-translate-y-1 hover:border-primary/50" : "hover:-translate-y-1 hover:border-primary/30"}`}>
                  <div className="relative aspect-video bg-black overflow-hidden">
                    <img
                      src={video.thumbnailUrl || "https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80"}
                      alt={video.title}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${videoLocked ? "opacity-50" : "opacity-80 group-hover:opacity-100"}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    <div className="absolute inset-0 flex items-center justify-center">
                      {videoLocked ? (
                        <div className="w-14 h-14 rounded-full bg-black/70 border border-white/20 text-white/80 flex items-center justify-center backdrop-blur-sm group-hover:bg-primary/20 group-hover:border-primary/40 transition-all">
                          <Lock className="w-6 h-6" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-primary/90 text-white flex items-center justify-center backdrop-blur-sm shadow-lg glow-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          <PlayCircle className="w-8 h-8 ml-1" />
                        </div>
                      )}
                    </div>

                    <div className="absolute top-3 right-3 flex gap-2">
                      {isVipVideo && (
                        <Badge variant="vip" className="shadow-lg">
                          <Crown className="w-3 h-3 ml-1" /> VIP
                        </Badge>
                      )}
                      {isVisitorVideo && (
                        <Badge variant="outline" className="shadow-lg bg-green-500/80 text-white border-green-400 backdrop-blur-md">
                          مجاني
                        </Badge>
                      )}
                    </div>
                    <div className="absolute bottom-3 right-3">
                      <Badge variant="secondary" className="bg-black/60 backdrop-blur-md border-white/10 text-white hover:bg-black/60">
                        {video.categoryName}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className={`font-bold text-lg leading-tight mb-2 line-clamp-2 transition-colors ${videoLocked ? "text-foreground/70" : "group-hover:text-primary"}`}>
                      {video.title}
                    </h3>
                    <p className="text-sm text-foreground/60 line-clamp-2 mt-auto">
                      {video.description}
                    </p>
                    {videoLocked && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-primary font-medium flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          {lockMessage}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              );

              return (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={href}>{card}</Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
