import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, ShieldAlert, X, ExternalLink } from "lucide-react";
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

function getDriveViewUrl(url: string): string {
  if (!url) return "";
  const fileId = extractDriveFileId(url);
  if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
  return url.replace("/preview", "/view");
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    check();
    const mq = window.matchMedia("(max-width: 768px)");
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, []);
  return isMobile;
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
  const viewUrl = getDriveViewUrl(driveUrl);
  const isMobile = useIsMobile();
  const [wmIndex, setWmIndex] = useState(0);
  const [warning, setWarning] = useState<Warning>(null);
  const [videoDisabled, setVideoDisabled] = useState(false);
  const violationsRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<HTMLDivElement>(null);

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
    // ── 1. Keyboard: PrintScreen (Windows) / Cmd+Shift+3/4/5 (Mac) ─────────
    const handleKeydown = (e: KeyboardEvent) => {
      if (
        e.key === "PrintScreen" ||
        e.keyCode === 44 ||
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key))
      ) {
        handleSuspiciousActivity();
      }
    };
    // keyup as backup — some systems fire keyup but not keydown for PrtScn
    const handleKeyup = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        handleSuspiciousActivity();
      }
    };

    // ── 2. Context menu & text selection prevention ─────────────────────────
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const handleSelectStart = (e: Event) => { e.preventDefault(); };

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("keyup", handleKeyup);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
      container.addEventListener("selectstart", handleSelectStart);
    }

    // ── 3. Focus-steal: keep keyboard focus on the page (not the iframe) ────
    // This ensures keydown/keyup events reach our document listener
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

      {/* Direct open button — always visible, more prominent on mobile */}
      {viewUrl && (
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 flex items-center justify-center gap-2.5 w-full rounded-xl font-bold transition-all ${
            isMobile
              ? "bg-primary text-white py-4 text-base shadow-lg shadow-primary/30 hover:bg-primary/90"
              : "bg-primary/10 text-primary border border-primary/30 py-3 text-sm hover:bg-primary/20"
          }`}
        >
          <ExternalLink className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
          {isMobile ? "افتح الفيديو مباشرة 📱" : "فتح الفيديو في نافذة جديدة"}
        </a>
      )}

      {/* Google account required notice */}
      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3 text-right" dir="rtl">
          <div className="mt-0.5 shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300 mb-1">الفيديو لا يعمل داخل الصفحة؟</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {isMobile
                ? "متصفحات الهاتف قد تمنع تشغيل الفيديو مباشرة — اضغط الزر أعلاه لفتحه في تطبيق Drive أو متصفح جديد."
                : "يجب أن تكون مسجلاً في حساب Google المرتبط بحسابك على المنصة لكي تتمكن من مشاهدة الفيديوهات."}
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
