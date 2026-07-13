import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  Lock, Crown, Play, Check, CheckCircle2, Clock,
  ChevronLeft, ChevronRight, ChevronDown, ListVideo, Download, PlaySquare, Loader2, FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Badge, Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useGetVideo, getGetVideoQueryKey } from "@workspace/api-client-react/src/generated/api";
import { CourseVideoPlayer } from "@/components/CourseVideoPlayer";

const FALLBACK_THUMB =
  "https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80";

interface AccessResult {
  isVipVideo: boolean;
  isVisitorVideo: boolean;
  videoLocked: boolean;
  lockMessage: string;
}

interface CoursePlayerProps {
  lessons: any[];
  accessInfo: (v: { accessType?: string }) => AccessResult;
}

/* مدة الدرس — تُعرض فقط إن كانت متوفرة (لا يوجد حقل مدة حالياً في قاعدة البيانات) */
function formatDuration(d?: string | number | null): string | null {
  if (d === undefined || d === null || d === "") return null;
  if (typeof d === "number") {
    const m = Math.floor(d / 60);
    const s = Math.floor(d % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return String(d);
}

export function CoursePlayer({ lessons, accessInfo }: CoursePlayerProps) {
  const { user, getAuthHeaders } = useAuth();
  const isLoggedIn = !!user;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);
  const [descOpen, setDescOpen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const total = lessons.length;
  const currentLesson = lessons[currentIndex];
  const currentAccess = accessInfo(currentLesson ?? {});
  const currentLocked = currentAccess.videoLocked;
  const lessonId = currentLesson?.id ?? 0;

  /* ── متابعة الدروس المُشاهَدة — محلية فقط (localStorage) دون أي تعديل على قاعدة البيانات ── */
  const storageKey = `gab_watched_${user?.id ?? "guest"}`;
  const [watched, setWatched] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setWatched(raw ? new Set(JSON.parse(raw) as number[]) : new Set());
    } catch {
      setWatched(new Set());
    }
  }, [storageKey]);

  const persistWatched = useCallback((next: Set<number>) => {
    setWatched(new Set(next));
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* تجاهل امتلاء التخزين */
    }
  }, [storageKey]);

  const toggleWatched = (id: number) => {
    const next = new Set(watched);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistWatched(next);
  };

  /* ── جلب الفيديو الكامل (الأجزاء المتعددة + برنامج VIP) فقط عند فتح درس متاح ── */
  const shouldFetch = !!currentLesson && !currentLocked;
  const { data: detailRaw, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = useGetVideo(
    lessonId,
    {
      request: getAuthHeaders(),
      query: { queryKey: getGetVideoQueryKey(lessonId), enabled: shouldFetch },
    },
  );
  const detail = detailRaw as
    | (typeof detailRaw & { softwareLink?: string | null })
    | undefined;

  // روابط البثّ الآمنة القادمة من الخادم (لا روابط Google Drive في المتصفّح)
  const parts = useMemo(() => detail?.streamParts ?? [], [detail]);

  const activeUrl = parts[selectedPartIndex]?.url ?? "";

  const selectLesson = (i: number) => {
    if (i < 0 || i >= total) return;
    setCurrentIndex(i);
    setSelectedPartIndex(0);
    setDescOpen(false);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      requestAnimationFrame(() =>
        playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  };

  if (total === 0) return null;

  const subscribeHref = isLoggedIn ? "/subscribe" : "/login";
  const currentDuration = formatDuration(
    (currentLesson as { duration?: string | number | null })?.duration,
  );
  const isCurrentWatched = currentLesson ? watched.has(currentLesson.id) : false;
  const vipDownload = user?.accountType === "vip" ? detail?.softwareLink : null;
  const description = detail?.description || currentLesson?.description;

  return (
    <div className="flex flex-col lg:flex-row gap-6" dir="rtl">
      {/* ════════ المشغّل (يسار على الكمبيوتر، أعلى على الجوال) ════════ */}
      <div ref={playerRef} className="flex-1 min-w-0 lg:order-2 scroll-mt-24">
        {/* منطقة الفيديو */}
        {currentLocked ? (
          <LockedPane
            access={currentAccess}
            subscribeHref={subscribeHref}
            thumb={currentLesson?.thumbnailUrl}
          />
        ) : !activeUrl && detailLoading ? (
          <div
            className="relative w-full rounded-2xl bg-black/90 border border-border"
            style={{ paddingBottom: "56.25%" }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
            </div>
          </div>
        ) : !activeUrl && detailError ? (
          <LockedPane
            access={currentAccess}
            subscribeHref={subscribeHref}
            thumb={currentLesson?.thumbnailUrl}
          />
        ) : activeUrl ? (
          <>
            {parts.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {parts.map((part, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPartIndex(i)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      selectedPartIndex === i
                        ? "bg-primary text-white shadow-lg shadow-primary/30"
                        : "bg-muted/60 text-foreground/60 border border-border hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <PlaySquare className="w-3.5 h-3.5" />
                    {part.label || `الجزء ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            <CourseVideoPlayer
              key={`${lessonId}-${selectedPartIndex}`}
              src={activeUrl}
              hlsSrc={parts[selectedPartIndex]?.hlsUrl ?? null}
              poster={currentLesson?.thumbnailUrl}
              title={currentLesson?.title}
              username={user?.username}
              email={user?.email}
              videoId={lessonId}
              onRetry={() => { refetchDetail(); }}
            />
          </>
        ) : (
          <div
            className="relative w-full rounded-2xl bg-muted/60 border border-border"
            style={{ paddingBottom: "56.25%" }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-foreground/40 text-sm flex items-center gap-2">
                <PlaySquare className="w-5 h-5" /> رابط الفيديو غير متوفر
              </p>
            </div>
          </div>
        )}

        {/* معلومات الدرس + التحكم */}
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              الحلقة {currentIndex + 1}
            </span>
            {currentAccess.isVipVideo && (
              <Badge
                variant="outline"
                className="bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-600 border-amber-500/30"
              >
                <Crown className="w-3 h-3 ml-1" /> VIP
              </Badge>
            )}
            {currentAccess.isVisitorVideo && (
              <Badge variant="outline" className="border-green-500/40 text-green-600">
                مجاني
              </Badge>
            )}
            {currentDuration && (
              <span className="text-xs text-foreground/50 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {currentDuration}
              </span>
            )}
            {isCurrentWatched && (
              <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> تمت المشاهدة
              </span>
            )}
          </div>

          <h2 className="text-xl md:text-2xl font-bold leading-snug">
            {currentLesson?.title}
          </h2>

          {/* أزرار التنقل + وضع علامة المشاهدة */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => selectLesson(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="gap-1.5 rounded-xl"
            >
              <ChevronRight className="w-4 h-4" /> الدرس السابق
            </Button>
            <Button
              variant="outline"
              onClick={() => selectLesson(currentIndex + 1)}
              disabled={currentIndex >= total - 1}
              className="gap-1.5 rounded-xl"
            >
              الدرس التالي <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => currentLesson && toggleWatched(currentLesson.id)}
              disabled={currentLocked}
              variant={isCurrentWatched ? "outline" : "default"}
              className={`gap-1.5 rounded-xl ${
                isCurrentWatched ? "border-green-500/40 text-green-600 hover:bg-green-500/5" : ""
              }`}
            >
              <Check className="w-4 h-4" />
              {isCurrentWatched ? "تم وضع علامة كمُشاهَد" : "تمت مشاهدة الدرس"}
            </Button>
          </div>

          {/* تحميل برنامج VIP */}
          {vipDownload && (
            <a
              href={vipDownload}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center gap-3 w-full px-5 py-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1 text-right">
                <div className="flex items-center gap-2 mb-0.5">
                  <Crown className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-600">VIP</span>
                </div>
                <p className="font-bold text-foreground group-hover:text-amber-700 transition-colors">
                  تحميل البرنامج
                </p>
                <p className="text-xs text-muted-foreground">حصري لأعضاء VIP</p>
              </div>
            </a>
          )}

          {/* وصف الدرس — يظهر مباشرة على الكمبيوتر فقط (على الجوال يصبح أكورديون أسفل القائمة) */}
          {description && (
            <div className="mt-5 hidden rounded-2xl border border-border bg-card p-5 lg:block">
              <h3 className="text-base font-bold mb-2.5 text-primary">وصف الدرس</h3>
              <p className="text-foreground/75 leading-loose whitespace-pre-wrap text-sm">
                {description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ════════ قائمة الدروس (يمين على الكمبيوتر، أسفل على الجوال) ════════ */}
      <div className="w-full lg:w-[370px] shrink-0 lg:order-1">
        <Card className="overflow-hidden border-border lg:sticky lg:top-24">
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <ListVideo className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-base">قائمة الدروس</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {total} {total === 1 ? "درس" : "دروس"}
            </p>
          </div>

          <div className="p-2 max-h-[60vh] lg:max-h-[640px] overflow-y-auto space-y-1">
            {lessons.map((lesson, i) => {
              const a = accessInfo(lesson);
              const isCurrent = i === currentIndex;
              const lessonWatched = watched.has(lesson.id);
              const dur = formatDuration(
                (lesson as { duration?: string | number | null }).duration,
              );
              return (
                <button
                  key={lesson.id}
                  onClick={() => selectLesson(i)}
                  className={`w-full text-right flex gap-3 p-2 rounded-xl transition-all group ${
                    isCurrent
                      ? "bg-primary/10 border border-primary/30"
                      : "border border-transparent hover:bg-muted/60"
                  }`}
                >
                  {/* مصغّرة */}
                  <div className="relative w-24 sm:w-28 aspect-video shrink-0 rounded-lg overflow-hidden bg-muted">
                    <img
                      src={lesson.thumbnailUrl || FALLBACK_THUMB}
                      alt={lesson.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {a.videoLocked ? (
                        <div className="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow">
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        </div>
                      )}
                    </div>
                    {dur && (
                      <span className="absolute bottom-1 left-1 bg-black/75 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {dur}
                      </span>
                    )}
                  </div>

                  {/* النص */}
                  <div className="flex-1 min-w-0 flex flex-col py-0.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[11px] font-bold ${
                          isCurrent ? "text-primary" : "text-foreground/50"
                        }`}
                      >
                        الحلقة {i + 1}
                      </span>
                      {a.isVipVideo && <Crown className="w-3 h-3 text-amber-500" />}
                      {a.isVisitorVideo && (
                        <span className="text-[9px] font-bold text-green-600 bg-green-500/10 px-1.5 rounded-full">
                          مجاني
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm font-semibold leading-snug line-clamp-2 ${
                        isCurrent ? "text-primary" : "text-foreground/85"
                      }`}
                    >
                      {lesson.title}
                    </p>
                    <div className="mt-auto pt-1 flex items-center gap-1.5">
                      {lessonWatched ? (
                        <span className="text-[10px] font-semibold text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> تمت المشاهدة
                        </span>
                      ) : a.videoLocked ? (
                        <span className="text-[10px] font-medium text-foreground/40 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> {a.isVipVideo ? "VIP" : "مقفل"}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-foreground/45">متاح</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ════════ وصف الدرس — أكورديون على الجوال فقط (أسفل قائمة الدروس) ════════ */}
      {description && (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card lg:hidden">
          <button
            type="button"
            onClick={() => setDescOpen((o) => !o)}
            aria-expanded={descOpen}
            className="flex w-full items-center justify-between px-4 py-3.5 text-right transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-2 text-base font-bold text-primary">
              <FileText className="h-4 w-4" />
              وصف الدرس
            </span>
            <ChevronDown
              className={`h-5 w-5 text-primary transition-transform duration-300 ${descOpen ? "rotate-180" : ""}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {descOpen && (
              <motion.div
                key="lesson-desc"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <p className="whitespace-pre-wrap border-t border-border px-4 py-4 text-sm leading-loose text-foreground/75">
                  {description}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* لوحة الدرس المقفل — لا يُحمَّل أي فيديو، حفاظاً على الصلاحيات تماماً */
function LockedPane({
  access,
  subscribeHref,
  thumb,
}: {
  access: AccessResult;
  subscribeHref: string;
  thumb?: string | null;
}) {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-border"
      style={{ paddingBottom: "56.25%" }}
    >
      <img
        src={thumb || FALLBACK_THUMB}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/75 to-black/55 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-4">
          {access.isVipVideo ? (
            <Crown className="w-8 h-8 text-amber-400" />
          ) : (
            <Lock className="w-7 h-7 text-white" />
          )}
        </div>
        <p className="text-white font-bold text-lg mb-1.5">{access.lockMessage}</p>
        <p className="text-white/70 text-sm mb-5 max-w-sm">
          {access.isVipVideo
            ? "هذا الدرس حصري لأعضاء VIP. قم بترقية حسابك للوصول الكامل."
            : "اشترك الآن للوصول إلى جميع دروس هذا القسم."}
        </p>
        <Link href={subscribeHref}>
          <Button size="lg" className="gap-2 shadow-lg">
            {access.isVipVideo ? (
              <>
                <Crown className="w-4 h-4" /> ترقية إلى VIP
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" /> عرض الاشتراكات
              </>
            )}
          </Button>
        </Link>
      </div>
    </div>
  );
}
