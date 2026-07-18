import { useGetPlaylists } from "@workspace/api-client-react/src/generated/api";
import { Playlist } from "@workspace/api-client-react/src/generated/api.schemas";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { GraduationCap, PlayCircle, Lock, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";

const PALETTE = [
  { bg: "from-orange-50 to-amber-50",   border: "border-orange-200",  icon: "text-orange-500",  btn: "text-orange-600" },
  { bg: "from-blue-50 to-sky-50",       border: "border-blue-200",    icon: "text-blue-500",    btn: "text-blue-600" },
  { bg: "from-violet-50 to-purple-50",  border: "border-violet-200",  icon: "text-violet-500",  btn: "text-violet-600" },
  { bg: "from-emerald-50 to-green-50",  border: "border-emerald-200", icon: "text-emerald-500", btn: "text-emerald-600" },
  { bg: "from-rose-50 to-pink-50",      border: "border-rose-200",    icon: "text-rose-500",    btn: "text-rose-600" },
  { bg: "from-cyan-50 to-teal-50",      border: "border-cyan-200",    icon: "text-cyan-500",    btn: "text-cyan-600" },
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
  const pal = PALETTE[index % PALETTE.length];
  const lessonCount = playlist.videos?.length ?? 0;
  const hasVipVideos = playlist.videos?.some(v => v.accessType === "vip");
  const isVip = user?.accountType === "vip";
  const hasImage = !!playlist.imageUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link href={`/courses/${playlist.id}`}>
        <div className="group relative flex flex-col rounded-2xl border border-border overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1 cursor-pointer h-full bg-white">
          {/* Cover */}
          <div className={`relative aspect-video overflow-hidden ${hasImage ? "" : `bg-gradient-to-br ${pal.bg}`}`}>
            {hasImage ? (
              <img
                src={playlist.imageUrl!}
                alt={playlist.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 shadow-sm ${pal.icon}`}>
                  <GraduationCap className="h-7 w-7" />
                </div>
              </div>
            )}
            {/* Lesson count */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-1 text-[11px] font-bold text-white">
              <PlayCircle className="h-3 w-3" />
              {lessonsLabel(lessonCount)}
            </div>
            {hasVipVideos && !isVip && (
              <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white">
                <Lock className="h-2.5 w-2.5" />
                VIP
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex flex-col flex-1 p-4">
            <h3 className="mb-1 text-sm font-extrabold leading-snug text-foreground line-clamp-2">
              {playlist.title}
            </h3>
            {playlist.description && (
              <p className="mb-3 text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                {playlist.description}
              </p>
            )}
            <div className={`mt-auto flex items-center gap-1 text-xs font-semibold ${pal.btn}`}>
              <ArrowLeft className="h-3 w-3" />
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-24" dir="rtl">
      {/* Header */}
      <div className="border-b border-border bg-white/80 backdrop-blur-sm px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-foreground sm:text-2xl">الدورات</h1>
              <p className="text-sm text-muted-foreground">اختر دورة وابدأ رحلتك</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">لا توجد دورات بعد</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((pl, i) => (
              <CourseCard key={pl.id} playlist={pl} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
