import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Maximize, Minimize, RefreshCw, Wrench } from "lucide-react";

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

const REPAIR_PENDING_KEY = "gab-video-repair-pending";
const REPAIR_ATTEMPTS_KEY = "gab-video-repair-attempts";
const ACCOUNT_INITIALIZATION_URL = "https://accounts.google.com/";

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
  const [repairStatus, setRepairStatus] = useState<"idle" | "waiting" | "failed">("idle");
  const [showReinstallStep, setShowReinstallStep] = useState(false);
  const isIOS =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWatermarkIndex((current) => (current + 1) % WATERMARK_POSITIONS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setIframeFailed(false);
    setIframeKey(0);
    setRepairStatus("idle");
    setShowReinstallStep(false);
  }, [previewUrl]);

  useEffect(() => {
    let retryTimer: number | undefined;

    const retryPendingRepair = () => {
      const pendingValue = window.sessionStorage.getItem(REPAIR_PENDING_KEY);
      if (!pendingValue) return;

      const openedAt = Number(pendingValue);
      const elapsed = Number.isFinite(openedAt) ? Date.now() - openedAt : 1500;
      const delay = Math.max(0, 1200 - elapsed);

      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        if (!window.sessionStorage.getItem(REPAIR_PENDING_KEY)) return;

        window.sessionStorage.removeItem(REPAIR_PENDING_KEY);
        setIframeFailed(false);
        setIframeKey((current) => current + 1);
        const previousAttempts = Number(
          window.sessionStorage.getItem(REPAIR_ATTEMPTS_KEY) ?? "0",
        );
        const attempts = Number.isFinite(previousAttempts) ? previousAttempts + 1 : 1;
        window.sessionStorage.setItem(REPAIR_ATTEMPTS_KEY, String(attempts));
        setRepairStatus(attempts >= 2 ? "failed" : "idle");
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") retryPendingRepair();
    };

    window.addEventListener("pageshow", retryPendingRepair);
    window.addEventListener("focus", retryPendingRepair);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(retryTimer);
      window.removeEventListener("pageshow", retryPendingRepair);
      window.removeEventListener("focus", retryPendingRepair);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFullscreenMode(false);
    };
    document.addEventListener("keydown", exitOnEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.removeEventListener("keydown", exitOnEscape);
      window.scrollTo(0, scrollY);
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

    if (isIOS) {
      setMobileFullscreenMode(true);
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

  const startRepairFlow = () => {
    window.sessionStorage.setItem(REPAIR_PENDING_KEY, String(Date.now()));
    setRepairStatus("waiting");
    setShowReinstallStep(false);
    window.open(ACCOUNT_INITIALIZATION_URL, "_blank", "noopener,noreferrer");
  };

  const identity = username || email || (userId ? `ID: ${userId}` : "مستخدم مصرح");
  const position = WATERMARK_POSITIONS[watermarkIndex];
  const fullscreenActive = isFullscreen || mobileFullscreenMode;

  return (
    <div className="-mx-2 w-[calc(100%+1rem)] max-w-none space-y-3 lg:mx-0 lg:w-full">
      <div
        ref={containerRef}
        className={`w-full overflow-hidden bg-black shadow-2xl ${
          fullscreenActive
            ? mobileFullscreenMode
              ? "fixed inset-0 z-[999999] m-0 h-[100dvh] w-[100dvw] max-w-none rounded-none border-0 p-0"
              : "relative h-[100dvh] w-[100dvw] max-w-none rounded-none border-0"
            : "relative aspect-video rounded-2xl border border-border"
        }`}
      >
        <iframe
          key={`${previewUrl}-${iframeKey}`}
          src={previewUrl}
          title={title ? `تشغيل ${title}` : "تشغيل الفيديو"}
          className="absolute inset-0 z-0 h-full w-full border-0"
          allow="autoplay"
          referrerPolicy="no-referrer"
          onError={() => setIframeFailed(true)}
        />

        <div
          aria-hidden="true"
          className="pointer-events-auto absolute right-0 top-0 z-40 h-[52px] w-[52px] cursor-default bg-transparent"
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
          className="pointer-events-auto absolute left-3 top-3 z-40 flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-10 sm:w-10"
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
          <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
            <p className="text-sm font-semibold sm:text-base">
              تعذر تشغيل الفيديو حالياً. حاول مرة أخرى.
            </p>
            <button
              type="button"
              onClick={retryPreview}
              className="pointer-events-auto inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card px-3 py-3">
        <button
          type="button"
          onClick={startRepairFlow}
          className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Wrench className="h-4 w-4" />
          إصلاح تشغيل الفيديو
        </button>

        {repairStatus === "waiting" && (
          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
            أكمل الخطوات في النافذة المفتوحة، ثم ارجع إلى المنصة.
          </p>
        )}

        {repairStatus === "failed" && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-bold text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              تعذر تهيئة جلسة المشاهدة على هذا الجهاز.
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-foreground/80">
              على iPhone:
              <br />
              الإعدادات ← Apps ← Safari ← Advanced ← Website Data
            </p>
            <p className="mt-2 text-xs leading-5 text-foreground/75">
              ثم احذف فقط بيانات:
            </p>
            <ul className="mt-1 space-y-0.5 text-left text-xs leading-5 text-foreground/75" dir="ltr">
              <li>google.com</li>
              <li>accounts.google.com</li>
              <li>drive.google.com</li>
              <li>googleusercontent.com</li>
            </ul>
            <p className="mt-2 text-xs leading-5 text-foreground/75">
              بعدها أغلق التطبيق بالكامل وافتحه من جديد.
            </p>
            {!showReinstallStep ? (
              <button
                type="button"
                onClick={() => setShowReinstallStep(true)}
                className="mt-3 min-h-9 touch-manipulation text-xs font-bold text-amber-800 underline underline-offset-4"
              >
                استمرت المشكلة بعد تنفيذ الخطوات
              </button>
            ) : (
              <p className="mt-3 rounded-md border border-amber-500/30 bg-background/70 p-2 text-xs font-bold leading-5 text-foreground">
                احذف تطبيق GAB من الشاشة الرئيسية ثم أعد تثبيته.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}