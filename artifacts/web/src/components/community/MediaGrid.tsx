import { useState } from "react";
import { CommunityMediaItem } from "@workspace/api-client-react/src/generated/api.schemas";
import { LockedMedia } from "./LockedMedia";
import { CommunityVideoPlayer } from "./CommunityVideoPlayer";
import { X, Play } from "lucide-react";

function Cell({
  item,
  username,
  className,
  onZoom,
  onPlay,
}: {
  item: CommunityMediaItem;
  username?: string | null;
  className?: string;
  onZoom: (url: string) => void;
  onPlay: (id: number) => void;
}) {
  if (item.locked) {
    return (
      <div className={className}>
        <LockedMedia previewUrl={item.previewUrl} mediaType={item.mediaType} />
      </div>
    );
  }

  if (item.mediaType === "video") {
    // Show poster with a play affordance; mount the heavy player on demand.
    return (
      <button
        type="button"
        onClick={() => onPlay(item.id)}
        className={`group relative ${className || ""}`}
      >
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-black/80" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
            <Play className="h-7 w-7 fill-orange-600 text-orange-600" />
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => item.fullUrl && onZoom(item.fullUrl)}
      className={`group relative cursor-zoom-in ${className || ""}`}
    >
      <img
        src={item.fullUrl || item.previewUrl || ""}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </button>
  );
}

export function MediaGrid({
  media,
  username,
}: {
  media: CommunityMediaItem[];
  username?: string | null;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);

  if (!media.length) return null;

  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  // A single, unlocked, playing video gets the full inline player.
  const single = sorted.length === 1 ? sorted[0] : null;
  if (single && single.mediaType === "video" && !single.locked && playing === single.id) {
    return (
      <CommunityVideoPlayer src={single.fullUrl || ""} poster={single.previewUrl} username={username} />
    );
  }

  const cellBase = "relative overflow-hidden rounded-[20px] bg-slate-100 border border-slate-200/60";

  // Layout: 1 → tall single; 2 → 2-up; 3 → 1 wide + 2; 4+ → 2×2 (+N overlay).
  let layout: React.ReactNode;
  if (sorted.length === 1) {
    const it = sorted[0];
    layout = (
      <Cell
        item={it}
        username={username}
        className={`${cellBase} w-full aspect-[4/3] sm:aspect-video`}
        onZoom={setZoom}
        onPlay={setPlaying}
      />
    );
  } else if (sorted.length === 2) {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        {sorted.map((it) => (
          <Cell
            key={it.id}
            item={it}
            username={username}
            className={`${cellBase} aspect-square`}
            onZoom={setZoom}
            onPlay={setPlaying}
          />
        ))}
      </div>
    );
  } else if (sorted.length === 3) {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        <Cell
          item={sorted[0]}
          username={username}
          className={`${cellBase} col-span-2 aspect-video`}
          onZoom={setZoom}
          onPlay={setPlaying}
        />
        {sorted.slice(1, 3).map((it) => (
          <Cell
            key={it.id}
            item={it}
            username={username}
            className={`${cellBase} aspect-square`}
            onZoom={setZoom}
            onPlay={setPlaying}
          />
        ))}
      </div>
    );
  } else {
    const shown = sorted.slice(0, 4);
    const extra = sorted.length - 4;
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        {shown.map((it, idx) => (
          <div key={it.id} className="relative">
            <Cell
              item={it}
              username={username}
              className={`${cellBase} aspect-square w-full`}
              onZoom={setZoom}
              onPlay={setPlaying}
            />
            {idx === 3 && extra > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[20px] bg-black/55 text-2xl font-extrabold text-white">
                +{extra}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {layout}

      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
            onClick={() => setZoom(null)}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoom}
            alt=""
            className="max-h-[90vh] max-w-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
