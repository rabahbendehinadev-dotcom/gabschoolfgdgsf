import { useState, useMemo, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui";
import { Link } from "wouter";
import { Play, CheckCircle2, Shield, Zap, Crown, Lock, Search, LayoutGrid, Cloud, Terminal, Unlock, Cpu, ArrowRight, ArrowLeft, CircuitBoard, Usb, Wrench, Laptop, Download, BookOpen, ShieldOff, KeyRound, Trophy, MoveHorizontal, GraduationCap, PlayCircle, type LucideIcon } from "lucide-react";
import { useGetCategories, useGetSubscriptionPlans, useGetVideos, useGetPlaylists } from "@workspace/api-client-react/src/generated/api";
import type { Playlist } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { CategoryCard } from "@/components/public/CategoryCard";
import { CoursePlayer } from "@/components/public/CoursePlayer";
import { InstallAppSection } from "@/components/public/InstallAppSection";
import iphoneLocked from "@assets/generated_images/hero_iphone_locked.png";
import iphoneHome from "@assets/generated_images/hero_iphone_home.png";
import androidUnlock from "@assets/generated_images/hero_android_unlock.png";
import tabletClean from "@assets/generated_images/hero_tablet_clean.png";

const HOME_ACCENTS = [
  { from: "#f97316", to: "#fb923c" },
  { from: "#8b5cf6", to: "#a78bfa" },
  { from: "#06b6d4", to: "#22d3ee" },
  { from: "#10b981", to: "#34d399" },
  { from: "#ef4444", to: "#f87171" },
  { from: "#3b82f6", to: "#60a5fa" },
];

function HomeCourseCard({ playlist, index }: { playlist: Playlist & { imageUrl?: string | null }; index: number }) {
  const accent = HOME_ACCENTS[index % HOME_ACCENTS.length];
  const lessonCount = playlist.videos?.length ?? 0;
  const hasImage = !!playlist.imageUrl;

  return (
    <Link href={`/courses/${playlist.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.06, duration: 0.4 }}
        className="group relative flex flex-col rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full bg-card border border-border"
      >
        <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
          {hasImage ? (
            <img
              src={playlist.imageUrl!}
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${accent.from}22, ${accent.to}44)` }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
                style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
              >
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm px-2.5 py-1 text-xs font-bold text-white">
            <PlayCircle className="h-3.5 w-3.5" />
            {lessonCount > 0 ? `${lessonCount} درس` : "قريباً"}
          </div>
        </div>

        <div className="flex flex-col p-4 flex-1">
          <div className="w-8 h-1 rounded-full mb-2" style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />
          <h3 className="font-bold text-sm leading-snug text-foreground line-clamp-2 mb-1">{playlist.title}</h3>
          {playlist.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{playlist.description}</p>
          )}
          <div className="mt-3 flex items-center gap-1 text-xs font-bold" style={{ color: accent.from }}>
            <ArrowLeft className="h-3.5 w-3.5" />
            ابدأ التعلم
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function HomeCoursesSection() {
  const { data: playlists, isLoading } = useGetPlaylists();
  const visible = ((playlists ?? []) as (Playlist & { imageUrl?: string | null })[])
    .filter(p => p.isVisible !== false)
    .slice(0, 6);

  if (isLoading || visible.length === 0) return null;

  return (
    <section className="py-16 bg-background" dir="rtl">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold">
            <GraduationCap className="w-4 h-4" />
            تعلّم من الأفضل
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">الدورات المتوفرة</h2>
          <p className="mt-3 text-muted-foreground text-sm">اختر دورتك وابدأ رحلتك نحو الاحتراف</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {visible.map((pl, i) => (
            <HomeCourseCard key={pl.id} playlist={pl} index={i} />
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/courses">
            <Button variant="outline" className="rounded-full px-8 gap-2 h-11 font-semibold">
              عرض جميع الدورات
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// خارطة طريق التعلّم داخل البانر — رحلة الطالب من البداية حتى الاحتراف (بدون أسماء ماركات)
const roadmap: { label: string; icon: LucideIcon; tone: "sky" | "primary" | "gold" }[] = [
  { label: "الأساسيات", icon: BookOpen, tone: "sky" },
  { label: "Android Flashing", icon: Download, tone: "sky" },
  { label: "FRP", icon: ShieldOff, tone: "sky" },
  { label: "Firmware", icon: Cpu, tone: "primary" },
  { label: "Unlock", icon: KeyRound, tone: "primary" },
  { label: "Apple Services", icon: Cloud, tone: "primary" },
  { label: "MacBook", icon: Laptop, tone: "primary" },
  { label: "Professional Technician", icon: Trophy, tone: "gold" },
];

export function Home() {
  const { user, getAuthHeaders } = useAuth();
  const { data: categories } = useGetCategories();
  const { data: plans } = useGetSubscriptionPlans();
  const [activeCategory, setActiveCategory] = useState<number | undefined>(
    () => (typeof window !== "undefined" ? (window.history.state?.brandView as number | undefined) : undefined)
  );
  const { data: videos } = useGetVideos({ categoryId: activeCategory }, { request: getAuthHeaders() });
  const { data: allVideos } = useGetVideos({}, { request: getAuthHeaders() });

  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    (allVideos ?? []).forEach(v => map.set(v.categoryId, (map.get(v.categoryId) ?? 0) + 1));
    return map;
  }, [allVideos]);

  const activeCategoryObj = categories?.find(c => c.id === activeCategory);
  const prevActiveCategory = useRef<number | undefined>(undefined);

  // الدخول لقسم: اعرض صفحة الدروس من الأعلى. الرجوع: انزل إلى قسم الماركات
  useEffect(() => {
    if (activeCategory) {
      window.scrollTo({ top: 0, behavior: "auto" });
    } else if (prevActiveCategory.current) {
      document.getElementById("courses")?.scrollIntoView({ behavior: "auto", block: "start" });
    }
    prevActiveCategory.current = activeCategory;
  }, [activeCategory]);

  // فتح قسم: أضف مدخل history حتى يرجع زر المتصفح إلى الماركات داخل الموقع
  const openCategory = (id: number) => {
    if (activeCategory === id) return;
    window.history.pushState({ brandView: id }, "");
    setActiveCategory(id);
  };

  // زر الرجوع/التقدّم في المتصفح: تنقّل داخلي بين الماركات وصفحة القسم
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as { brandView?: number } | null;
      setActiveCategory(st?.brandView);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const isLoggedIn = !!user;
  const isDemo = user?.subscriptionType === "demo";
  const isVipUser =
    user?.accountType === "vip" &&
    !user.subscriptionIsExpired &&
    (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
  const isLocked = !isLoggedIn || isDemo;

  /* منطق وصول الفيديو — مطابق لصفحة الدروس (لا يغيّر الصلاحيات) */
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

  return (
    <div className="w-full">
      {activeCategory ? (
        /* صفحة دروس القسم فقط — بدون باقي الماركات + زر رجوع بالأعلى */
        <section className="py-8 lg:py-12 bg-background min-h-[80vh]">
          <div className="container mx-auto px-4">
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center gap-2 mb-8 px-5 py-2.5 rounded-full border border-border bg-card hover:bg-muted text-sm font-bold text-foreground shadow-sm transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              الرجوع إلى كل الماركات
            </button>

            <div className="mb-8">
              <h1 className="text-2xl md:text-3xl font-bold">
                دروس {activeCategoryObj?.name ?? "القسم"}
              </h1>
              {activeCategoryObj?.description && (
                <p className="text-foreground/60 mt-2 max-w-2xl">{activeCategoryObj.description}</p>
              )}
            </div>

            {videos && videos.length > 0 ? (
              <CoursePlayer lessons={videos} accessInfo={accessInfo} key={activeCategory} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-foreground/40">
                <Search className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg">لا توجد دروس في هذه الماركة بعد</p>
              </div>
            )}

            <div className="text-center mt-14">
              <p className="text-foreground/60 mb-5">اشترك الآن وابدأ مسيرتك نحو الاحتراف</p>
              <Link href="/subscribe">
                <Button size="lg" className="rounded-full px-12 glow-primary">
                  اشترك وشاهد جميع الدروس
                  <Play className="w-5 h-5 mr-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      ) : (
      <>
      {/* ═══════════════════════════════════════════════════════
          HERO — Visual-only animated device showcase (no marketing copy)
      ════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[86vh] lg:min-h-screen flex items-center justify-center overflow-hidden bg-neutral-950">

        {/* ── Premium dark backdrop ── */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950" />

        {/* ── Animated orange brand glows ── */}
        <motion.div
          className="absolute -top-[12%] left-1/2 w-[820px] h-[520px] bg-orange-600/25 rounded-full blur-[150px] z-0"
          style={{ x: "-50%" }}
          animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.07, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[2%] left-[6%] w-[420px] h-[420px] bg-amber-500/15 rounded-full blur-[130px] z-0"
          animate={{ opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <motion.div
          className="absolute top-[18%] right-[4%] w-[380px] h-[380px] bg-orange-700/15 rounded-full blur-[130px] z-0"
          animate={{ opacity: [0.4, 0.85, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* ── Matrix-style falling code (subtle) ── */}
        <MatrixRain />

        {/* ── Slowly falling padlocks ── */}
        <FallingLocks />

        {/* ── Circuit overlay ── */}
        <div className="absolute inset-0 z-0 opacity-[0.06] text-white">
          <CircuitPattern />
        </div>

        {/* ── Device composition ── */}
        <div className="container relative z-10 mx-auto px-4">
          <div className="relative mx-auto w-full max-w-5xl h-[440px] sm:h-[560px] lg:h-[640px]">

            {/* Tablet — clean device (back layer) */}
            <FloatDevice
              src={tabletClean}
              alt="iPad device"
              wrapperClassName="absolute left-1/2 -translate-x-1/2 top-[4%] w-[62%] sm:w-[54%] max-w-[600px] z-10"
              rotate={-5}
              duration={7}
              amplitude={14}
              delay={0.15}
            />

            {/* Left phone — iPhone unlocked home screen */}
            <FloatDevice
              src={iphoneHome}
              alt="iPhone unlocked home screen"
              wrapperClassName="hidden md:block absolute left-[3%] lg:left-[7%] bottom-[6%] w-[23%] max-w-[200px] z-20"
              rotate={-9}
              duration={6.5}
              amplitude={18}
              delay={0.45}
            />

            {/* Right phone — Android unlock pattern */}
            <FloatDevice
              src={androidUnlock}
              alt="Android unlock pattern"
              wrapperClassName="absolute right-[1%] sm:right-[5%] lg:right-[8%] bottom-[3%] w-[33%] sm:w-[24%] max-w-[200px] z-20"
              rotate={8}
              duration={6}
              amplitude={16}
              delay={0.35}
            />

            {/* Center phone — iPhone: clean locked screen */}
            <FloatDevice
              src={iphoneLocked}
              alt="iPhone locked screen"
              wrapperClassName="absolute left-1/2 -translate-x-1/2 bottom-0 w-[48%] sm:w-[34%] max-w-[290px] z-30"
              rotate={0}
              duration={5.5}
              amplitude={20}
              delay={0.1}
            />

            {/* ── Floating capability badges (crisp HTML overlay) ── */}
            <HeroBadge icon={Cloud} label="iCloud Bypass" className="top-[6%] left-0 sm:left-[8%]" delay={0.7} />
            <HeroBadge icon={Terminal} label="Jailbreak" className="top-0 right-[2%] sm:right-[12%]" delay={0.85} />
            <HeroBadge icon={Unlock} label="FRP Unlock" className="hidden sm:block top-[42%] right-0 lg:right-[2%]" delay={1} />
            <HeroBadge icon={Cpu} label="Decoding" className="hidden md:block bottom-[12%] left-0 lg:left-[3%]" delay={1.15} />

          </div>
        </div>

        {/* ── Wave divider to light body ── */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0,60 C360,0 1080,120 1440,40 L1440,80 L0,80 Z" fill="hsl(var(--background))" />
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════
          قسم تثبيت التطبيق — أزرار iPhone / Android بارزة تحت البانر
      ══════════════════════════════════ */}
      <InstallAppSection />

      {/* ══════════════════════════════════
          الدورات المتوفرة — بطاقات الدورات تحت قسم التثبيت
      ══════════════════════════════════ */}
      <HomeCoursesSection />

      {/* ══════════════════════════════════
          ماركات الهواتف المدعومة (الكروت) + دروس الماركة المختارة أسفلها
      ══════════════════════════════════ */}
      <section id="courses" className="py-24 bg-background relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          {/* بانر أفقي (Ribbon) — هوية المنصة: تفليش وصيانة الهواتف */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative mb-12 overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
          >
            {/* تدرّج + توهّج برتقالي/أزرق خفيف */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-primary/[0.06] via-transparent to-sky-400/[0.06]" />
            <div className="pointer-events-none absolute -top-20 right-12 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-12 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />

            {/* خطوط إلكترونية خفيفة في الخلفية */}
            <svg
              aria-hidden="true"
              viewBox="0 0 1200 140"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <g stroke="currentColor" strokeWidth="1.2" fill="none" className="text-primary" opacity="0.08">
                <path d="M0 30 H150 a10 10 0 0 1 10 10 V70" />
                <path d="M60 0 V20 a10 10 0 0 0 10 10 H130" />
                <circle cx="160" cy="78" r="4" fill="currentColor" />
                <circle cx="130" cy="30" r="4" fill="currentColor" />
              </g>
              <g stroke="currentColor" strokeWidth="1.2" fill="none" className="text-sky-500" opacity="0.08">
                <path d="M1200 40 H1050 a10 10 0 0 0 -10 10 V80" />
                <path d="M1140 0 V18 a10 10 0 0 1 -10 10 H1070" />
                <circle cx="1040" cy="88" r="4" fill="currentColor" />
                <circle cx="1070" cy="28" r="4" fill="currentColor" />
              </g>
            </svg>

            {/* أيقونات تزيينية خفيفة على الأطراف (لوحة أم، كابل USB، لابتوب، أدوات) */}
            <CircuitBoard className="pointer-events-none absolute right-5 top-1/2 hidden h-20 w-20 -translate-y-1/2 text-primary/[0.07] lg:block" />
            <Cpu className="pointer-events-none absolute right-28 bottom-4 hidden h-8 w-8 text-primary/[0.06] lg:block" />
            <Laptop className="pointer-events-none absolute left-5 top-1/2 hidden h-20 w-20 -translate-y-1/2 text-sky-500/[0.07] lg:block" />
            <Usb className="pointer-events-none absolute left-28 top-4 hidden h-7 w-7 text-sky-500/[0.06] lg:block" />
            <Wrench className="pointer-events-none absolute left-32 bottom-4 hidden h-7 w-7 text-foreground/[0.06] lg:block" />

            {/* خارطة الطريق: مراحل متصلة بخط مضيء (بدون أسماء ماركات) */}
            <div className="relative z-10 py-7 sm:py-8">
              {/* تلاشٍ عند الحافتين يدلّ أن المسار يكمل (الهاتف فقط) */}
              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-card to-transparent lg:hidden" />
              <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-card to-transparent lg:hidden" />

              <div className="flex max-w-full items-start justify-start gap-1.5 overflow-x-auto scroll-smooth px-6 sm:gap-2 sm:px-5 lg:justify-center lg:px-5 [-ms-overflow-style:none] [overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {roadmap.flatMap((step, i) => {
                  const Icon = step.icon;
                  const isGold = step.tone === "gold";
                  const tone = isGold
                    ? "border-amber-400/50 bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/30"
                    : step.tone === "sky"
                      ? "border-sky-500/25 bg-sky-500/10 text-sky-600"
                      : "border-primary/25 bg-primary/10 text-primary";
                  const node = (
                    <div key={step.label} className="flex w-[70px] shrink-0 flex-col items-center gap-2">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-full border ${tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className={`text-center text-[10.5px] font-semibold leading-tight ${isGold ? "text-orange-600" : "text-foreground/70"}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                  return i < roadmap.length - 1
                    ? [
                        node,
                        <div
                          key={`${step.label}-line`}
                          className="mt-[21px] h-[3px] w-8 shrink-0 rounded-full bg-gradient-to-l from-sky-400/60 via-primary/50 to-primary/60 shadow-[0_0_8px_rgba(249,115,22,0.35)] lg:w-auto lg:min-w-[14px] lg:flex-1"
                        />,
                      ]
                    : [node];
                })}
              </div>

              {/* مؤشر السحب — الهاتف فقط */}
              <div className="mt-3.5 flex items-center justify-center gap-1.5 lg:hidden">
                <MoveHorizontal className="h-3.5 w-3.5 text-primary/70 motion-safe:animate-pulse" />
                <span className="text-[10px] font-medium text-foreground/50">اسحب يميناً ويساراً لرؤية كل المراحل</span>
              </div>
            </div>
          </motion.div>

          {/* (1) كروت الماركات — دائماً أعلى القسم */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
            {categories?.filter(cat => cat.showOnHomepage).map((cat, i) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                lessonCount={countByCategory.get(cat.id) ?? 0}
                index={i}
                active={activeCategory === cat.id}
                onSelect={() => openCategory(cat.id)}
              />
            ))}
          </div>

          {/* (2) أسفل الكروت: رسالة إرشادية لاختيار ماركة */}
          <div className="mt-14 text-center bg-muted/40 rounded-2xl border border-border py-14 px-6">
            <LayoutGrid className="w-11 h-11 text-primary/60 mx-auto mb-4" />
            <h3 className="text-xl md:text-2xl font-bold mb-2">اختر ماركة لعرض دروسها</h3>
            <p className="text-foreground/60 max-w-md mx-auto">اضغط على أي ماركة لعرض دروسها كاملة في صفحة مستقلة، مرتّبة كمسار تعليمي متكامل.</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FEATURES SECTION
      ══════════════════════════════════ */}
      <section className="py-24 bg-muted/60 relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">لماذا تختار منصتنا؟</h2>
            <div className="w-24 h-1 bg-primary mx-auto rounded-full opacity-50" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              { icon: Shield, title: "حماية وتحديثات مستمرة", desc: "دروس متجددة تواكب أحدث الحمايات وأنظمة التشغيل" },
              { icon: Crown, title: "عضوية VIP حصرية", desc: "وصول كامل لجميع الملفات والدروس المتقدمة بلا قيود" },
              { icon: Zap, title: "حلول عملية وسريعة", desc: "اختصر الوقت وتعلم طرق حل المشاكل المعقدة في دقائق" }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
              >
                <Card className="p-8 text-center glass-card hover:-translate-y-2 transition-transform duration-300">
                  <div className="w-16 h-16 mx-auto bg-primary/20 text-primary rounded-2xl flex items-center justify-center mb-6 glow-primary">
                    <feature.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-foreground/60">{feature.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          PRICING
      ══════════════════════════════════ */}
      <section id="pricing" className="py-24 bg-muted/40 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <Badge variant="vip" className="mb-4">كن محترفاً</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">اختر الباقة المناسبة لك</h2>
            <p className="text-foreground/60 max-w-2xl mx-auto">استثمر في تطوير مهاراتك وانضم لعضوية VIP للحصول على جميع المميزات</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans?.map((plan, i) => {
              const isPopular = plan.type === 'annual';
              const isVIP = plan.type !== 'demo';
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className={`relative ${isPopular ? '-mt-4 mb-4 md:mb-0 md:-mt-8' : ''}`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 inset-x-0 flex justify-center z-20">
                      <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 border-none text-black font-bold">الأكثر طلباً</Badge>
                    </div>
                  )}
                  <Card className={`h-full flex flex-col p-8 ${
                    isPopular
                      ? 'border-primary/50 shadow-[0_0_30px_rgba(234,88,12,0.15)] bg-card/95'
                      : 'border-border bg-muted/30'
                  }`}>
                    <div className="mb-8 text-center">
                      <h3 className="text-xl font-bold text-foreground/80 mb-2 uppercase tracking-wider">{
                        plan.type === 'demo' ? 'تجريبي' :
                        plan.type === 'annual' ? 'اشتراك سنوي' : 'مدى الحياة'
                      }</h3>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-5xl font-black">{plan.price}</span>
                      </div>
                      <p className="text-sm text-foreground/50 mt-2">{plan.durationDays ? `${plan.durationDays} يوم` : 'اشتراك دائم'}</p>
                    </div>

                    <div className="flex-1 space-y-4 mb-8">
                      {plan.description.split('\n').map((line, j) => (
                        <div key={j} className="flex items-start gap-3">
                          <CheckCircle2 className={`w-5 h-5 shrink-0 ${isVIP ? 'text-primary' : 'text-foreground/40'}`} />
                          <span className="text-sm text-foreground/80">{line}</span>
                        </div>
                      ))}
                    </div>

                    <Link href="/register">
                      <Button
                        variant={isPopular ? 'default' : 'outline'}
                        className={`w-full ${isPopular ? 'glow-primary' : ''}`}
                      >
                        اشترك الآن
                      </Button>
                    </Link>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>
      </>
      )}
    </div>
  );
}

/* ─── Floating device render (entrance + gentle infinite float; clean device, no screen overlay) ─── */
function FloatDevice({
  src,
  alt,
  wrapperClassName = "",
  rotate = 0,
  duration = 6,
  amplitude = 16,
  delay = 0,
  overlay,
}: {
  src: string;
  alt: string;
  wrapperClassName?: string;
  rotate?: number;
  duration?: number;
  amplitude?: number;
  delay?: number;
  overlay?: (size: { w: number; h: number }) => React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!overlay) return;
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [overlay]);

  return (
    <div className={wrapperClassName}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 36, rotate }}
        animate={{ opacity: 1, scale: 1, y: 0, rotate }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay }}
      >
        {/* float container holds image + projected screen so they move together */}
        <motion.div
          animate={{ y: [0, -amplitude, 0] }}
          transition={{ duration, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 }}
        >
          <div ref={boxRef} className="relative">
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="w-full h-auto select-none drop-shadow-2xl"
            />
            {overlay && size.w > 0 && size.h > 0 && overlay(size)}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ─── Matrix-style falling code columns (subtle, behind devices) ─── */
function MatrixRain() {
  const reduce = useReducedMotion();
  const columns = useMemo(() => {
    const chars = "01ABCDEF#$<>{}/\\*+=01x10";
    const cols = 30;
    return Array.from({ length: cols }, (_, i) => ({
      left: (i / cols) * 100 + Math.random() * 1.5,
      text: Array.from({ length: 30 }, () => chars[Math.floor(Math.random() * chars.length)]),
      duration: 7 + Math.random() * 9,
      delay: -Math.random() * 12,
      opacity: 0.24 + Math.random() * 0.20,
    }));
  }, []);

  if (reduce) return null;

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
      style={{ maskImage: "radial-gradient(140% 105% at 50% 42%, transparent 6%, black 58%)", WebkitMaskImage: "radial-gradient(140% 105% at 50% 42%, transparent 6%, black 58%)" }}
      aria-hidden
    >
      {columns.map((c, i) => (
        <div key={i} className="absolute top-0 h-full" style={{ left: `${c.left}%` }}>
          <motion.div
            className="flex flex-col font-mono text-[13px] leading-[1.2] text-emerald-400"
            style={{ opacity: c.opacity }}
            animate={{ y: ["-50%", "0%"] }}
            transition={{ duration: c.duration, delay: c.delay, repeat: Infinity, ease: "linear" }}
          >
            {[...c.text, ...c.text].map((ch, j) => (
              <span key={j} className={j % c.text.length === 0 ? "text-orange-400" : undefined}>{ch}</span>
            ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
}

/* ─── Slowly falling padlocks (very subtle) ─── */
function FallingLocks() {
  const reduce = useReducedMotion();
  const locks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: 3 + Math.random() * 94,
        size: 18 + Math.random() * 24,
        duration: 18 + Math.random() * 16,
        delay: -Math.random() * 30,
        rotate: -18 + Math.random() * 36,
        light: i % 2 === 0,
      })),
    []
  );

  if (reduce) return null;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      {locks.map((l, i) => (
        <div key={i} className="absolute top-0" style={{ left: `${l.left}%` }}>
          <motion.div
            initial={{ y: "-14vh", opacity: 0 }}
            animate={{ y: ["-14vh", "112vh"], opacity: [0, 0.5, 0.5, 0], rotate: [0, l.rotate] }}
            transition={{ duration: l.duration, delay: l.delay, repeat: Infinity, ease: "linear" }}
          >
            <Lock
              style={{ width: l.size, height: l.size, filter: "drop-shadow(0 0 6px rgba(251,146,60,0.45))" }}
              strokeWidth={2.2}
              className={l.light ? "text-orange-300" : "text-orange-400"}
            />
          </motion.div>
        </div>
      ))}
    </div>
  );
}

/* ─── Floating capability badge (glassmorphism) ─── */
function HeroBadge({
  icon: Icon,
  label,
  className = "",
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`absolute z-40 ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, delay }}
      >
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: delay + 0.5 }}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur-md whitespace-nowrap"
        >
          <Icon className="w-4 h-4 text-orange-400" />
          {label}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ─── Circuit board SVG pattern ─── */
function CircuitPattern() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="circuit" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M0 40 H30 M50 40 H80 M40 0 V30 M40 50 V80" stroke="white" strokeWidth="1" fill="none" />
          <circle cx="40" cy="40" r="4" fill="none" stroke="white" strokeWidth="1" />
          <circle cx="0" cy="40" r="2" fill="white" />
          <circle cx="80" cy="40" r="2" fill="white" />
          <circle cx="40" cy="0" r="2" fill="white" />
          <circle cx="40" cy="80" r="2" fill="white" />
          <rect x="20" y="20" width="10" height="10" fill="none" stroke="white" strokeWidth="0.8" />
          <rect x="50" y="50" width="10" height="10" fill="none" stroke="white" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit)" />
    </svg>
  );
}

