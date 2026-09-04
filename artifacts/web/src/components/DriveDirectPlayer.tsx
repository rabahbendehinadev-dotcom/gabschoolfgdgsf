import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useAuth } from "@/lib/auth";

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
  const { driveIframeRevision } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [watermarkIndex, setWatermarkIndex] = useState(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const isFullscreen = isNativeFullscreen || isCssFullscreen;
  const iframeUrl = useMemo(() => {
    if (!email) return previewUrl;
    try {
      const url = new URL(previewUrl);
      if (url.hostname === "drive.google.com") {
        // A top-level Drive tab can choose among several signed-in Google
        // accounts, while an embedded preview may keep using the wrong default
        // account. Pin the preview to the same Google identity used for GAB.
        url.searchParams.set("authuser", email);
      }
      return url.toString();
    } catch {
      return previewUrl;
    }
  }, [previewUrl, email]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWatermarkIndex((current) => (current + 1) % WATERMARK_POSITIONS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      const fullscreenDocument = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fullscreenElement =
        document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      const active = fullscreenElement === containerRef.current;
      setIsNativeFullscreen(active);

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

  useEffect(() => {
    if (!isCssFullscreen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isCssFullscreen]);

  const toggleFullscreen = async () => {
    const container = containerRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };
    if (!container) return;

    if (isCssFullscreen) {
      setIsCssFullscreen(false);
      return;
    }

    const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
    if (isIPhone) {
      setIsCssFullscreen(true);
      return;
    }

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
    } catch {}
  };

  const identity = username || email || (userId ? `ID: ${userId}` : "مستخدم مصرح");
  const position = WATERMARK_POSITIONS[watermarkIndex];

  return (
    <div className="-mx-2 w-[calc(100%+1rem)] max-w-none space-y-3 lg:mx-0 lg:w-full">
      <div
        ref={containerRef}
        className={`overflow-hidden bg-black shadow-2xl ${
          isCssFullscreen
            ? "fixed inset-0 z-[9999] h-[100dvh] w-screen max-w-none rounded-none border-0"
            : `relative w-full ${
                isNativeFullscreen
                  ? "h-[100dvh] w-[100dvw] max-w-none rounded-none border-0"
                  : "aspect-video rounded-2xl border border-border"
              }`
        }`}
      >
        <iframe
          key={driveIframeRevision}
          src={iframeUrl}
          title={title ? `تشغيل ${title}` : "تشغيل الفيديو"}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
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
    </div>
  );
}