import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

/* مواقع عشوائية ضمن حدود آمنة — لا مكان ثابت يمكن قصّه أو تغطيته */
function randPos() {
  return {
    top: 10 + Math.random() * 58,
    left: 5 + Math.random() * 55,
    rot: -16 + Math.random() * 24,
  };
}

/**
 * Lightweight HTML5 player for community videos. The src is a short-lived,
 * per-viewer signed media URL (entitlement re-checked server-side on every
 * request). Adds anti-casual-download affordances + a moving viewer-identity
 * watermark (name + email + ID) to match the platform's protected-content UX.
 */
export function CommunityVideoPlayer({
  src,
  poster,
  username,
}: {
  src: string;
  poster?: string | null;
  username?: string | null;
}) {
  const { user } = useAuth();
  const [wm, setWm] = useState(() => randPos());
  const [wmSub, setWmSub] = useState(() => randPos());

  /* العلامة تحمل هوية المُشاهد (وليس ناشر الفيديو) لتتبّع مصدر أي تسريب */
  const name = user?.username || username || "محمي";
  const idLabel = user?.id ? `ID: ${user.id}` : null;
  const email = user?.email || null;

  useEffect(() => {
    const t = setInterval(() => {
      setWm(randPos());
      setWmSub(randPos());
    }, 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-black"
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        src={src}
        poster={poster || undefined}
        controls
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        playsInline
        preload="metadata"
        className="block w-full max-h-[70vh] bg-black"
      />

      {/* Protection strip */}
      <div className="pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-sm md:text-xs">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          محتوى محمي
        </div>
      </div>

      {/* العلامة المائية الرئيسية — واضحة وبلون قوي */}
      <div
        className="pointer-events-none absolute z-20 transition-all duration-1000 ease-in-out"
        style={{ top: `${wm.top}%`, left: `${wm.left}%` }}
      >
        <div className="text-start" style={{ transform: `rotate(${wm.rot}deg)` }}>
          <div
            className="whitespace-nowrap text-xs font-extrabold md:text-base"
            style={{ color: "rgba(255,255,255,0.9)", textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.85)" }}
          >
            {name}
          </div>
          {email && (
            <div
              className="mt-0.5 whitespace-nowrap text-[10px] font-bold md:text-sm"
              style={{ color: "rgba(251,191,36,0.9)", textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.85)", direction: "ltr" }}
            >
              {email}
            </div>
          )}
          <div
            className="mt-0.5 whitespace-nowrap text-[9px] font-bold md:text-xs"
            style={{ color: "rgba(255,255,255,0.7)", textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}
          >
            {idLabel ? `${idLabel} • ` : ""}GAB SCHOOL
          </div>
        </div>
      </div>

      {/* علامة ثانوية خفيفة في موقع آخر */}
      <div
        className="pointer-events-none absolute z-20 transition-all duration-1000 ease-in-out"
        style={{ top: `${wmSub.top}%`, left: `${wmSub.left}%` }}
      >
        <div
          className="whitespace-nowrap text-[9px] font-bold md:text-[11px]"
          style={{ transform: `rotate(${wmSub.rot}deg)`, color: "rgba(255,255,255,0.22)", textShadow: "0 0 8px rgba(0,0,0,0.7)", direction: "ltr" }}
        >
          {name}{idLabel ? ` • ${idLabel}` : ""}{email ? ` • ${email}` : ""}
        </div>
      </div>
    </div>
  );
}
