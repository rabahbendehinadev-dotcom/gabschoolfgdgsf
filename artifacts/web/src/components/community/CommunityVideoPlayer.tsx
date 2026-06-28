import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

const WM_POSITIONS = [
  { top: "12%", left: "8%" },
  { top: "68%", left: "62%" },
  { top: "42%", left: "30%" },
  { top: "20%", left: "68%" },
  { top: "74%", left: "12%" },
];

/**
 * Lightweight HTML5 player for community videos. The src is a short-lived,
 * per-viewer signed media URL (entitlement re-checked server-side on every
 * request). Adds anti-casual-download affordances + a moving username
 * watermark to match the platform's protected-content UX.
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
  const [wm, setWm] = useState(WM_POSITIONS[0]);
  const label = username || "محمي";

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % WM_POSITIONS.length;
      setWm(WM_POSITIONS[i]);
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

      {/* Moving watermark */}
      <div
        className="pointer-events-none absolute z-20 transition-all duration-1000"
        style={{ top: wm.top, left: wm.left }}
      >
        <div
          className="whitespace-nowrap text-xs font-bold text-white/25 md:text-sm"
          style={{ transform: "rotate(-15deg)", textShadow: "0 0 8px rgba(0,0,0,0.9)" }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
