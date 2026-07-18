import { useGetPlaylist } from "@workspace/api-client-react/src/generated/api";
import { PlaylistVideo } from "@workspace/api-client-react/src/generated/api.schemas";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { GraduationCap, PlayCircle, Lock, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

function LessonRow({ video, index, isVip }: { video: PlaylistVideo; index: number; isVip: boolean }) {
  const locked = video.accessType === "vip" && !isVip;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link href={locked ? "/subscribe" : `/videos/${video.id}`}>
        <div
          className={cn(
            "flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-all duration-150",
            locked
              ? "opacity-70 cursor-not-allowed border-border"
              : "hover:shadow-md hover:-translate-y-0.5 cursor-pointer border-border hover:border-primary/30"
          )}
        >
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
            locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          )}>
            {video.partNumber ?? index + 1}
          </div>

          {video.thumbnailUrl && (
            <div className="hidden sm:block h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm font-semibold leading-snug line-clamp-2",
              locked ? "text-muted-foreground" : "text-foreground"
            )}>
              {video.title}
            </p>
          </div>

          <div className="shrink-0">
            {locked
              ? <Lock className="h-4 w-4 text-muted-foreground" />
              : <PlayCircle className="h-4 w-4 text-primary" />
            }
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function CourseDetail({ id }: { id: number }) {
  const { user } = useAuth();
  const isVip = user?.accountType === "vip";
  const [, navigate] = useLocation();

  const { data: playlist, isLoading, isError } = useGetPlaylist(id);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !playlist) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center" dir="rtl">
        <GraduationCap className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">الدورة غير موجودة</p>
        <button onClick={() => navigate("/courses")} className="text-sm font-medium text-primary hover:underline">
          العودة إلى الدورات
        </button>
      </div>
    );
  }

  const videos = [...(playlist.videos ?? [])].sort(
    (a, b) => (a.partNumber ?? 999) - (b.partNumber ?? 999)
  );

  const totalLessons = videos.length;
  const vipCount = videos.filter(v => v.accessType === "vip").length;
  const freeCount = totalLessons - vipCount;
  const imageUrl = (playlist as typeof playlist & { imageUrl?: string | null }).imageUrl;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-24" dir="rtl">
      {/* Header */}
      <div className="border-b border-border bg-white/90 backdrop-blur-sm px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => navigate("/courses")}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            الدورات
          </button>

          <div className="flex items-start gap-4">
            {imageUrl ? (
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
                <img src={imageUrl} alt={playlist.title} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
                {playlist.title}
              </h1>
              {playlist.description && (
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {playlist.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <PlayCircle className="h-3.5 w-3.5 text-primary" />
                  {totalLessons === 0 ? "لا توجد دروس بعد" : `${totalLessons} درس`}
                </span>
                {freeCount > 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700 font-medium border border-green-200">
                    {freeCount} مجاني
                  </span>
                )}
                {vipCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 font-medium border border-amber-200">
                    {vipCount} VIP
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lessons list */}
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {videos.length === 0 ? (
          <div className="py-16 text-center">
            <PlayCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لم يتم ربط أي تصنيف بهذه الدورة بعد</p>
            <p className="text-xs text-muted-foreground/70 mt-1">اذهب إلى إدارة التصنيفات واربط التصنيف المناسب بهذه الدورة</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {videos.map((v, i) => (
              <LessonRow key={v.id} video={v} index={i} isVip={isVip} />
            ))}
          </div>
        )}

        {!isVip && vipCount > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 text-center">
            <Lock className="mx-auto mb-2 h-7 w-7 text-amber-500" />
            <p className="mb-3 text-sm font-semibold text-foreground">
              {vipCount} درس متاح لأعضاء VIP فقط
            </p>
            <Link href="/subscribe">
              <button className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 hover:opacity-90 transition-opacity">
                اشترك الآن للوصول الكامل
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
