import { useState } from "react";
import { CommunityMediaItem } from "@workspace/api-client-react/src/generated/api.schemas";
import { LockedMedia } from "./LockedMedia";
import { CommunityVideoPlayer } from "./CommunityVideoPlayer";
import { X, Play, FileText, Download } from "lucide-react";
import { useLocale } from "@/i18n";
import { commerceMessage } from "@/i18n/communityCommerceMessages";

function Cell({
  item,
  username,
  className,
  imageClassName,
  onZoom,
  onPlay,
}: {
  item: CommunityMediaItem;
  username?: string | null;
  className?: string;
  imageClassName?: string;
  onZoom: (url: string) => void;
  onPlay: (id: number) => void;
}) {
  const { locale } = useLocale();
  const m = (key: string) => commerceMessage(locale, key);
  if (item.locked) {
    return (
      <div className={className}>
        <LockedMedia previewUrl={item.previewUrl} mediaType={item.mediaType} />
      </div>
    );
  }

  if (item.mediaType === "file") {
    return (
      <a
        href={item.fullUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex items-center gap-3 p-3 bg-slate-50/50 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer w-full text-right ${className?.replace('aspect-square', '') || ""}`}
        onClick={(e) => { if (!item.fullUrl) e.preventDefault(); }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 transition-colors group-hover:border-orange-200 group-hover:text-orange-500 shadow-sm">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{item.fileName || m("attachedFile")}</p>
          {item.sizeBytes ? (
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">
              {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </p>
          ) : null}
        </div>
        <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 group-hover:bg-white group-hover:text-orange-500 transition-colors shadow-sm opacity-0 group-hover:opacity-100">
          <Download className="h-4 w-4" />
        </div>
      </a>
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
            loading="lazy"
            decoding="async"
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
      className={`group relative flex cursor-zoom-in items-center justify-center bg-slate-100 ${className || ""}`}
    >
      <img
        src={item.thumbnailUrl || item.previewUrl || ""}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          const fallback = item.previewUrl;
          if (fallback && event.currentTarget.getAttribute("src") !== fallback) {
            event.currentTarget.setAttribute("src", fallback);
          }
        }}
        className={`block max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.01] ${imageClassName || "h-full w-full"}`}
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
  const { locale } = useLocale();
  const m = (key: string) => commerceMessage(locale, key);
  const [zoom, setZoom] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);

  if (!media.length) return null;

  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const files = sorted.filter(m => m.mediaType === "file");
  const visualMedia = sorted.filter(m => m.mediaType !== "file");

  // A single, unlocked, playing video gets the full inline player.
  const single = visualMedia.length === 1 ? visualMedia[0] : null;
  let layout: React.ReactNode = null;

  const cellBase = "relative overflow-hidden rounded-[20px] bg-slate-100 border border-slate-200/60";

  if (single && single.mediaType === "video" && !single.locked && playing === single.id) {
    layout = <CommunityVideoPlayer src={single.fullUrl || ""} poster={single.previewUrl} username={username} />;
  } else if (visualMedia.length === 1) {
    const it = visualMedia[0];
    layout = (
      <Cell
        item={it}
        username={username}
        className={`${cellBase} w-full min-h-48 max-h-[420px] md:max-h-[520px]`}
        imageClassName="h-auto w-auto max-h-[420px] md:max-h-[520px]"
        onZoom={setZoom}
        onPlay={setPlaying}
      />
    );
  } else if (visualMedia.length === 2) {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        {visualMedia.map((it) => (
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
  } else if (visualMedia.length === 3) {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        <Cell
          item={visualMedia[0]}
          username={username}
          className={`${cellBase} col-span-2 aspect-video`}
          onZoom={setZoom}
          onPlay={setPlaying}
        />
        {visualMedia.slice(1, 3).map((it) => (
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
  } else if (visualMedia.length > 3) {
    const shown = visualMedia.slice(0, 4);
    const extra = visualMedia.length - 4;
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
      <div className="space-y-3">
        {layout}
        {files.length > 0 && (
          <div className="flex flex-col gap-2">
            {files.map(f => (
              <Cell key={f.id} item={f} onZoom={() => {}} onPlay={() => {}} />
            ))}
          </div>
        )}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/75"
            onClick={() => setZoom(null)}
            aria-label={m("closeDialog")}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoom}
            alt=""
            decoding="async"
            className="max-h-[90vh] max-w-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
