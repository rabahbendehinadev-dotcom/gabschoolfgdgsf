import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetVideo } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button } from "@/components/ui";
import { Crown, ArrowRight, PlaySquare, Lock, CalendarDays, Tag, Download } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { CourseVideoPlayer } from "@/components/CourseVideoPlayer";

export function VideoDetail() {
  const [, params] = useRoute("/videos/:id");
  const [, navigate] = useLocation();
  const { user, getAuthHeaders } = useAuth();
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);

  const id = params?.id ? parseInt(params.id) : 0;

  const { data: videoRaw, isLoading, error } = useGetVideo(id, {
    request: getAuthHeaders(),
  });

  const video = videoRaw as (typeof videoRaw & { softwareLink?: string | null }) | undefined;
  const status = (error as (Error & { response?: { status: number } }) | null)?.response?.status;

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (status === 403) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center glass-card border-amber-500/20">
          <div className="w-20 h-20 mx-auto bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mb-6">
            <Crown className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-4">
            هذا الفيديو متاح فقط للأعضاء المميزين
          </h2>
          <p className="text-muted-foreground mb-8">
            هذا الدرس حصري لأصحاب اشتراكات VIP. قم بترقية حسابك الآن للوصول الكامل.
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/subscribe">
              <Button className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold">
                <Crown className="w-4 h-4 ml-2" />
                ترقية الحساب إلى VIP
              </Button>
            </Link>
            <Link href="/videos">
              <Button variant="outline" className="w-full h-12">العودة للمكتبة</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (status === 401 || (!user && error)) {
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
  const activeVideoUrl = parts[selectedPartIndex]?.url ?? "";

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

            {/* Protected Video Player */}
            {activeVideoUrl ? (
              <div className="mb-8">
                <CourseVideoPlayer
                  key={`${id}-${selectedPartIndex}`}
                  src={activeVideoUrl}
                  hlsSrc={parts[selectedPartIndex]?.hlsUrl ?? null}
                  poster={video.thumbnailUrl}
                  title={video.title}
                  username={user?.username}
                  email={user?.email}
                  videoId={id}
                />
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
                  className="flex items-center gap-3 w-full px-6 py-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-400 uppercase">VIP</span>
                    </div>
                    <p className="font-bold text-foreground group-hover:text-amber-300 transition-colors">تحميل البرنامج</p>
                    <p className="text-xs text-muted-foreground">حصري لأعضاء VIP</p>
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
