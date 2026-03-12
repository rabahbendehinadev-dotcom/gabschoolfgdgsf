import { useRoute } from "wouter";
import { useGetVideo } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button } from "@/components/ui";
import { Crown, AlertTriangle, ArrowRight, PlaySquare } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";

export function VideoDetail() {
  const [, params] = useRoute("/videos/:id");
  const { user, getAuthHeaders } = useAuth();
  
  const id = params?.id ? parseInt(params.id) : 0;
  
  const { data: video, isLoading, error } = useGetVideo(id, { 
    request: getAuthHeaders(),
  });

  const isRestricted = (error instanceof Error && 'response' in error && (error as Error & { response: { status: number } }).response?.status === 403) || (video?.isVipOnly && user?.accountType !== 'vip');

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  if (isRestricted || error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center glass-card border-destructive/20">
          <div className="w-20 h-20 mx-auto bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
            {video?.isVipOnly ? <Crown className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-bold mb-4">
            {video?.isVipOnly ? "محتوى حصري للمشتركين (VIP)" : "غير مصرح لك بالمشاهدة"}
          </h2>
          <p className="text-muted-foreground mb-8">
            {"هذا الدرس متاح فقط لأصحاب الاشتراكات المدفوعة. قم بترقية حسابك الآن لتتمكن من المشاهدة."}
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/#pricing">
              <Button className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-bold">ترقية الحساب (VIP)</Button>
            </Link>
            <Link href="/videos">
              <Button variant="outline" className="w-full h-12">العودة للمكتبة</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!video) return null;

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <Link href="/videos" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors font-medium">
          <ArrowRight className="w-4 h-4 ml-2" /> العودة للدروس
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player */}
            <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
              {video.driveEmbedUrl ? (
                <iframe 
                  src={video.driveEmbedUrl} 
                  className="w-full h-full border-0" 
                  allow="autoplay; fullscreen"
                  allowFullScreen
                ></iframe>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <PlaySquare className="w-16 h-16 mb-4 opacity-20" />
                  <p>رابط الفيديو غير متوفر</p>
                </div>
              )}
            </div>

            {/* Title & Meta */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{video.categoryName}</Badge>
                {video.isVipOnly && <Badge variant="vip"><Crown className="w-3 h-3 ml-1"/> VIP</Badge>}
                <span className="text-sm text-muted-foreground">{formatDate(video.createdAt)}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{video.title}</h1>
            </div>
          </div>

          {/* Description Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-6 glass-card sticky top-24">
              <h3 className="text-xl font-bold mb-4 border-b border-white/10 pb-4">وصف الدرس</h3>
              <div className="prose prose-invert prose-orange max-w-none text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {video.description}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
