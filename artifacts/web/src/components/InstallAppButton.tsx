import { useState } from "react";
import { Download, Share, Plus, Smartphone } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { usePwaInstall } from "@/hooks/usePwaInstall";

type InstallAppButtonProps = {
  /** "navbar" = compact pill for the header, "menu" = full-width row for the mobile menu. */
  mode?: "navbar" | "menu";
  /** Called right before installing/opening the guide (e.g. to close the mobile menu). */
  onNavigate?: () => void;
};

export function InstallAppButton({ mode = "navbar", onNavigate }: InstallAppButtonProps) {
  const { canInstall, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);

  // Already running as an installed app → nothing to offer.
  if (isStandalone) return null;

  // The browser can install (native prompt) or it's iOS (manual guide).
  // Otherwise installation isn't supported → hide the button entirely.
  const supported = canInstall || isIOS;
  if (!supported) return null;

  const handleClick = async () => {
    onNavigate?.();
    if (canInstall) {
      await promptInstall();
    } else if (isIOS) {
      setIosOpen(true);
    }
  };

  return (
    <>
      {mode === "menu" ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-all w-full text-start"
        >
          <Download className="w-4 h-4" />
          تثبيت التطبيق
        </button>
      ) : (
        <Button
          type="button"
          onClick={handleClick}
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50"
        >
          <Download className="w-4 h-4" />
          تثبيت التطبيق
        </Button>
      )}

      {/* iOS Safari has no native install prompt → show a short visual guide. */}
      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent className="max-w-sm" dir="rtl" aria-describedby="ios-install-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              تثبيت التطبيق على iPhone
            </DialogTitle>
          </DialogHeader>

          <p id="ios-install-desc" className="text-sm text-muted-foreground leading-relaxed">
            لإضافة المنصة إلى الشاشة الرئيسية على جهاز iPhone أو iPad، اتبع الخطوتين
            التاليتين داخل متصفح Safari:
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Share className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium">
                ١. اضغط على زر <span className="font-bold">المشاركة</span> في شريط المتصفح.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium">
                ٢. اختر <span className="font-bold">إضافة إلى الشاشة الرئيسية</span>.
              </p>
            </div>
          </div>

          <Button onClick={() => setIosOpen(false)} className="w-full rounded-xl mt-1">
            فهمت
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
