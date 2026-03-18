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

export function ProtectedVideoPlayer({
  driveUrl,
  username,
  email,
  videoId,
  onViolation,
}: ProtectedVideoPlayerProps) {
  const previewUrl = getDrivePreviewUrl(driveUrl);
  const [wmIndex, setWmIndex] = useState(0);
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState<Warning>(null);
  const [videoDisabled, setVideoDisabled] = useState(false);
  const violationsRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const watermarkLabel = username || email || "محمي";
  const wmPos = WATERMARK_POSITIONS[wmIndex % WATERMARK_POSITIONS.length];

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
    } catch {}
    onViolation?.(count);
  }, [videoId, onViolation]);

  const handleSuspiciousActivity = useCallback(() => {
    violationsRef.current += 1;
    const count = violationsRef.current;
    setViolations(count);

    if (count === 1) {
      setWarning("first");
    } else if (count === 2) {
      setWarning("second");
    } else if (count >= 3) {
      setWarning("blocked");
      setVideoDisabled(true);
      logViolation(count);
    } else {
      logViolation(count);
    }
  }, [logViolation]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (
        e.key === "PrintScreen" ||
        e.keyCode === 44 ||
        (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5"))
      ) {
        handleSuspiciousActivity();
      }
    };
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const handleSelectStart = (e: Event) => { e.preventDefault(); };

    document.addEventListener("keydown", handleKeydown);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
      container.addEventListener("selectstart", handleSelectStart);
    }

    return () => {
      document.removeEventListener("keydown", handleKeydown);
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
      {/* Aspect ratio wrapper */}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        
        {/* Player */}
        {!videoDisabled ? (
          <iframe
            src={previewUrl}
            className="absolute inset-0 w-full h-full rounded-2xl border border-white/10"
            allow="autoplay; fullscreen"
            allowFullScreen
            frameBorder="0"
            referrerPolicy="no-referrer"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-pointer-lock allow-top-navigation"
            onContextMenu={(e) => e.preventDefault()}
            style={{ pointerEvents: videoDisabled ? "none" : "auto" }}
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

        {/* Invisible protection overlay to prevent right-click on iframe */}
        <div
          className="absolute inset-0 z-10"
          style={{ pointerEvents: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Moving watermark */}
        <div
          className="absolute z-20 transition-all duration-1000 pointer-events-none"
          style={{ top: wmPos.top, left: wmPos.left }}
        >
          <div
            className="text-white/20 font-bold text-xs md:text-sm whitespace-nowrap rotate-[-15deg]"
            style={{ textShadow: "0 0 8px rgba(0,0,0,0.8)" }}
          >
            {watermarkLabel}
          </div>
          <div
            className="text-white/15 font-bold text-[9px] md:text-xs whitespace-nowrap mt-0.5"
            style={{ textShadow: "0 0 8px rgba(0,0,0,0.8)" }}
          >
            محمي بالمنصة
          </div>
        </div>

        {/* Second watermark (mirrored position) */}
        <div
          className="absolute z-20 transition-all duration-1000 pointer-events-none"
          style={{
            bottom: wmPos.top,
            right: wmPos.left,
          }}
        >
          <div
            className="text-white/15 font-bold text-xs whitespace-nowrap rotate-[10deg]"
            style={{ textShadow: "0 0 8px rgba(0,0,0,0.8)" }}
          >
            {watermarkLabel}
          </div>
        </div>
      </div>

      {/* Error message below player */}
      <p className="text-xs text-muted-foreground text-center mt-3">
        إذا لم يعمل الفيديو، يرجى التأكد من تسجيل الدخول إلى حسابك المرتبط بالمنصة
      </p>

      {/* Warning Modal - First attempt */}
      {warning === "first" && (
        <WarningOverlay
          icon={<AlertTriangle className="w-10 h-10 text-amber-400" />}
          title="تحذير: تم رصد نشاط مشبوه"
          message="⚠️ تم رصد محاولة تصوير الشاشة. هذا المحتوى محمي وأي انتهاك يُسجَّل تلقائياً."
          color="amber"
          onClose={dismissWarning}
        />
      )}

      {/* Warning Modal - Second attempt */}
      {warning === "second" && (
        <WarningOverlay
          icon={<ShieldAlert className="w-10 h-10 text-red-400" />}
          title="تحذير شديد"
          message="🚫 تم تسجيل نشاط غير مسموح. في حال التكرار سيتم حظر حسابك وإبلاغ الإدارة فوراً."
          color="red"
          onClose={dismissWarning}
        />
      )}

      {/* Warning Modal - Blocked */}
      {warning === "blocked" && (
        <WarningOverlay
          icon={<ShieldAlert className="w-10 h-10 text-red-500" />}
          title="تم تسجيل المخالفة"
          message="🚫 تم تسجيل مخالفة على حسابك. تم تعطيل الفيديو مؤقتاً. تواصل مع الإدارة."
          color="red"
          onClose={dismissWarning}
        />
      )}
    </div>
  );
}

function WarningOverlay({
  icon,
  title,
  message,
  color,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  color: "amber" | "red";
  onClose: () => void;
}) {
  const borderClass = color === "amber" ? "border-amber-500/40" : "border-red-500/40";
  const bgClass = color === "amber" ? "bg-amber-500/10" : "bg-red-500/10";
  const titleClass = color === "amber" ? "text-amber-400" : "text-red-400";

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-2xl">
      <div className={`mx-4 w-full max-w-sm rounded-2xl border ${borderClass} ${bgClass} p-6 text-center shadow-2xl`}>
        <div className="flex justify-center mb-4">{icon}</div>
        <h3 className={`text-lg font-bold mb-3 ${titleClass}`}>{title}</h3>
        <p className="text-sm text-foreground/80 mb-6 leading-relaxed">{message}</p>
        <Button
          onClick={onClose}
          className="w-full"
          variant={color === "amber" ? "default" : "destructive"}
        >
          <X className="w-4 h-4 ml-2" />
          فهمت
        </Button>
      </div>
    </div>
  );
}
