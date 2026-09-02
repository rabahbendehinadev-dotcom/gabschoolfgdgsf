import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

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
  const [watermarkIndex, setWatermarkIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWatermarkIndex((current) => (current + 1) % WATERMARK_POSITIONS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const identity = username || email || (userId ? `ID: ${userId}` : "مستخدم مصرح");
  const position = WATERMARK_POSITIONS[watermarkIndex];

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-video overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
        <iframe
          src={previewUrl}
          title={title ? `تشغيل ${title} عبر Google Drive` : "تشغيل الفيديو عبر Google Drive"}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay"
          referrerPolicy="no-referrer"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 max-w-[38%] rounded-md bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/65 shadow-sm backdrop-blur-[2px] transition-all duration-700 sm:text-xs"
          style={position}
        >
          GAB Online · {identity}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/35 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          يتطلب حساب Google لديه صلاحية مشاهدة الملف.
        </span>
        {viewUrl && (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" />
            فتح في Google Drive
          </a>
        )}
      </div>
    </div>
  );
}