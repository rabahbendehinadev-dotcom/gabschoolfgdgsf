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
import { warmImages } from "@/lib/warmImages";
import iphoneLocked from "@assets/generated_images/hero_iphone_locked.webp";
import iphoneHome from "@assets/generated_images/hero_iphone_home.webp";
import androidUnlock from "@assets/generated_images/hero_android_unlock.webp";
import tabletClean from "@assets/generated_images/hero_tablet_clean.webp";
import { useLocale } from "@/i18n";
import { learningT } from "@/i18n/learningMessages";

const HOME_ACCENTS = [
  { from: "#f97316", to: "#fb923c" },
  { from: "#8b5cf6", to: "#a78bfa" },
  { from: "#06b6d4", to: "#22d3ee" },
  { from: "#10b981", to: "#34d399" },
  { from: "#ef4444", to: "#f87171" },
  { from: "#3b82f6", to: "#60a5fa" },
];

function HomeCourseCard({ playlist, index }: { playlist: Playlist & { imageUrl?: string | null; thumbnailUrl?: string | null }; index: number }) {
  const { locale, direction } = useLocale();
  const accent = HOME_ACCENTS[index % HOME_ACCENTS.length];
  const lessonCount = playlist.videos?.length ?? 0;
  const cardImage = (playlist as any).thumbnailUrl || playlist.imageUrl || null;
  const hasImage = !!cardImage;
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <Link href={`/videos?courseId=${playlist.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.06, duration: 0.4 }}
        className="group relative flex flex-col rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full bg-card border border-border"
      >
        <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: "16/9" }}>
          {hasImage ? (
            <>
              {!imgLoaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
              <img
                src={cardImage!}
                alt={playlist.title}
                fetchPriority={index < 3 ? "high" : undefined}
                loading={index < 6 ? "eager" : "lazy"}
                decoding="async"
                className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImgLoaded(true)}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </>
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
            {lessonCount > 0 ? `${lessonCount} ${learningT(locale, "learning.lesson", "درس")}` : learningT(locale, "learning.comingSoon", "قريباً")}
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
            {learningT(locale, "learning.start", "ابدأ التعلم")}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function HomeCoursesSection() {
  const { locale, direction } = useLocale();
  const { data: playlists, isLoading } = useGetPlaylists();

  /* تسخين أغلفة الدورات وصور الأقسام مسبقاً — تكون جاهزة قبل دخول الزائر */
  const { data: warmCategories } = useGetCategories();
  useEffect(() => {
    if (playlists) warmImages((playlists as (Playlist & { imageUrl?: string | null })[]).map(p => p.imageUrl));
  }, [playlists]);
  useEffect(() => {
    if (warmCategories) warmImages(warmCategories.map(c => c.imageUrl));
  }, [warmCategories]);

  const visible = ((playlists ?? []) as (Playlist & { imageUrl?: string | null })[])
    .filter(p => p.isVisible !== false)
    .slice(0, 6);

  if (isLoading || visible.length === 0) return null;

  return (
    <section className="py-16 bg-background" dir={direction}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold">
            <GraduationCap className="w-4 h-4" />
             {learningT(locale, "learning.highQuality", "تعلّم من الأفضل")}
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">{learningT(locale, "learning.availableCourses", "الدورات المتوفرة")}</h2>
          <p className="mt-3 text-muted-foreground text-sm">{learningT(locale, "learning.chooseCourse", "اختر دورتك وابدأ رحلتك نحو الاحتراف")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {visible.map((pl, i) => (
            <HomeCourseCard key={pl.id} playlist={pl} index={i} />
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/courses">
            <Button variant="outline" className="rounded-full px-8 gap-2 h-11 font-semibold">
              {learningT(locale, "learning.allCourses", "عرض جميع الدورات")}
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

        {/* ── Professional decoding background ── */}
        <DecodingBackground />

        {/* ── Slowly drifting locks ── */}
        <DriftingLocks />

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
          الدورات المتوفرة
      ══════════════════════════════════ */}
      <HomeCoursesSection />

      {/* ══════════════════════════════════
          قسم تثبيت التطبيق
      ══════════════════════════════════ */}
      <InstallAppSection />

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

/* ─── Professional Decoding Background (subtle, behind devices) ─── */
function DecodingBackground() {
  const reduce = useReducedMotion();
  const columns = useMemo(() => {
    const tokens = ["0", "1", "0", "1", "A", "B", "C", "D", "E", "F", "0x", "FF", "A1", "7E", "3C", "00", "01", "{", "}", "[", "]", "<", ">", "/", "\\", "#", "$", "*", "+", "-"];
    const cols = 20;
    return Array.from({ length: cols }, (_, i) => {
      const text = Array.from({ length: 24 }, () => ({
        char: tokens[Math.floor(Math.random() * tokens.length)],
        isOrange: Math.random() < 0.05,
      }));
      return {
        left: (i / cols) * 100 + (Math.random() * 2),
        text,
        duration: 50 + Math.random() * 70, // Very slow: 50s to 120s
        delay: -Math.random() * 100,
        opacity: 0.06 + Math.random() * 0.12, // Subtle teal/green
        isMobile: i % 4 === 0, // Five lightweight columns on mobile
      };
    });
  }, []);

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
      style={{ maskImage: "radial-gradient(140% 105% at 50% 42%, transparent 6%, black 58%)", WebkitMaskImage: "radial-gradient(140% 105% at 50% 42%, transparent 6%, black 58%)" }}
      aria-hidden
    >
      <style>{`
        @keyframes tech-drift-down {
          0% { transform: translateY(-50%); opacity: 0.62; }
          50% { opacity: 1; }
          100% { transform: translateY(0%); opacity: 0.62; }
        }
        @keyframes tech-drift-up {
          0% { transform: translateY(0%); opacity: 0.62; }
          50% { opacity: 1; }
          100% { transform: translateY(-50%); opacity: 0.62; }
        }
      `}</style>
      {columns.map((c, i) => (
        <div
          key={i}
          className={`absolute top-0 w-8 flex justify-center ${c.isMobile ? "flex" : "hidden md:flex"}`}
          style={{
            left: `${c.left}%`,
            opacity: c.opacity,
          }}
        >
          <div
            className="flex flex-col items-center justify-start font-mono text-[10px] md:text-[11px] leading-[2] text-teal-500/70"
            style={!reduce ? {
              animation: `${i % 2 === 0 ? 'tech-drift-down' : 'tech-drift-up'} ${c.duration}s linear infinite`,
              animationDelay: `${c.delay}s`
            } : {
              transform: 'translateY(-25%)'
            }}
          >
            {/* Block 1 */}
            <div className="flex flex-col items-center">
              {c.text.map((t, j) => (
                <span
                  key={`b1-${j}`}
                  className={t.isOrange ? "text-orange-500/80 font-bold" : undefined}
                >
                  {t.char}
                </span>
              ))}
            </div>
            {/* Block 2 (Clone for seamless loop) */}
            <div className="flex flex-col items-center" aria-hidden>
              {c.text.map((t, j) => (
                <span
                  key={`b2-${j}`}
                  className={t.isOrange ? "text-orange-500/80 font-bold" : undefined}
                >
                  {t.char}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Slowly drifting outline locks (subtle) ─── */
function DriftingLocks() {
  const reduce = useReducedMotion();
  const locks = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        left: 2 + Math.random() * 96,
        size: 14 + Math.random() * 10,
        duration: 60 + Math.random() * 60, // 60-120s
        delay: -Math.random() * 120,
        rotateStart: -8 + Math.random() * 16,
        rotateEnd: -8 + Math.random() * 16,
        opacity: 0.04 + Math.random() * 0.08, // very subtle
        isMobile: i % 4 === 0,
        staticTop: 10 + Math.random() * 80, // for reduced motion
      })),
    []
  );

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
      <style>{`
        @keyframes lock-drift-anim {
          0% { transform: translateY(110vh) rotate(var(--rot-start)); }
          100% { transform: translateY(-20vh) rotate(var(--rot-end)); }
        }
      `}</style>
      {locks.map((l, i) => (
        <div
          key={i}
          className={`absolute ${l.isMobile ? 'block' : 'hidden md:block'}`}
          style={{
            left: `${l.left}%`,
            top: reduce ? `${l.staticTop}%` : '0',
            opacity: l.opacity
          }}
        >
          <div
            style={!reduce ? {
              '--rot-start': `${l.rotateStart}deg`,
              '--rot-end': `${l.rotateEnd}deg`,
              animation: `lock-drift-anim ${l.duration}s linear infinite`,
              animationDelay: `${l.delay}s`,
            } as React.CSSProperties : {
              transform: `rotate(${l.rotateStart}deg)`
            }}
          >
            <Lock
              style={{ width: l.size, height: l.size }}
              strokeWidth={1.5}
              className="text-orange-500"
            />
          </div>
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

