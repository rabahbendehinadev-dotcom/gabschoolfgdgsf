import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Crown, Lock, Play } from "lucide-react";
import { Video } from "@workspace/api-client-react/src/generated/api.schemas";

const FALLBACK_THUMB =
  "https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80";

interface LessonCardProps {
  video: Video;
  locked: boolean;
  isVip: boolean;
  isVisitor: boolean;
  href: string;
  episodeNumber?: number;
  index?: number;
}

export function LessonCard({
  video,
  locked,
  isVip,
  isVisitor,
  href,
  episodeNumber,
  index = 0,
}: LessonCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: (index % 8) * 0.05 }}
      className="h-full"
    >
      <Link href={href}>
        <div className="group h-full flex flex-col rounded-2xl overflow-hidden border border-border bg-card cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
          {/* Thumbnail */}
          <div className="relative aspect-video overflow-hidden bg-muted">
            {/* skeleton shimmer يظهر حتى تكتمل الصورة */}
            {!imgLoaded && (
              <div className="absolute inset-0 bg-muted animate-pulse" />
            )}
            <img
              src={video.thumbnailUrl || FALLBACK_THUMB}
              alt={video.title}
              loading={index < 6 ? "eager" : "lazy"}
              fetchPriority={index < 3 ? "high" : undefined}
              decoding="async"
              className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
            />
            {/* subtle bottom gradient only — no heavy black overlay */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />

            {/* small play indicator on hover (unlocked only) */}
            {!locked && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                  <Play className="w-5 h-5 ml-0.5" />
                </div>
              </div>
            )}

            {/* top-right status badges */}
            <div className="absolute top-2.5 right-2.5 flex gap-1.5">
              {isVip && (
                <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                  <Crown className="w-2.5 h-2.5" /> VIP
                </span>
              )}
              {isVisitor && (
                <span className="inline-flex items-center bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  مجاني
                </span>
              )}
            </div>

            {/* episode badge top-left */}
            {episodeNumber !== undefined && (
              <div className="absolute top-2.5 left-2.5">
                <span className="inline-flex items-center bg-white/90 backdrop-blur-sm text-foreground text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  الحلقة {episodeNumber}
                </span>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="p-4 flex flex-col flex-1">
            <h3
              className={`font-bold text-sm leading-snug line-clamp-2 transition-colors ${
                locked ? "text-foreground/80" : "group-hover:text-primary"
              }`}
            >
              {video.title}
            </h3>
            {video.description && (
              <p className="text-xs text-foreground/55 mt-1 line-clamp-1">
                {video.description}
              </p>
            )}

            <div className="mt-auto pt-3 flex items-center justify-between">
              {locked ? (
                <span className="text-[11px] font-semibold text-foreground/45 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> للمشتركين
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-green-600">
                  {isVisitor ? "مجاني" : "متاح"}
                </span>
              )}
              <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                {locked ? "اشترك" : "شاهد"}
                <Play className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
