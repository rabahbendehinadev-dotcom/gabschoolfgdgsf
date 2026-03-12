import { useRoute, useLocation } from "wouter";
import { useGetVideo } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button } from "@/components/ui";
import { Crown, ArrowRight, PlaySquare, ExternalLink, Lock, CalendarDays, Tag } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";

export function VideoDetail() {
  const [, params] = useRoute("/videos/:id");
  const [, navigate] = useLocation();
  const { user, getAuthHeaders } = useAuth();

  const id = params?.id ? parseInt(params.id) : 0;

  const { data: video, isLoading, error } = useGetVideo(id, {
    request: getAuthHeaders(),
  });

  const status = (error as (Error & { response?: { status: number } }) | null)?.response?.status;

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (status === 403) {
    const isVipRestricted = video?.accessType === "vip" || error;
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center glass-card border-amber-500/20">
          <div className="w-20 h-20 mx-auto bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mb-6">
            <Crown className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-4">
            {isVipRestricted ? "محتوى حصري VIP" : "يجب الاشتراك أولاً"}
          </h2>
          <p className="text-muted-foreground mb-8">
            {isVipRestricted
              ? "هذا الدرس متاح فقط لأصحاب اشتراكات VIP. قم بترقية حسابك الآن للوصول إليه."
              : "اشترك الآن للوصول إلى هذا الدرس وجميع الدروس الأخرى."}
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/subscribe">
              <Button className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold">
                <Crown className="w-4 h-4 ml-2" />
                {isVipRestricted ? "ترقية الحساب إلى VIP" : "الاشتراك الآن"}
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

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-4xl">

        {/* Back link */}
        <Link href="/videos" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors font-medium group">
          <ArrowRight className="w-4 h-4 ml-2 group-hover:-translate-x-1 transition-transform" />
          العودة للدروس
        </Link>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
          {video.title}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Tag className="w-3.5 h-3.5" />
            {video.categoryName}
          </span>
          <span className="text-white/20">•</span>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />
            {formatDate(video.createdAt)}
          </span>
          {video.accessType === "vip" && (
            <Badge variant="vip"><Crown className="w-3 h-3 ml-1" /> VIP</Badge>
          )}
          {video.accessType === "visitor" && (
            <Badge variant="outline" className="border-green-500/40 text-green-400">مجاني</Badge>
          )}
        </div>

        {/* Thumbnail + Watch Button */}
        <div className="relative w-full aspect-video bg-black/60 rounded-2xl overflow-hidden shadow-2xl border border-white/10 group mb-8">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <PlaySquare className="w-20 h-20 text-white/20" />
            </div>
          )}

          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-4 group-hover:bg-black/55 transition-all">
            {video.driveEmbedUrl ? (
              <a
                href={video.driveEmbedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xl shadow-2xl hover:scale-105 transition-transform duration-200"
              >
                <PlaySquare className="w-7 h-7" />
                شاهد الآن
                <ExternalLink className="w-5 h-5 opacity-70" />
              </a>
            ) : (
              <p className="text-white/60 text-sm">رابط الفيديو غير متوفر</p>
            )}
          </div>
        </div>

        {/* Description */}
        {video.description && (
          <Card className="p-6 glass-card">
            <h3 className="text-lg font-bold mb-4 text-primary border-b border-white/10 pb-3">
              وصف الدرس
            </h3>
            <div className="text-foreground/80 leading-loose whitespace-pre-wrap text-[15px]">
              {video.description}
            </div>

            {video.driveEmbedUrl && (
              <a
                href={video.driveEmbedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                فتح الدرس
              </a>
            )}
          </Card>
        )}

      </div>
    </div>
  );
}
