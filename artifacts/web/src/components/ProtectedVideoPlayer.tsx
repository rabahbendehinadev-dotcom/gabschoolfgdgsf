import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui";

interface ProtectedVideoPlayerProps {
  driveUrl: string;
  username?: string;
  email?: string;
  videoId?: number;
  onViolation?: (count: number) => void;
}

function extractDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function getDrivePreviewUrl(url: string): string {
  if (!url) return "";
  const fileId = extractDriveFileId(url);
  if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
  if (url.includes("/preview")) return url;
  return url;
}

const WATERMARK_POSITIONS = [
  { top: "10%", left: "10%" },
  { top: "10%", left: "60%" },
  { top: "40%", left: "20%" },
  { top: "40%", left: "55%" },
  { top: "70%", left: "10%" },
  { top: "70%", left: "65%" },
  { top: "55%", left: "40%" },
  { top: "25%", left: "38%" },
];

type Warning = "first" | "second" | "blocked" | null;

// Minimum ms of focus-loss before counting as a screenshot attempt.
// Iframe clicks cause blur → focus in <80ms, screenshot tools take longer.
const MIN_BLUR_DURATION_MS = 200;
// Max ms — if user was away longer than this, it's probably just alt-tab browsing.
const MAX_BLUR_DURATION_MS = 45000;

