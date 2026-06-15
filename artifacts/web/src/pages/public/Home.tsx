import { useState, useMemo, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui";
import { Link } from "wouter";
import { Play, CheckCircle2, Shield, Zap, Crown, Lock, Search, LayoutGrid, Cloud, Terminal, Unlock, Cpu, type LucideIcon } from "lucide-react";
import { useGetCategories, useGetSubscriptionPlans, useGetVideos } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { CategoryCard } from "@/components/public/CategoryCard";
import { LessonCard } from "@/components/public/LessonCard";
import iphoneLocked from "@assets/generated_images/hero_iphone_locked.png";
import iphoneHome from "@assets/generated_images/hero_iphone_home.png";
import androidUnlock from "@assets/generated_images/hero_android_unlock.png";
import tabletJailbreak from "@assets/generated_images/hero_tablet_jailbreak.png";

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

            {/* Tablet — jailbreak terminal (back layer) */}
            <FloatDevice
              src={tabletJailbreak}
              alt="iPad jailbreak terminal"
              wrapperClassName="absolute left-1/2 -translate-x-1/2 top-[4%] w-[62%] sm:w-[54%] max-w-[600px] z-10"
              rotate={-5}
              duration={7}
              amplitude={14}
              delay={0.15}
              overlay={(size) => <IPadTerminal size={size} />}
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

            {/* Center phone — iPhone: Apple logo → lock opens → "iCloud / UNLOCKED" */}
            <FloatDevice
              src={iphoneLocked}
              alt="iPhone locked screen"
              wrapperClassName="absolute left-1/2 -translate-x-1/2 bottom-0 w-[48%] sm:w-[34%] max-w-[290px] z-30"
              rotate={0}
              duration={5.5}
              amplitude={20}
              delay={0.1}
              overlay={(size) => <IPhoneUnlock size={size} />}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {videos.map((video, i) => {
                    const at = video.accessType || "normal";
                    const isVipVideo = at === "vip";
                    const isVisitorVideo = at === "visitor";
                    const videoLocked = isVisitorVideo ? false : isVipVideo ? !isVipUser : isLocked;
                    const href = videoLocked
                      ? (isLoggedIn ? "/subscribe" : "/login")
                      : `/videos/${video.id}`;

                    return (
                      <LessonCard
                        key={video.id}
                        video={video}
                        locked={videoLocked}
                        isVip={isVipVideo}
                        isVisitor={isVisitorVideo}
                        href={href}
                        episodeNumber={i + 1}
                        index={i}
                      />
                    );
                  })}
                </div>
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

/* ─── Floating device render (entrance + gentle infinite float + optional screen overlay) ─── */
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

/* ─── Screen glass corners (fractions of the image box) — order TL, TR, BL, BR ─── */
const IPHONE_SCREEN_CORNERS: [number, number][] = [
  [0.135, 0.150],
  [0.455, 0.098],
  [0.300, 0.730],
  [0.660, 0.620],
];
const TABLET_SCREEN_CORNERS: [number, number][] = [
  [0.380, 0.285],
  [0.835, 0.420],
  [0.165, 0.475],
  [0.670, 0.650],
];

/* ─── Apple logo (inline SVG; lucide has no Apple mark) ─── */
function AppleLogo({ style, className }: { style?: React.CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 384 512" fill="currentColor" style={style} className={className} aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

/* ─── iPhone (center): Apple → lock opens → "iCloud UNLOCKED" (projected on glass) ─── */
function IPhoneUnlock({ size }: { size: { w: number; h: number } }) {
  const { w, h } = size;
  const dest = IPHONE_SCREEN_CORNERS.map(([fx, fy]) => [fx * w, fy * h]) as number[][];
  const matrix = projectionMatrix(w, h, dest);
  const radius = Math.max(10, h * 0.055);
  const icon = Math.max(18, h * 0.11);
  const apple = Math.max(14, h * 0.085);

  return (
    <div
      className="absolute left-0 top-0 pointer-events-none overflow-hidden"
      style={{ width: w, height: h, transform: matrix, transformOrigin: "0 0", borderRadius: radius }}
    >
      {/* opaque screen so only the unlock animation shows (hides baked lockscreen) */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 35%, #0b1220 0%, #04070a 70%)" }} />

      {/* Apple logo */}
      <motion.div
        className="absolute inset-x-0 flex justify-center text-white/90"
        style={{ top: h * 0.13 }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <AppleLogo style={{ width: apple, height: apple }} />
      </motion.div>

      {/* padlock: locked → unlocked */}
      <div className="absolute" style={{ left: w * 0.5 - icon, top: h * 0.40, width: icon * 2, height: icon * 2 }}>
        <motion.div
          className="absolute inset-0 rounded-full bg-orange-500/45 blur-2xl"
          animate={{ opacity: [0.45, 0.85, 0.45], scale: [0.85, 1.12, 0.85] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center text-orange-400"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4, delay: 1.7 }}
        >
          <Lock style={{ width: icon, height: icon }} strokeWidth={2.2} />
        </motion.div>
        <motion.div
          className="absolute inset-0 flex items-center justify-center text-emerald-400"
          initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.5, delay: 1.8, ease: "backOut" }}
        >
          <Unlock style={{ width: icon, height: icon }} strokeWidth={2.2} />
        </motion.div>
      </div>

      {/* status text */}
      <motion.div
        className="absolute inset-x-0 text-center font-mono font-bold tracking-[0.25em] text-white"
        style={{ top: h * 0.60, fontSize: Math.max(8, h * 0.034) }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 2.05 }}
      >
        iCloud
      </motion.div>
      <motion.div
        className="absolute inset-x-0 text-center font-mono font-bold tracking-[0.2em] text-emerald-400"
        style={{ top: h * 0.665, fontSize: Math.max(7, h * 0.028) }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 2.3 }}
      >
        UNLOCKED ✓
      </motion.div>

      {/* glass reflection */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(150deg, rgba(255,255,255,0.14), transparent 42%)" }} />
    </div>
  );
}

/* ─── one scrolling terminal column ─── */
function TermColumn({ fontSize, lineGap, duration, delay = 0 }: { fontSize: number; lineGap: number; duration: number; delay?: number }) {
  return (
    <div className="flex-1 overflow-hidden">
      <motion.div
        className="font-mono leading-tight"
        style={{ fontSize }}
        animate={{ y: ["0%", "-50%"] }}
        transition={{ duration, delay, ease: "linear", repeat: Infinity }}
      >
        {[...TERM_LINES, ...TERM_LINES].map((ln, i) => (
          <div key={i} className="whitespace-nowrap" style={{ marginBottom: lineGap }}>
            {ln.prompt && <span className="text-orange-400">{ln.prompt}:~$ </span>}
            {ln.cmd && <span className="text-sky-300">{ln.cmd}</span>}
            {ln.out && (
              <span className={ln.ok ? "text-emerald-400" : ln.warn ? "text-amber-300" : "text-emerald-300/80"}>
                {ln.out}
              </span>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── iPad (back): live jailbreak terminal projected on the glass ─── */
function IPadTerminal({ size }: { size: { w: number; h: number } }) {
  const { w, h } = size;
  const dest = TABLET_SCREEN_CORNERS.map(([fx, fy]) => [fx * w, fy * h]) as number[][];
  const matrix = projectionMatrix(w, h, dest);
  const radius = Math.max(6, h * 0.02);
  const fontSize = Math.max(8, h * 0.04);
  const lineGap = h * 0.014;

  return (
    <motion.div
      className="absolute left-0 top-0 pointer-events-none overflow-hidden"
      style={{ width: w, height: h, transform: matrix, transformOrigin: "0 0", borderRadius: radius, background: "#04070a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
    >
      {/* header bar */}
      <div className="flex items-center gap-1.5" style={{ padding: `${h * 0.022}px ${w * 0.03}px`, fontSize: fontSize * 0.65 }}>
        <span className="rounded-full bg-red-500/80" style={{ width: fontSize * 0.45, height: fontSize * 0.45 }} />
        <span className="rounded-full bg-amber-400/80" style={{ width: fontSize * 0.45, height: fontSize * 0.45 }} />
        <span className="rounded-full bg-green-500/80" style={{ width: fontSize * 0.45, height: fontSize * 0.45 }} />
        <span className="ms-auto font-mono font-bold tracking-wider text-orange-400">root@device — jailbreak</span>
      </div>

      {/* two scrolling columns fill the wide screen */}
      <div className="absolute inset-x-0 flex" style={{ top: h * 0.075, bottom: h * 0.02, gap: w * 0.03, paddingInline: w * 0.03 }}>
        <TermColumn fontSize={fontSize} lineGap={lineGap} duration={19} />
        <TermColumn fontSize={fontSize} lineGap={lineGap} duration={24} delay={-6} />
      </div>

      {/* soft scanlines */}
      <div
        className="absolute inset-0 opacity-[0.10]"
        style={{ backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)" }}
      />
      {/* moving highlight sweep */}
      <motion.div
        className="absolute inset-x-0 h-1/3"
        style={{ background: "linear-gradient(180deg, transparent, rgba(94,234,212,0.10), transparent)" }}
        animate={{ y: ["-40%", "140%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* glass reflection */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(150deg, rgba(255,255,255,0.16), transparent 45%)" }} />
    </motion.div>
  );
}

const TERM_LINES: { prompt?: string; cmd?: string; out?: string; ok?: boolean; warn?: boolean }[] = [
  { prompt: "root@iPhone", cmd: "checkra1n -jb" },
  { out: "[*] booting pongoOS ..." },
  { out: "[+] exploit CVE-2024-23225", ok: true },
  { out: "[*] uploading bootstrap.dmg" },
  { prompt: "root@iPhone", cmd: "icloud --bypass" },
  { out: "[+] activation lock: REMOVED", ok: true },
  { out: "[+] FRP lock: CLEARED", ok: true },
  { prompt: "root@iPhone", cmd: "unlock --frp --imei" },
  { out: "[*] patching nvram ..." },
  { out: "[+] device: UNLOCKED", ok: true },
  { out: "[✓] jailbreak complete", ok: true },
  { prompt: "root@iPhone", cmd: "_" },
];

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

/* ─── 2D projective transform (rectangle → quad) helpers → CSS matrix3d ─── */
function adj(m: number[]) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}
function multmm(a: number[], b: number[]) {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[3 * i + j] += a[3 * i + k] * b[3 * k + j];
  return r;
}
function multmv(m: number[], v: number[]) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
function basisToPoints(p: number[][]) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
  const v = multmv(adj(m), [p[3][0], p[3][1], 1]);
  return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
function projectionMatrix(w: number, h: number, dest: number[][]) {
  const src: number[][] = [[0, 0], [w, 0], [0, h], [w, h]];
  const s = basisToPoints(src);
  const d = basisToPoints(dest);
  const t = multmm(d, adj(s));
  for (let i = 0; i < 9; i++) t[i] = t[i] / t[8];
  const m = [
    t[0], t[3], 0, t[6],
    t[1], t[4], 0, t[7],
    0, 0, 1, 0,
    t[2], t[5], 0, t[8],
  ];
  return `matrix3d(${m.join(",")})`;
}
