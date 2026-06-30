import { useState } from "react";
import { motion } from "framer-motion";
import { Smartphone } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { IosInstallGuide } from "@/components/IosInstallGuide";
import { useToast } from "@/hooks/use-toast";

/* ----------------------------- platform glyphs ---------------------------- */

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" fill="currentColor" className={className} aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function AndroidGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z" />
    </svg>
  );
}

/* ------------------------------ store button ------------------------------ */

function StoreButton({
  icon,
  small,
  big,
  onClick,
}: {
  icon: React.ReactNode;
  small: string;
  big: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3.5 rounded-2xl bg-neutral-900 px-5 py-3.5 text-start text-white shadow-lg shadow-black/25 ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-neutral-800 hover:shadow-xl hover:shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-white dark:text-neutral-900 dark:shadow-black/40 dark:ring-black/10 dark:hover:bg-neutral-100 sm:w-[320px]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[11px] font-medium text-white/65 dark:text-neutral-500">
          {small}
        </span>
        <span className="block whitespace-nowrap text-lg font-bold tracking-tight">{big}</span>
      </span>
    </button>
  );
}

/* -------------------------------- section --------------------------------- */

export function InstallAppSection() {
  const { canInstall, isStandalone, promptInstall } = usePwaInstall();
  const { toast } = useToast();
  const [iosOpen, setIosOpen] = useState(false);

  // Already running as an installed app → no need to advertise installation.
  if (isStandalone) return null;

  const showAndroidHint = () => {
    toast({
      title: "تثبيت التطبيق على Android",
      description:
        "افتح قائمة المتصفح (⋮) في الأعلى، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».",
    });
  };

  const handleAndroid = async () => {
    // Open the browser's own install dialog when available; otherwise guide the
    // user to the manual menu option. Never opens Google Play.
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === "unavailable") showAndroidHint();
      return;
    }
    showAndroidHint();
  };

  // iPhone has no native prompt → open the in-page step-by-step guide.
  // Never opens the App Store, no redirect/reload.
  const handleIphone = () => setIosOpen(true);

  return (
    <section className="relative bg-background py-14 lg:py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card to-muted/40 p-8 text-center shadow-sm sm:p-10"
        >
          {/* soft brand glows */}
          <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-6 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />

          <div className="relative">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary">
              <Smartphone className="h-3.5 w-3.5" />
              تطبيق GAB
            </span>

            <h2 className="text-2xl font-bold sm:text-3xl">ثبّت تطبيق GAB على هاتفك</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/60 sm:text-base">
              أضِف المنصة إلى شاشتك الرئيسية وافتحها كتطبيق كامل — وصول أسرع وإشعارات فورية، بدون أي
              متجر.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
              <StoreButton
                icon={<AppleGlyph className="h-7 w-7 text-white dark:text-neutral-900" />}
                small="أضف GAB إلى الشاشة الرئيسية"
                big="تثبيت على iPhone"
                onClick={handleIphone}
              />
              <StoreButton
                icon={<AndroidGlyph className="h-8 w-8 text-[#3DDC84]" />}
                small="ثبّت GAB كتطبيق على هاتفك"
                big="تثبيت على Android"
                onClick={handleAndroid}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* iPhone walkthrough — this section stays mounted, so a local dialog is safe. */}
      <IosInstallGuide open={iosOpen} onOpenChange={setIosOpen} />
    </section>
  );
}
