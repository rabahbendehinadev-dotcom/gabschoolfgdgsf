import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, RefreshCw } from "lucide-react";

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
  title,
  username,
  email,
  userId,
}: DriveDirectPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [watermarkIndex, setWatermarkIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileFullscreenMode, setMobileFullscreenMode] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWatermarkIndex((current) => (current + 1) % WATERMARK_POSITIONS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setIframeFailed(false);
    setIframeKey(0);
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
      if (active) setMobileFullscreenMode(false);

      if (!active && !mobileFullscreenMode && "orientation" in screen) {
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
  }, [mobileFullscreenMode]);

  useEffect(() => {
    if (!mobileFullscreenMode) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFullscreenMode(false);
    };
    document.addEventListener("keydown", exitOnEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.removeEventListener("keydown", exitOnEscape);
      const orientation = screen.orientation as ScreenOrientation & {
        unlock?: () => void;
      };
      orientation.unlock?.();
    };
  }, [mobileFullscreenMode]);

  const tryLandscape = async () => {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "landscape") => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {
      // Orientation locking is best-effort and is commonly rejected by Safari.
    }
  };

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

    if (mobileFullscreenMode) {
      setMobileFullscreenMode(false);
      return;
    }

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
        setMobileFullscreenMode(true);
        void tryLandscape();
        return;
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const activeElement =
        document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      if (activeElement !== container) {
        setMobileFullscreenMode(true);
      }
      void tryLandscape();
    } catch {
      setMobileFullscreenMode(true);
      void tryLandscape();
    }
  };

  const retryPreview = () => {
    setIframeFailed(false);
    setIframeKey((current) => current + 1);
  };

  const identity = username || email || (userId ? `ID: ${userId}` : "مستخدم مصرح");
  const position = WATERMARK_POSITIONS[watermarkIndex];
  const fullscreenActive = isFullscreen || mobileFullscreenMode;

  return (
    <div className="-mx-2 w-[calc(100%+1rem)] max-w-none space-y-3 lg:mx-0 lg:w-full">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden bg-black shadow-2xl ${
          fullscreenActive
            ? mobileFullscreenMode
              ? "fixed inset-0 z-[99999] m-0 h-screen h-[100dvh] w-screen w-[100dvw] max-w-none rounded-none border-0 p-0"
              : "h-[100dvh] w-[100dvw] max-w-none rounded-none border-0"
            : "aspect-video rounded-2xl border border-border"
        }`}
      >
        <iframe
          key={`${previewUrl}-${iframeKey}`}
          src={previewUrl}
          title={title ? `تشغيل ${title}` : "تشغيل الفيديو"}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay"
          referrerPolicy="no-referrer"
          onError={() => setIframeFailed(true)}
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
          aria-label={fullscreenActive ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          title={fullscreenActive ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          className="absolute left-3 top-3 z-30 flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-10 sm:w-10"
        >
          {fullscreenActive ? (
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

        {iframeFailed && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
            <p className="text-sm font-semibold sm:text-base">
              تعذر تشغيل الفيديو حالياً. حاول مرة أخرى.
            </p>
            <button
              type="button"
              onClick={retryPreview}
              className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}