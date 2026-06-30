import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { IosInstallGuide } from "@/components/IosInstallGuide";

type InstallAppButtonProps = {
  /** "navbar" = compact pill for the header, "menu" = full-width row for the mobile menu. */
  mode?: "navbar" | "menu";
  /** Called right before installing/opening the guide (e.g. to close the mobile menu). */
  onNavigate?: () => void;
  /**
   * Open a hoisted iOS guide that lives OUTSIDE this component's subtree. Pass
   * this whenever the button sits inside a container that unmounts on click
   * (e.g. a mobile menu that closes via `onNavigate`). Without it the locally
   * rendered dialog unmounts the instant the menu closes, so the modal flashes
   * open then disappears immediately.
   */
  onShowIosGuide?: () => void;
};

export function InstallAppButton({ mode = "navbar", onNavigate, onShowIosGuide }: InstallAppButtonProps) {
  const { canInstall, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);

  // Already running as an installed app → nothing to offer.
  if (isStandalone) return null;

  // The browser can install (native prompt) or it's iOS (premium guide).
  // Otherwise installation isn't supported → hide the button entirely.
  const supported = canInstall || isIOS;
  if (!supported) return null;

  const handleClick = async () => {
    if (canInstall) {
      // Android / desktop: the browser's own install prompt. Never on iOS.
      onNavigate?.();
      await promptInstall();
      return;
    }
    if (isIOS) {
      // iOS has no native prompt → open the in-page step-by-step guide.
      // No redirect, no reload.
      if (onShowIosGuide) {
        // The hoisted guide lives in a stable place, so it's safe to also
        // close the menu without unmounting the dialog.
        onShowIosGuide();
        onNavigate?.();
      } else {
        // Local fallback — only safe where this component stays mounted (e.g.
        // the desktop navbar). Do NOT call onNavigate here, or closing the
        // container would unmount the dialog before it can be seen.
        setIosOpen(true);
      }
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

      {/* iOS Safari has no native install prompt → premium step-by-step guide.
          Only render a local copy when no hoisted guide was provided. */}
      {!onShowIosGuide && <IosInstallGuide open={iosOpen} onOpenChange={setIosOpen} />}
    </>
  );
}
