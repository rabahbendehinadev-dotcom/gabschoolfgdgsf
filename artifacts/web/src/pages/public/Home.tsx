import { useState, useMemo, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui";
import { Link } from "wouter";
import { Play, CheckCircle2, Shield, Zap, Crown, Lock, Search, LayoutGrid, Cloud, Terminal, Unlock, Cpu, type LucideIcon } from "lucide-react";
import { useGetCategories, useGetSubscriptionPlans, useGetVideos } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { CategoryCard } from "@/components/public/CategoryCard";
import { CoursePlayer } from "@/components/public/CoursePlayer";
import iphoneLocked from "@assets/generated_images/hero_iphone_locked.png";
import iphoneHome from "@assets/generated_images/hero_iphone_home.png";
import androidUnlock from "@assets/generated_images/hero_android_unlock.png";
import tabletClean from "@assets/generated_images/hero_tablet_clean.png";

export function Home() {
  const { user, getAuthHeaders } = useAuth();
  const { data: categories } = useGetCategories();
  const { data: plans } = useGetSubscriptionPlans();
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const { data: videos } = useGetVideos({ categoryId: activeCategory }, { request: getAuthHeaders() });
  const { data: allVideos } = useGetVideos({}, { request: getAuthHeaders() });

  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    (allVideos ?? []).forEach(v => map.set(v.categoryId, (map.get(v.categoryId) ?? 0) + 1));
    return map;
  }, [allVideos]);

  const lessonsRef = useRef<HTMLDivElement>(null);
  const activeCategoryObj = categories?.find(c => c.id === activeCategory);

  // عند اختيار ماركة: مرّر بسلاسة إلى قسم دروسها أسفل الكروت
  useEffect(() => {
    if (activeCategory && lessonsRef.current) {
      lessonsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeCategory]);

  const isLoggedIn = !!user;
  const isDemo = user?.subscriptionType === "demo";
  const isVipUser = user?.accountType === "vip";
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
          ماركات الهواتف المدعومة (الكروت) + دروس الماركة المختارة أسفلها
      ══════════════════════════════════ */}
      <section id="courses" className="py-24 bg-background relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
              <Lock className="w-3.5 h-3.5 ml-1.5 inline-block" /> محتوى حصري
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">ماركات الهواتف المدعومة</h2>
            <p className="text-foreground/60 max-w-xl mx-auto">اختر الماركة لعرض دروسها بالأسفل، مرتّبة كمسار تعليمي متكامل</p>
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
                onSelect={() => setActiveCategory(cat.id)}
              />
            ))}
          </div>

          {/* (2) أسفل الكروت: دروس الماركة المختارة، أو رسالة في العرض الأولي */}
          {activeCategory ? (
            <div ref={lessonsRef} className="mt-16 scroll-mt-24 border-t border-border pt-12">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
                <h2 className="text-2xl md:text-3xl font-bold">
                  دروس {activeCategoryObj?.name ?? "القسم"}
                </h2>
                <button
                  onClick={() => setActiveCategory(undefined)}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  عرض كل الماركات
                </button>
              </div>

              {videos && videos.length > 0 ? (
                <CoursePlayer lessons={videos} accessInfo={accessInfo} key={activeCategory} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-foreground/40">
                  <Search className="w-12 h-12 mb-4 opacity-30" />
                  <p className="text-lg">لا توجد دروس في هذه الماركة بعد</p>
                </div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mt-14"
              >
                <p className="text-foreground/60 mb-5">اشترك الآن وابدأ مسيرتك نحو الاحتراف</p>
                <Link href="/subscribe">
                  <Button size="lg" className="rounded-full px-12 glow-primary">
                    اشترك وشاهد جميع الدروس
                    <Play className="w-5 h-5 mr-2" />
                  </Button>
                </Link>
              </motion.div>
            </div>
          ) : (
            <div className="mt-14 text-center bg-muted/40 rounded-2xl border border-border py-14 px-6">
              <LayoutGrid className="w-11 h-11 text-primary/60 mx-auto mb-4" />
              <h3 className="text-xl md:text-2xl font-bold mb-2">اختر ماركة لعرض دروسها</h3>
              <p className="text-foreground/60 max-w-md mx-auto">اضغط على أي ماركة بالأعلى لتظهر دروسها هنا، مرتّبة كمسار تعليمي متكامل.</p>
            </div>
          )}
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

