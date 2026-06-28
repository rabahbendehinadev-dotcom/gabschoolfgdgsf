import { Link } from "wouter";
import { Lock, Crown, Play } from "lucide-react";

/**
 * Teaser shown to non-entitled viewers. The image src is a server-provided,
 * heavily-blurred low-res preview object — the original is never delivered.
 */
export function LockedMedia({
  previewUrl,
  mediaType,
  className,
}: {
  previewUrl?: string | null;
  mediaType: "image" | "video";
  className?: string;
}) {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-muted ${className || ""}`}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/25 to-amber-400/10" />
      )}
      <div className="absolute inset-0 bg-black/45" />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-white/15 backdrop-blur-md">
          {mediaType === "video" ? (
            <Play className="h-7 w-7 fill-white text-white" />
          ) : (
            <Lock className="h-6 w-6 text-white" />
          )}
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-extrabold text-white shadow-lg">
          <Crown className="h-3.5 w-3.5" />
          حصري لأعضاء VIP
        </div>

        <p className="max-w-[16rem] text-sm font-semibold text-white/90">
          {mediaType === "video"
            ? "هذا الفيديو متاح لأعضاء VIP فقط"
            : "هذه الصورة متاحة لأعضاء VIP فقط"}
        </p>

        <Link href="/subscribe">
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-orange-600 shadow-md transition-shadow hover:shadow-lg">
            <Crown className="h-4 w-4" />
            ترقية العضوية
          </span>
        </Link>
      </div>
    </div>
  );
}
