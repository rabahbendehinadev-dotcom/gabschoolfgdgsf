import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, ShieldAlert, ShieldCheck, X, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui";

interface ProtectedVideoPlayerProps {
  driveUrl: string;
  username?: string;
  email?: string;
  videoId?: number;
  onViolation?: (count: number) => void;
}

/** النص التحذيري الرسمي — يظهر للمستخدم داخل المشغّل وأسفله. */
const SECURITY_WARNING_TEXT =
  "هذا المحتوى محمي ومخصص لحسابك فقط. أي محاولة تصوير أو مشاركة قد تؤدي إلى إيقاف حسابك.";

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const violationsRef = useRef(0);
  const reportedRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<HTMLDivElement>(null);

  const watermarkLabel = username || email || "محمي";
  const wmPos = WATERMARK_POSITIONS[wmIndex % WATERMARK_POSITIONS.length];

  const fullscreenSupported =
    typeof document !== "undefined" &&
    (document.fullscreenEnabled || Boolean((document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled));

  // Rotate watermark position
  useEffect(() => {
    const interval = setInterval(() => {
      setWmIndex(i => (i + 1) % WATERMARK_POSITIONS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // ── Report a suspicious security event to the server (deduped per type) ────
  const reportSecurity = useCallback(
    async (eventType: string, details?: string) => {
      if (!videoId) return;
      if (reportedRef.current.has(eventType)) return;
      reportedRef.current.add(eventType);
      try {
        await fetch(`/api/videos/${videoId}/security-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ eventType, details }),
        });
      } catch {
        /* silent — protection reporting must never break playback */
      }
    },
    [videoId],
  );

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

  // ── In-page fullscreen (keeps watermark + warning overlays visible) ───────
  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => void;
          msRequestFullscreen?: () => void;
        })
      | null;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
      msExitFullscreen?: () => void;
    };
    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!active) {
      const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      try {
        request?.call(el);
      } catch {
        /* ignore — unsupported */
      }
    } else {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      try {
        exit?.call(doc);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onFsChange = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  useEffect(() => {
    // ── 1. Keyboard: screenshot keys + devtools/save/view-source deterrents ──
    const handleKeydown = (e: KeyboardEvent) => {
      // Screenshot attempts (Windows PrintScreen / Mac Cmd+Shift+3/4/5)
      if (
        e.key === "PrintScreen" ||
        e.keyCode === 44 ||
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key))
      ) {
        handleSuspiciousActivity();
        return;
      }
      // DevTools / view-source / save-page deterrents
      const k = e.key.toLowerCase();
      const isDevtools =
        e.key === "F12" ||
        e.keyCode === 123 ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        ((e.ctrlKey || e.metaKey) && k === "u");
      const isSave = (e.ctrlKey || e.metaKey) && k === "s";
      if (isDevtools) {
        e.preventDefault();
        reportSecurity("devtools_attempt", `key:${e.key}`);
      } else if (isSave) {
        e.preventDefault();
      }
    };
    // keyup as backup — some systems fire keyup but not keydown for PrtScn
    const handleKeyup = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        handleSuspiciousActivity();
      }
    };

    // ── 2. Context menu, selection, copy, drag, middle-click prevention ─────
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportSecurity("copy_link_attempt", "contextmenu");
    };
    const handleSelectStart = (e: Event) => { e.preventDefault(); };
    const handleCopy = (e: Event) => {
      e.preventDefault();
      reportSecurity("copy_link_attempt", "copy");
    };
    const handleDragStart = (e: Event) => { e.preventDefault(); };
    const handleAuxClick = (e: MouseEvent) => {
      // middle / right click — often used to open the media in a new window
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        reportSecurity("external_open_attempt", "auxclick");
      }
    };

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("keyup", handleKeyup);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
      container.addEventListener("selectstart", handleSelectStart);
      container.addEventListener("copy", handleCopy);
      container.addEventListener("dragstart", handleDragStart);
      container.addEventListener("auxclick", handleAuxClick);
    }

    // ── 3. Focus-steal: keep keyboard focus on the page (not the iframe) ────
    const focusInterval = setInterval(() => {
      if (
        document.activeElement &&
        document.activeElement.tagName === "IFRAME" &&
        focusTrapRef.current
      ) {
        focusTrapRef.current.focus({ preventScroll: true });
      }
    }, 250);

    // ── 4. Conservative single-shot devtools-open size heuristic (log only) ─
    const THRESHOLD = 200;
    const devtoolsInterval = setInterval(() => {
      if (reportedRef.current.has("devtools_attempt")) {
        clearInterval(devtoolsInterval);
        return;
      }
      const widthGap = window.outerWidth - window.innerWidth;
      const heightGap = window.outerHeight - window.innerHeight;
      if (widthGap > THRESHOLD || heightGap > THRESHOLD) {
        reportSecurity("devtools_attempt", "size-heuristic");
      }
    }, 1500);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("keyup", handleKeyup);
      clearInterval(focusInterval);
      clearInterval(devtoolsInterval);
      if (container) {
        container.removeEventListener("contextmenu", handleContextMenu);
        container.removeEventListener("selectstart", handleSelectStart);
        container.removeEventListener("copy", handleCopy);
        container.removeEventListener("dragstart", handleDragStart);
        container.removeEventListener("auxclick", handleAuxClick);
      }
    };
  }, [handleSuspiciousActivity, reportSecurity]);

  const dismissWarning = () => setWarning(null);

  // Sizing for the video area: padding-box ratio normally, fit-to-viewport in fullscreen.
  const aspectBoxStyle: React.CSSProperties = isFullscreen
    ? {
        width: "min(100vw, calc(100vh * 16 / 9))",
        height: "min(100vh, calc(100vw * 9 / 16))",
      }
    : { width: "100%", aspectRatio: "16 / 9" };

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

      {/* Stage = fullscreen target. Holds the video + all in-player overlays. */}
      <div
        ref={stageRef}
        className={isFullscreen ? "flex items-center justify-center bg-black w-screen h-screen" : "relative w-full"}
      >
        {/* Aspect ratio 16:9 wrapper (fits viewport in fullscreen) */}
        <div className="relative w-full overflow-hidden rounded-2xl" style={aspectBoxStyle}>

          {/* Video player */}
          {!videoDisabled ? (
            <iframe
              src={previewUrl}
              className="absolute inset-0 w-full h-full rounded-2xl border border-white/10"
              allow="autoplay"
              frameBorder="0"
              referrerPolicy="no-referrer"
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

          {/* Invisibly block the Drive iframe's "open in new window" button (top-right).
              Transparent so it never shows a black box over the video; still intercepts the tap/click. */}
          <div
            className="absolute top-0 right-0 z-30 w-[64px] h-[40px] md:w-[110px] md:h-[52px]"
            style={{
              background: "transparent",
              cursor: "default",
              pointerEvents: "all",
            }}
            onClick={(e) => { e.stopPropagation(); reportSecurity("external_open_attempt", "popout-overlay"); }}
            onMouseDown={(e) => e.stopPropagation()}
          />

          {/* Custom in-page fullscreen button (top-left) */}
          {!videoDisabled && fullscreenSupported && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
              className="absolute top-2 left-2 z-40 flex items-center justify-center w-9 h-9 rounded-lg bg-black/55 hover:bg-black/75 text-white border border-white/15 backdrop-blur-sm transition-colors"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          )}

          {/* Persistent protection strip (top-center) */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[10px] md:text-xs font-semibold text-white/80 backdrop-blur-sm border border-white/10 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              محتوى محمي — مخصص لحسابك فقط
            </div>
          </div>

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

          {/* Persistent warning line (bottom) — stays visible in fullscreen too.
              Lighter & more compact on mobile so it never reads as a black overlay. */}
          <div className="absolute bottom-0 inset-x-0 z-20 pointer-events-none">
            <div className="bg-gradient-to-t from-black/40 md:from-black/70 to-transparent px-2 md:px-3 pb-1 md:pb-2 pt-3 md:pt-6 text-center">
              <p className="text-[8px] md:text-xs font-medium text-white/75 leading-snug line-clamp-2 md:line-clamp-none" dir="rtl">
                {SECURITY_WARNING_TEXT}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Prominent security warning banner (below the player) */}
      <div className="mt-3 md:mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 md:p-4" dir="rtl">
        <div className="flex items-start gap-2 md:gap-3 text-right">
          <ShieldAlert className="mt-0.5 w-4 h-4 md:w-5 md:h-5 shrink-0 text-red-400" />
          <p className="text-xs md:text-sm font-semibold leading-relaxed text-red-200">
            {SECURITY_WARNING_TEXT}
          </p>
        </div>
      </div>

      {/* Google account required notice */}
      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 md:p-4">
        <div className="flex items-start gap-3 text-right" dir="rtl">
          <div className="mt-0.5 shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300 mb-1">الفيديو لا يعمل داخل الصفحة؟</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              تأكد من تسجيل الدخول بنفس حساب Google الذي تم تفعيل الدورة عليه. الفيديو يُشاهَد داخل المنصة فقط.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="https://accounts.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                تسجيل الدخول إلى Google
              </a>
              <a
                href="https://accounts.google.com/AccountChooser"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-300 transition-colors"
              >
                تغيير حساب Google
              </a>
            </div>
          </div>
        </div>
      </div>

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
