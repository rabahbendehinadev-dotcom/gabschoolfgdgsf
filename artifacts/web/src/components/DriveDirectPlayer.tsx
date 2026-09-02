import { useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize, Minimize, TriangleAlert } from "lucide-react";

interface DriveDirectPlayerProps {
  previewUrl: string;
  viewUrl?: string | null;
  title?: string;
  username?: string;
  email?: string;
  userId?: number;
}

const WATERMARK_POSITIONS = [
  { top: "10%", right: "8%" },
  { top: "18%", right: "58%" },
  { top: "47%", right: "18%" },
  { top: "70%", right: "55%" },
];

export function DriveDirectPlayer({
  previewUrl,
  viewUrl,
  title,
  username,
  email,
  userId,
}: DriveDirectPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [watermarkIndex, setWatermarkIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWatermarkIndex((current) => (current + 1) % WATERMARK_POSITIONS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setShowFallback(false);
  }, [previewUrl]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const fullscreenDocument = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fullscreenElement =
        document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      const active = fullscreenElement === containerRef.current;
      setIsFullscreen(active);

      if (!active && "orientation" in screen) {
        const orientation = screen.orientation as ScreenOrientation & {
          unlock?: () => void;
        };
        orientation.unlock?.();
      }
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };
    if (!container) return;

    const fullscreenElement =
      document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;

    try {
      if (fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await fullscreenDocument.webkitExitFullscreen?.();
        }
        return;
      }

      if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
      } else {
        setShowFallback(true);
        return;
      }

      try {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (orientation: "landscape") => Promise<void>;
        };
        await orientation.lock?.("landscape");
      } catch {
        // Orientation locking is best-effort and is not supported by every browser.
      }
    } catch {
      setShowFallback(true);
    }
  };

  const identity = username || email || (userId ? `ID: ${userId}` : "مستخدم مصرح");
  const position = WATERMARK_POSITIONS[watermarkIndex];

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden bg-black shadow-2xl ${
          isFullscreen
            ? "h-screen w-screen rounded-none border-0"
            : "aspect-video rounded-2xl border border-border"
        }`}
      >
        <iframe
          src={previewUrl}
          title={title ? `تشغيل ${title}` : "تشغيل الفيديو"}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay"
          referrerPolicy="no-referrer"
          onError={() => setShowFallback(true)}
        />

        <div
          aria-hidden="true"
          className="pointer-events-auto absolute right-1.5 top-1.5 z-30 h-11 w-11 cursor-default bg-transparent sm:right-2 sm:top-2 sm:h-12 sm:w-12"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          title={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          className="absolute left-3 top-3 z-30 flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-10 sm:w-10"
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" />
          ) : (
            <Maximize className="h-5 w-5" />
          )}
        </button>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 max-w-[38%] rounded-md bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/65 shadow-sm backdrop-blur-[2px] transition-all duration-700 sm:text-xs"
          style={position}
        >
          GAB Online · {identity}
        </div>
      </div>

      {viewUrl && (
        <div className="flex flex-col items-stretch gap-2 sm:items-start">
          {!showFallback ? (
            <button
              type="button"
              onClick={() => setShowFallback(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <TriangleAlert className="h-4 w-4" />
              تعذر تشغيل الفيديو داخل المشغل؟
            </button>
          ) : (
          <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" />
              فتح الفيديو في نافذة جديدة
            </a>
          )}
        </div>
      )}
    </div>
  );
}