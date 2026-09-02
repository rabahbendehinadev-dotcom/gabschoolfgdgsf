import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetVideo } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button } from "@/components/ui";
import { Crown, ArrowRight, PlaySquare, Lock, CalendarDays, Tag, Download, Cloud, Server } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { CourseVideoPlayer } from "@/components/CourseVideoPlayer";
import { DriveDirectPlayer } from "@/components/DriveDirectPlayer";

const FALLBACK_THUMB =
  "https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80";

export function VideoDetail() {
  const [, params] = useRoute("/videos/:id");
  const [, navigate] = useLocation();
  const { user, getAuthHeaders, bootstrapped } = useAuth();
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<"server" | "drive">("server");

  const id = params?.id ? parseInt(params.id) : 0;

  const { data: videoRaw, isLoading, error } = useGetVideo(id, {
    request: getAuthHeaders(),
  });

  const video = videoRaw as (typeof videoRaw & { softwareLink?: string | null }) | undefined;
  // ApiError exposes .status directly; also support .response.status as fallback
  const apiErr = error as (Error & { status?: number; data?: unknown; response?: { status?: number } }) | null;
  const status = apiErr?.status ?? apiErr?.response?.status;

  if (isLoading || !bootstrapped) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  /* ── معالجة 403 — يُعرض preview مقفل بدل صفحة خطأ كاملة ── */
  if (status === 403) {
    // ApiError stores the parsed response body in .data (not .response.data)
    const preview = (apiErr?.data as any)?.preview as {
      title?: string;
      thumbnailUrl?: string | null;
      accessType?: string;
      categoryName?: string | null;
      description?: string | null;
    } | undefined;

    const isVipRequired = preview?.accessType === "vip";
    const thumb = preview?.thumbnailUrl || FALLBACK_THUMB;

    return (
      <div className="min-h-screen py-8">
        <div className="container mx-auto px-4 max-w-4xl">

          {/* رابط العودة */}
          <Link href="/videos" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors font-medium group">
            <ArrowRight className="w-4 h-4 ml-2 group-hover:-translate-x-1 transition-transform" />
            العودة للدروس
          </Link>

          {/* العنوان */}
          {preview?.title && (
            <h1 className="text-2xl md:text-3xl font-bold leading-tight mb-4">{preview.title}</h1>
          )}

          {/* معلومات */}
          {(preview?.categoryName || isVipRequired) && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {preview?.categoryName && (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Tag className="w-3.5 h-3.5" />{preview.categoryName}
                </span>
              )}
              {isVipRequired && (
                <Badge variant="vip"><Crown className="w-3 h-3 ml-1" /> VIP</Badge>
              )}
            </div>
          )}

          {/* منطقة الفيديو المقفل */}
          <div
            className="relative w-full rounded-2xl overflow-hidden border border-border mb-8"
            style={{ paddingBottom: "56.25%" }}
          >
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/75 to-black/55 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-4">
                {isVipRequired
                  ? <Crown className="w-8 h-8 text-amber-400" />
                  : <Lock className="w-7 h-7 text-white" />}
              </div>
              <p className="text-white font-bold text-lg mb-1.5">
                {isVipRequired
                  ? "مخصص لحسابات VIP فقط"
                  : user
                    ? "ترقية حسابك للمشاهدة"
                    : "اشترك لمشاهدة هذا الدرس"}
              </p>
              <p className="text-white/70 text-sm mb-5 max-w-sm">
                {isVipRequired
                  ? "هذا الدرس حصري لأعضاء VIP. قم بترقية حسابك للوصول الكامل."
                  : user
                    ? "قم بالاشتراك الآن للوصول إلى جميع الدروس."
                    : "سجّل الدخول واشترك للوصول إلى جميع الدروس."}
              </p>
              <Link href={user ? "/subscribe" : "/login"}>
                <Button size="lg" className="gap-2 shadow-lg">
                  {isVipRequired ? (
                    <><Crown className="w-4 h-4" /> ترقية إلى VIP</>
                  ) : user ? (
                    <><Lock className="w-4 h-4" /> عرض الاشتراكات</>
                  ) : (
                    <><Lock className="w-4 h-4" /> تسجيل الدخول</>
                  )}
                </Button>
              </Link>
            </div>
          </div>

          {/* الوصف */}
          {preview?.description && (
            <Card className="p-6 glass-card">
              <h3 className="text-lg font-bold mb-4 text-primary border-b border-border pb-3">
                وصف الدرس
              </h3>
              <div className="text-foreground/80 leading-loose whitespace-pre-wrap text-[15px]">
                {preview.description}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (status === 401) {
    navigate("/login");
    return null;
  }

  if (error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center glass-card">
          <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-4">تعذر تحميل الدرس</h2>
          <Link href="/videos"><Button variant="outline">العودة للمكتبة</Button></Link>
        </Card>
      </div>
    );
  }

  if (!video) return null;

  const parts = video.streamParts ?? [];
  const activePart = parts[selectedPartIndex];
  const activeVideoUrl = activePart?.url ?? "";
  const driveDirectAvailable = Boolean(activePart?.drivePreviewUrl);

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">

          {/* Main Content */}
          <div className="flex-1 min-w-0">

            {/* Back link */}
            <Link href="/videos" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors font-medium group">
              <ArrowRight className="w-4 h-4 ml-2 group-hover:-translate-x-1 transition-transform" />
              العودة للدروس
            </Link>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{video.title}</h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Tag className="w-3.5 h-3.5" />{video.categoryName}
              </span>
              <span className="text-foreground/20">•</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />{formatDate(video.createdAt)}
              </span>
              {video.accessType === "vip" && (
                <Badge variant="vip"><Crown className="w-3 h-3 ml-1" /> VIP</Badge>
              )}
              {video.accessType === "visitor" && (
                <Badge variant="outline" className="border-green-500/40 text-green-400">مجاني</Badge>
              )}
            </div>

            {/* Multi-part tabs */}
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

            {driveDirectAvailable && (
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1.5">
                <button
                  type="button"
                  onClick={() => setPlaybackMode("server")}
                  aria-pressed={playbackMode === "server"}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                    playbackMode === "server"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Server className="h-4 w-4" />
                  خادم المنصة
                </button>
                <button
                  type="button"
                  onClick={() => setPlaybackMode("drive")}
                  aria-pressed={playbackMode === "drive"}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                    playbackMode === "drive"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Cloud className="h-4 w-4" />
                  Google Drive مباشر
                </button>
              </div>
            )}

            {/* Protected Video Player */}
            {activeVideoUrl ? (
              <div className="mb-8">
                {playbackMode === "drive" && activePart?.drivePreviewUrl ? (
                  <DriveDirectPlayer
                    key={`drive-${id}-${selectedPartIndex}`}
                    previewUrl={activePart.drivePreviewUrl}
                    viewUrl={activePart.driveViewUrl}
                    title={video.title}
                    username={user?.username}
                    email={user?.email}
                    userId={user?.id}
                  />
                ) : (
                  <CourseVideoPlayer
                    key={`server-${id}-${selectedPartIndex}`}
                    src={activeVideoUrl}
                    hlsSrc={activePart?.hlsUrl ?? null}
                    lowSrc={activePart?.lowUrl ?? null}
                    poster={video.thumbnailUrl}
                    title={video.title}
                    username={user?.username}
                    email={user?.email}
                    userId={user?.id}
                    videoId={id}
                  />
                )}
              </div>
            ) : (
              <div className="relative w-full mb-8 bg-muted/60 rounded-2xl border border-border flex items-center justify-center" style={{ paddingBottom: "56.25%" }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-foreground/40 text-sm flex items-center gap-2">
                    <PlaySquare className="w-5 h-5" />
                    رابط الفيديو غير متوفر
                  </p>
                </div>
              </div>
            )}

            {/* VIP Software Download */}
            {user?.accountType === "vip" && !user.subscriptionIsExpired && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date()) && video.softwareLink && (
              <div className="mb-8">
                <a
                  href={video.softwareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-btn-glow flex items-center gap-4 w-full px-5 py-4 rounded-2xl bg-gradient-to-l from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Download className="w-6 h-6 text-white download-icon-animate" />
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-1.5 mb-0.5">
                      <Crown className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">VIP</span>
                    </div>
                    <p className="font-bold text-white text-base leading-tight">تحميل البرنامج</p>
                    <p className="text-xs text-emerald-100/80 mt-0.5">حصري لأعضاء VIP</p>
                  </div>
                </a>
              </div>
            )}

            {/* Description */}
            {video.description && (
              <Card className="p-6 glass-card">
                <h3 className="text-lg font-bold mb-4 text-primary border-b border-border pb-3">
                  وصف الدرس
                </h3>
                <div className="text-foreground/80 leading-loose whitespace-pre-wrap text-[15px]">
                  {video.description}
                </div>
              </Card>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