export function ProtectedVideoPlayer({
  driveUrl,
  username,
  email,
  videoId,
  onViolation,
}: ProtectedVideoPlayerProps) {
  const previewUrl = getDrivePreviewUrl(driveUrl);
  const [wmIndex, setWmIndex] = useState(0);
  const [warning, setWarning] = useState<Warning>(null);
  const [videoDisabled, setVideoDisabled] = useState(false);
  const violationsRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<HTMLDivElement>(null);
  const blurTimeRef = useRef<number | null>(null);
  const hiddenTimeRef = useRef<number | null>(null);

  const watermarkLabel = username || email || "محمي";
  const wmPos = WATERMARK_POSITIONS[wmIndex % WATERMARK_POSITIONS.length];

  // Rotate watermark position
  useEffect(() => {
    const interval = setInterval(() => {
      setWmIndex(i => (i + 1) % WATERMARK_POSITIONS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const logViolation = useCallback(async (count: number) => {
    try {
      if (videoId) {
        await fetch(`/api/videos/${videoId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ count }),
        });
      }
    } catch { /* silent */ }
    onViolation?.(count);
  }, [videoId, onViolation]);

  const handleSuspiciousActivity = useCallback(() => {
    if (videoDisabled) return;
    violationsRef.current += 1;
    const count = violationsRef.current;

    if (count === 1) {
      setWarning("first");
    } else if (count === 2) {
      setWarning("second");
      logViolation(count);
    } else {
      setWarning("blocked");
      setVideoDisabled(true);
      logViolation(count);
    }
  }, [logViolation, videoDisabled]);

  useEffect(() => {
    // ── 1. Smart blur/focus detection ──────────────────────────────────────
    // When the window loses focus, record the time.
    // When it comes back, measure elapsed time:
    //   < MIN_BLUR_DURATION_MS  →  iframe click or other safe event, ignore
    //   between min and max     →  likely a screenshot tool opened, trigger
    const handleBlur = () => {
      blurTimeRef.current = Date.now();
    };
    const handleFocus = () => {
      if (blurTimeRef.current !== null) {
        const elapsed = Date.now() - blurTimeRef.current;
        blurTimeRef.current = null;
        if (elapsed >= MIN_BLUR_DURATION_MS && elapsed <= MAX_BLUR_DURATION_MS) {
          handleSuspiciousActivity();
        }
      }
    };

    // ── 2. Visibility change (tab hidden/shown) ─────────────────────────────
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenTimeRef.current = Date.now();
      } else if (hiddenTimeRef.current !== null) {
        const elapsed = Date.now() - hiddenTimeRef.current;
        hiddenTimeRef.current = null;
        if (elapsed >= MIN_BLUR_DURATION_MS && elapsed <= MAX_BLUR_DURATION_MS) {
          handleSuspiciousActivity();
        }
      }
    };

    // ── 3. Keyboard: PrintScreen / Mac shortcuts ────────────────────────────
    const handleKeydown = (e: KeyboardEvent) => {
      if (
        e.key === "PrintScreen" ||
        e.keyCode === 44 ||
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key))
      ) {
        handleSuspiciousActivity();
      }
    };
    // keyup as backup (some systems fire keyup but not keydown for PrtScn)
    const handleKeyup = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        handleSuspiciousActivity();
      }
    };

    // ── 4. Context menu & text selection ───────────────────────────────────
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const handleSelectStart = (e: Event) => { e.preventDefault(); };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("keyup", handleKeyup);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
      container.addEventListener("selectstart", handleSelectStart);
    }

    // ── 5. Focus-steal: keep keyboard focus on the page (not the iframe) ────
    const focusInterval = setInterval(() => {
      if (
        document.activeElement &&
        document.activeElement.tagName === "IFRAME" &&
        focusTrapRef.current
      ) {
        focusTrapRef.current.focus({ preventScroll: true });
      }
    }, 250);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("keyup", handleKeyup);
      clearInterval(focusInterval);
      if (container) {
        container.removeEventListener("contextmenu", handleContextMenu);
        container.removeEventListener("selectstart", handleSelectStart);
      }
    };
  }, [handleSuspiciousActivity]);

  const dismissWarning = () => setWarning(null);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Hidden focus trap — steals keyboard focus from iframe */}
      <div
        ref={focusTrapRef}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
      />

      {/* Aspect ratio 16:9 wrapper */}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>

        {/* Video player */}
        {!videoDisabled ? (
          <iframe
            src={previewUrl}
            className="absolute inset-0 w-full h-full rounded-2xl border border-white/10"
            allow="autoplay; fullscreen"
            allowFullScreen
            frameBorder="0"
            referrerPolicy="no-referrer"
            sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock"
          />
        ) : (
          <div className="absolute inset-0 rounded-2xl bg-black/90 border border-red-500/30 flex flex-col items-center justify-center">
            <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
            <p className="text-red-400 font-bold text-xl mb-2">تم تعطيل الفيديو</p>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              تم رصد نشاط مشبوه. تواصل مع الدعم لإعادة تفعيل الوصول.
            </p>
          </div>
        )}

        {/* Block the "open in external window" button in top-right of Drive iframe */}
        <div
          className="absolute top-0 right-0 z-30"
          style={{
            width: "110px",
            height: "52px",
            background: "black",
            borderTopRightRadius: "1rem",
            cursor: "default",
            pointerEvents: "all",
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />

        {/* Moving watermark — primary */}
        <div
          className="absolute z-20 transition-all duration-1000 pointer-events-none"
          style={{ top: wmPos.top, left: wmPos.left }}
        >
          <div
            className="text-white/25 font-bold text-xs md:text-sm whitespace-nowrap"
            style={{ transform: "rotate(-15deg)", textShadow: "0 0 8px rgba(0,0,0,0.9)" }}
          >
            {watermarkLabel}
          </div>
          <div
            className="text-white/20 font-bold text-[9px] md:text-xs whitespace-nowrap mt-0.5"
            style={{ transform: "rotate(-15deg)", textShadow: "0 0 8px rgba(0,0,0,0.9)" }}
          >
            محمي بالمنصة
          </div>
        </div>

        {/* Moving watermark — secondary (opposite corner) */}
        <div
          className="absolute z-20 transition-all duration-1000 pointer-events-none"
          style={{ bottom: wmPos.top, right: wmPos.left }}
        >
          <div
            className="text-white/18 font-bold text-xs whitespace-nowrap"
            style={{ transform: "rotate(10deg)", textShadow: "0 0 8px rgba(0,0,0,0.9)" }}
          >
            {watermarkLabel}
          </div>
        </div>
      </div>

      {/* Helper message */}
      <p className="text-xs text-muted-foreground text-center mt-3">
        إذا لم يعمل الفيديو، يرجى التأكد من تسجيل الدخول إلى حسابك المرتبط بالمنصة
      </p>

      {/* Warning: first attempt */}
      {warning === "first" && (
        <WarningModal
          icon={<AlertTriangle className="w-10 h-10 text-amber-400" />}
          title="⚠️ تحذير: تم رصد محاولة تصوير الشاشة"
          message="هذا المحتوى محمي. أي انتهاك يُسجَّل تلقائياً على حسابك."
          color="amber"
          onClose={dismissWarning}
        />
      )}

      {/* Warning: second attempt */}
      {warning === "second" && (
        <WarningModal
          icon={<ShieldAlert className="w-10 h-10 text-red-400" />}
          title="🚫 تحذير شديد"
          message="تم تسجيل نشاط غير مسموح. في حال التكرار سيتم حظر حسابك وإبلاغ الإدارة فوراً."
          color="red"
          onClose={dismissWarning}
        />
      )}

      {/* Blocked */}
      {warning === "blocked" && (
        <WarningModal
          icon={<ShieldAlert className="w-10 h-10 text-red-500" />}
          title="🚫 تم تسجيل المخالفة وحظر الوصول"
          message="تم تعطيل الفيديو مؤقتاً بسبب نشاط مشبوه متكرر. تواصل مع الإدارة."
          color="red"
          onClose={dismissWarning}
        />
      )}
    </div>
  );
}

function WarningModal({
  icon, title, message, color, onClose,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  color: "amber" | "red";
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm rounded-2xl">
      <div className={`mx-4 w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl ${
        color === "amber"
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-red-500/40 bg-red-950/60"
      }`}>
        <div className="flex justify-center mb-4">{icon}</div>
        <h3 className={`text-lg font-bold mb-3 ${color === "amber" ? "text-amber-300" : "text-red-400"}`}>
          {title}
        </h3>
        <p className="text-sm text-foreground/80 mb-6 leading-relaxed">{message}</p>
        <Button onClick={onClose} className="w-full" variant={color === "amber" ? "default" : "destructive"}>
          <X className="w-4 h-4 ml-2" />
          فهمت
        </Button>
      </div>
    </div>
  );
}
