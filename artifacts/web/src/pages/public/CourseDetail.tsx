import { useState } from "react";
import { useGetPlaylist } from "@workspace/api-client-react/src/generated/api";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, PlayCircle, Lock, ArrowRight, ArrowLeft,
  Loader2, FolderOpen, ChevronLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type SectionVideo = {
  id: number;
  title: string;
  thumbnailUrl?: string | null;
  partNumber?: number | null;
  accessType?: string | null;
  isVisible?: boolean;
  createdAt: string;
};

type Section = {
  id: number;
  name: string;
  imageUrl?: string | null;
  accentColor?: string | null;
  videos: SectionVideo[];
};

/* ── بطاقة تصنيف ── */
function CategoryCard({
  section, index, onClick,
}: {
  section: Section;
  index: number;
  onClick: () => void;
}) {
  const accent = section.accentColor || "#f97316";
  const count = section.videos.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
    >
      <button
        onClick={onClick}
        className="group w-full text-right flex items-center gap-4 rounded-2xl border border-white/8 bg-card p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
      >
        {/* Icon / Image */}
        <div
          className="flex-shrink-0 flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden shadow-md"
          style={{ background: section.imageUrl ? undefined : `${accent}22` }}
        >
          {section.imageUrl ? (
            <img
              src={section.imageUrl}
              alt={section.name}
              className="h-full w-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <FolderOpen className="h-6 w-6" style={{ color: accent }} />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground leading-snug truncate">{section.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {count === 0 ? "قريباً" : count === 1 ? "درس واحد" : `${count} دروس`}
          </p>
          {/* Accent bar */}
          <div
            className="mt-2 h-0.5 w-10 rounded-full"
            style={{ background: accent }}
          />
        </div>

        {/* Arrow */}
        <ChevronLeft
          className="flex-shrink-0 h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:-translate-x-0.5 transition-all duration-200"
        />
      </button>
    </motion.div>
  );
}

/* ── صف فيديو ── */
function LessonRow({ video, index, isVip }: { video: SectionVideo; index: number; isVip: boolean }) {
  const locked = video.accessType === "vip" && !isVip;

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link href={locked ? "/subscribe" : `/videos/${video.id}`}>
        <div
          className={cn(
            "flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all duration-150",
            locked
              ? "opacity-60 cursor-not-allowed border-white/8"
              : "hover:shadow-md hover:-translate-y-0.5 cursor-pointer border-white/8 hover:border-primary/40"
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
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
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
              : <PlayCircle className="h-4 w-4 text-primary" />}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export function CourseDetail({ id }: { id: number }) {
  const { user, getAuthHeaders } = useAuth();
  const isVip = user?.accountType === "vip";
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState<Section | null>(null);

  const { data: playlist, isLoading, isError } = useGetPlaylist(id, { request: getAuthHeaders() });

  const isLocked = !isLoading && !isError && (playlist as typeof playlist & { locked?: boolean })?.locked === true;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center px-4" dir="rtl">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20">
          <Lock className="h-12 w-12 text-amber-400" />
        </div>
        <div className="max-w-sm">
          <h2 className="text-2xl font-extrabold text-foreground mb-3">الدورة غير مفعلة</h2>
          <p className="text-muted-foreground leading-relaxed">
            {user
              ? "هذه الدورة غير مفعلة في حسابك. تواصل مع الإدارة لتفعيل الوصول إليها."
              : "يجب تسجيل الدخول أولاً للوصول إلى هذه الدورة."}
          </p>
        </div>
        {!user ? (
          <Link href="/login">
            <button className="rounded-2xl bg-primary px-8 py-3 text-sm font-bold text-white shadow-md shadow-primary/30 hover:opacity-90 transition-opacity">
              تسجيل الدخول
            </button>
          </Link>
        ) : (
          <button onClick={() => navigate("/courses")} className="text-sm font-medium text-primary hover:underline">
            العودة إلى الدورات
          </button>
        )}
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

  const sections: Section[] = (playlist as typeof playlist & { sections?: Section[] }).sections ?? [];
  const imageUrl = (playlist as typeof playlist & { imageUrl?: string | null }).imageUrl;
  const totalLessons = sections.reduce((a, s) => a + s.videos.length, 0);
  const vipCount = sections.reduce((a, s) => a + s.videos.filter(v => v.accessType === "vip").length, 0);

  return (
    <div className="min-h-screen bg-background pb-28" dir="rtl">

      {/* ── Header ── */}
      <div className="border-b border-white/8 bg-card/80 backdrop-blur-sm px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => navigate("/courses")} className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowRight className="h-3.5 w-3.5" />
              الدورات
            </button>
            {activeSection && (
              <>
                <span>/</span>
                <button
                  onClick={() => setActiveSection(null)}
                  className="hover:text-foreground transition-colors"
                >
                  {playlist.title}
                </button>
                <span>/</span>
                <span className="text-foreground font-medium truncate max-w-[160px]">{activeSection.name}</span>
              </>
            )}
          </div>

          {/* Course info */}
          <div className="flex items-start gap-4">
            {imageUrl ? (
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
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
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{playlist.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FolderOpen className="h-3.5 w-3.5 text-primary" />
                  {sections.length} {sections.length === 1 ? "تصنيف" : "تصنيفات"}
                </span>
                <span className="flex items-center gap-1">
                  <PlayCircle className="h-3.5 w-3.5 text-primary" />
                  {totalLessons === 0 ? "لا توجد دروس بعد" : `${totalLessons} درس`}
                </span>
                {vipCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400 font-medium border border-amber-500/20">
                    {vipCount} VIP
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <AnimatePresence mode="wait">

          {/* ── View A: Categories ── */}
          {!activeSection && (
            <motion.div
              key="categories"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {sections.length === 0 ? (
                <div className="py-20 text-center">
                  <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">لم يتم ربط أي تصنيف بهذه الدورة بعد</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {sections.map((sec, i) => (
                    <CategoryCard
                      key={sec.id}
                      section={sec}
                      index={i}
                      onClick={() => setActiveSection(sec)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── View B: Videos of selected category ── */}
          {activeSection && (
            <motion.div
              key={`section-${activeSection.id}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Section header */}
              <div className="mb-5 flex items-center gap-3">
                <button
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  رجوع
                </button>
                <div className="h-4 w-px bg-border" />
                <h2 className="font-bold text-foreground">{activeSection.name}</h2>
                <span className="text-xs text-muted-foreground">
                  ({activeSection.videos.length === 0 ? "قريباً" : `${activeSection.videos.length} درس`})
                </span>
              </div>

              {activeSection.videos.length === 0 ? (
                <div className="py-16 text-center">
                  <PlayCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">لا توجد دروس في هذا التصنيف بعد</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {activeSection.videos.map((v, i) => (
                    <LessonRow key={v.id} video={v} index={i} isVip={isVip} />
                  ))}
                </div>
              )}

              {/* VIP upsell */}
              {!isVip && activeSection.videos.some(v => v.accessType === "vip") && (
                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
                  <Lock className="mx-auto mb-2 h-7 w-7 text-amber-400" />
                  <p className="mb-3 text-sm font-semibold text-foreground">
                    بعض الدروس متاحة لأعضاء VIP فقط
                  </p>
                  <Link href="/subscribe">
                    <button className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 hover:opacity-90 transition-opacity">
                      اشترك الآن للوصول الكامل
                    </button>
                  </Link>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
