import { useGetPlaylists } from "@workspace/api-client-react/src/generated/api";
import { Playlist } from "@workspace/api-client-react/src/generated/api.schemas";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { GraduationCap, PlayCircle, Lock, ArrowLeft, BookOpen, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";

const ACCENTS = [
  { from: "#f97316", to: "#fb923c" },
  { from: "#8b5cf6", to: "#a78bfa" },
  { from: "#06b6d4", to: "#22d3ee" },
  { from: "#10b981", to: "#34d399" },
  { from: "#ef4444", to: "#f87171" },
  { from: "#3b82f6", to: "#60a5fa" },
];

function lessonsLabel(n: number) {
  if (n <= 0) return "قريباً";
  if (n === 1) return "درس واحد";
  if (n === 2) return "درسان";
  if (n <= 10) return `${n} دروس`;
  return `${n} درساً`;
}

function CourseCard({ playlist, index }: { playlist: Playlist & { imageUrl?: string | null }; index: number }) {
  const { user } = useAuth();
  const accent = ACCENTS[index % ACCENTS.length];
  const lessonCount = playlist.videos?.length ?? 0;
  const hasVipVideos = playlist.videos?.some(v => v.accessType === "vip");
  const isVip = user?.accountType === "vip";
  const hasImage = !!playlist.imageUrl;
  const isSoon = lessonCount === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: "easeOut" }}
      className="h-full"
    >
      <Link href={`/videos?courseId=${playlist.id}`}>
        <div className="group relative flex flex-col rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1.5 cursor-pointer h-full bg-card border border-white/8">

          {/* Cover — 16:9 */}
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
                  className="flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
                >
                  <GraduationCap className="h-10 w-10 text-white" />
                </div>
              </div>
            )}

            {/* Gradient overlay at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* Lesson badge */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm px-3 py-1.5 text-xs font-bold text-white">
              <PlayCircle className="h-3.5 w-3.5" />
              {lessonsLabel(lessonCount)}
            </div>

            {/* VIP badge */}
            {hasVipVideos && !isVip && (
              <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                <Lock className="h-3 w-3" />
                VIP
              </div>
            )}

            {/* Soon badge */}
            {isSoon && (
              <div className="absolute top-3 right-3 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-1 text-[11px] font-bold text-white border border-white/30">
                قريباً
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex flex-col flex-1 p-5">
            {/* Accent bar */}
            <div
              className="w-10 h-1 rounded-full mb-3"
              style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
            />

            <h3 className="text-base font-extrabold leading-snug text-foreground line-clamp-2 mb-2">
              {playlist.title}
            </h3>

            {playlist.description && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1 mb-4">
                {playlist.description}
              </p>
            )}

            {/* CTA */}
            <div
              className="mt-auto flex items-center gap-2 text-sm font-bold"
              style={{ color: accent.from }}
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1 duration-200" />
              استعراض الدروس
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function Courses() {
  const { data: playlists, isLoading } = useGetPlaylists();
  const visible = (playlists ?? []).filter(p => p.isVisible !== false);
  const totalLessons = visible.reduce((acc, p) => acc + (p.videos?.length ?? 0), 0);

  return (
    <div className="min-h-screen bg-background pb-28" dir="rtl">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 pt-10 pb-10 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <GraduationCap className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-foreground sm:text-4xl tracking-tight">الدورات التعليمية</h1>
              <p className="mt-2 text-base text-muted-foreground">اختر دورة وابدأ رحلتك نحو الاحتراف</p>
            </div>

            {/* Stats */}
            {!isLoading && visible.length > 0 && (
              <div className="flex items-center gap-6 mt-2">
                <div className="flex items-center gap-2 rounded-full bg-white/8 border border-white/10 px-4 py-2 text-sm">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground">{visible.length}</span>
                  <span className="text-muted-foreground">دورة</span>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/8 border border-white/10 px-4 py-2 text-sm">
                  <PlayCircle className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground">{totalLessons}</span>
                  <span className="text-muted-foreground">درس</span>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/8 border border-white/10 px-4 py-2 text-sm">
                  <Star className="h-4 w-4 text-amber-400" />
                  <span className="text-muted-foreground">جودة عالية</span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-3xl overflow-hidden">
                <div className="aspect-video animate-pulse bg-muted" />
                <div className="p-5 space-y-2.5">
                  <div className="h-3 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-3/4 animate-pulse rounded-lg bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded-lg bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
              <GraduationCap className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <p className="text-lg font-semibold text-muted-foreground">لا توجد دورات بعد</p>
            <p className="text-sm text-muted-foreground/60">ترقّب! سيتم إضافة دورات قريباً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((pl, i) => (
              <CourseCard key={pl.id} playlist={pl} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
