import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Share,
  SquarePlus,
  ArrowDown,
  Check,
  Copy,
  Smartphone,
  Compass,
  Plus,
  Star,
  ChevronLeft,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getInAppBrowser, type InAppBrowser } from "@/lib/pwa";

type IosInstallGuideProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const IN_APP_LABEL: Record<NonNullable<InAppBrowser>, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  twitter: "X",
  linkedin: "LinkedIn",
  line: "LINE",
  webview: "هذا التطبيق",
};

const STEPS = [
  {
    title: "اضغط على زر المشاركة",
    desc: "في شريط الأدوات أسفل متصفح Safari، اضغط على زر المشاركة (Share).",
  },
  {
    title: "اختر «إضافة إلى الشاشة الرئيسية»",
    desc: "مرّر للأسفل داخل قائمة المشاركة، ثم اضغط على «Add to Home Screen».",
  },
  {
    title: "اضغط «إضافة»",
    desc: "اضغط زر «إضافة» (Add) في الأعلى، وسيظهر التطبيق على شاشتك الرئيسية فوراً.",
  },
] as const;

/* ---------------------------------- shell --------------------------------- */

function PhoneMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[190px] max-w-[62vw]">
      <div className="relative rounded-[2.3rem] border-[7px] border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 dark:border-zinc-700">
        <div className="absolute left-1/2 top-1.5 z-20 h-4 w-16 -translate-x-1/2 rounded-full bg-zinc-800 dark:bg-zinc-700" />
        <div className="relative aspect-[9/18] overflow-hidden rounded-[1.7rem] bg-gradient-to-b from-background to-muted">
          {children}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- step art -------------------------------- */

function ArtShareButton() {
  return (
    <div className="flex h-full flex-col">
      {/* faux page content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="h-2 w-20 rounded-full bg-foreground/15" />
        <div className="h-1.5 w-24 rounded-full bg-foreground/10" />
        <div className="h-1.5 w-16 rounded-full bg-foreground/10" />
      </div>

      {/* bouncing hint arrow pointing at the share icon */}
      <div className="relative">
        <motion.div
          className="absolute -top-7 left-1/2 -translate-x-1/2 text-primary"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowDown className="h-6 w-6 drop-shadow" strokeWidth={2.6} />
        </motion.div>

        {/* Safari bottom toolbar */}
        <div className="flex items-center justify-around border-t border-border bg-card/90 px-2 py-2 backdrop-blur">
          <ChevronLeft className="h-4 w-4 text-foreground/30" />
          <ChevronLeft className="h-4 w-4 rotate-180 text-foreground/30" />
          <span className="relative inline-flex">
            <motion.span
              className="absolute inset-0 -m-1.5 rounded-xl ring-2 ring-primary"
              animate={{ opacity: [0.4, 1, 0.4], scale: [0.92, 1.05, 0.92] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Share className="h-4 w-4" strokeWidth={2.4} />
            </span>
          </span>
          <Star className="h-4 w-4 text-foreground/30" />
          <Copy className="h-4 w-4 text-foreground/30" />
        </div>
      </div>
    </div>
  );
}

function ArtShareSheet() {
  return (
    <div className="relative h-full">
      <div className="absolute inset-0 bg-black/35" />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="absolute inset-x-1.5 bottom-1.5 rounded-2xl bg-card p-2 shadow-2xl"
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-foreground/20" />
        <div className="mb-2 flex gap-2 px-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-8 w-8 rounded-full bg-foreground/10" />
              <div className="h-1 w-7 rounded-full bg-foreground/10" />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <SheetRow icon={<Copy className="h-3.5 w-3.5" />} label="نسخ" muted />
          <SheetRow icon={<Star className="h-3.5 w-3.5" />} label="إضافة إلى المفضلة" muted />
          <div className="relative">
            <motion.span
              className="absolute inset-0 rounded-xl ring-2 ring-primary"
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <SheetRow
              icon={<SquarePlus className="h-3.5 w-3.5" />}
              label="إضافة إلى الشاشة الرئيسية"
              highlight
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SheetRow({
  icon,
  label,
  highlight,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between rounded-xl px-2.5 py-2",
        highlight ? "bg-primary/10" : "bg-foreground/[0.03]",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-medium",
          highlight ? "text-primary" : muted ? "text-foreground/55" : "text-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md",
          highlight ? "bg-primary/15 text-primary" : "text-foreground/40",
        )}
      >
        {icon}
      </span>
    </div>
  );
}

function ArtAddScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-2.5">
        <span className="text-[10px] text-foreground/40">إلغاء</span>
        <span className="text-[10px] font-semibold">إضافة إلى الشاشة الرئيسية</span>
        <span className="relative inline-flex">
          <motion.span
            className="absolute inset-0 -m-1 rounded-lg ring-2 ring-primary"
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="relative rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            إضافة
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2.5 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Smartphone className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold">GAB School</div>
          <div className="mt-1 h-1.5 w-24 rounded-full bg-foreground/10" />
        </div>
      </div>
      <div className="mt-1 flex justify-center">
        <motion.div
          className="text-primary"
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Plus className="h-5 w-5" strokeWidth={2.6} />
        </motion.div>
      </div>
    </div>
  );
}

const STEP_ART = [ArtShareButton, ArtShareSheet, ArtAddScreen];

/* -------------------------------- component ------------------------------- */

export function IosInstallGuide({ open, onOpenChange }: IosInstallGuideProps) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [copied, setCopied] = useState(false);
  const [showSafariHelp, setShowSafariHelp] = useState(false);

  const inApp = getInAppBrowser();
  const appUrl = typeof window !== "undefined" ? window.location.href : "";

  // Always restart from the first step each time the guide is opened.
  useEffect(() => {
    if (open) {
      setStep(0);
      setDir(1);
      setCopied(false);
      setShowSafariHelp(false);
    }
  }, [open]);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setDir(1);
      setStep((s) => s + 1);
    } else {
      onOpenChange(false);
    }
  };
  const goBack = () => {
    if (step > 0) {
      setDir(-1);
      setStep((s) => s - 1);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const isLast = step === STEPS.length - 1;
  const Art = STEP_ART[step];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir="rtl"
          aria-describedby="ios-guide-desc"
          // Only an explicit close (the X button, or finishing the steps) may
          // dismiss the guide — never an outside tap or the Esc key.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[60] flex flex-col bg-background outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4"
        >
          {/* header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="h-4 w-4" />
              </span>
              <DialogPrimitive.Title className="text-sm font-bold">
                تثبيت التطبيق على iPhone
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5" />
              <span className="sr-only">إغلاق</span>
            </DialogPrimitive.Close>
          </div>

          {inApp ? (
            /* ---------- in-app browser: must reopen in Safari ---------- */
            <div className="flex flex-1 flex-col px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 240, damping: 20 }}
                  className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary"
                >
                  <Compass className="h-10 w-10" />
                </motion.div>
                <h2 className="text-lg font-extrabold">افتح الرابط في Safari أولاً</h2>
                <p id="ios-guide-desc" className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  أنت تتصفّح حالياً داخل تطبيق{" "}
                  <span className="font-semibold text-foreground">
                    {inApp ? IN_APP_LABEL[inApp] : ""}
                  </span>
                  ، ولا يمكن تثبيت التطبيق من هنا. انسخ الرابط ثم افتحه في متصفح Safari لإكمال
                  التثبيت.
                </p>

                <AnimatePresence>
                  {showSafariHelp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 w-full max-w-xs rounded-2xl border border-border bg-muted/40 p-4 text-start text-xs leading-relaxed text-muted-foreground">
                        <p className="mb-1 font-semibold text-foreground">كيفية الفتح في Safari:</p>
                        ١. اضغط على زر القائمة <span className="font-bold">(•••)</span> في أعلى أو
                        أسفل الشاشة.
                        <br />
                        ٢. اختر <span className="font-bold">«فتح في المتصفح»</span> أو{" "}
                        <span className="font-bold">«Open in Safari»</span>.
                        <br />
                        ٣. أعد فتح هذه الصفحة ثم اضغط «تثبيت التطبيق».
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-2.5">
                <Button onClick={copyLink} size="lg" className="h-12 w-full gap-2 rounded-2xl text-base font-bold">
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  {copied ? "تم نسخ الرابط ✓" : "نسخ الرابط"}
                </Button>
                <Button
                  onClick={() => setShowSafariHelp((v) => !v)}
                  variant="outline"
                  size="lg"
                  className="h-12 w-full gap-2 rounded-2xl text-base font-semibold"
                >
                  <Compass className="h-5 w-5" />
                  كيفية فتحه في Safari
                </Button>
              </div>
            </div>
          ) : (
            /* ---------------- normal Safari walkthrough ---------------- */
            <div className="flex flex-1 flex-col px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {/* progress */}
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  الخطوة {step + 1} من {STEPS.length}
                </span>
                <span className="text-xs font-bold text-primary">
                  {step + 1}/{STEPS.length}
                </span>
              </div>
              <div className="mb-5 flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={false}
                      animate={{ width: i <= step ? "100%" : "0%" }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                    />
                  </div>
                ))}
              </div>

              {/* animated step body */}
              <div className="relative flex-1">
                <AnimatePresence mode="wait" custom={dir}>
                  <motion.div
                    key={step}
                    custom={dir}
                    initial={{ opacity: 0, x: dir * 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: dir * -40 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="flex h-full flex-col items-center"
                  >
                    <div className="flex w-full flex-1 items-center justify-center py-2">
                      <Art />
                    </div>
                    <h2 className="text-center text-lg font-extrabold">{STEPS[step].title}</h2>
                    <p
                      id="ios-guide-desc"
                      className="mt-2 max-w-xs text-center text-sm leading-relaxed text-muted-foreground"
                    >
                      {STEPS[step].desc}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* footer controls */}
              <div className="mt-4 space-y-2.5">
                <Button
                  onClick={goNext}
                  size="lg"
                  className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
                >
                  {isLast ? (
                    <>
                      <Check className="h-5 w-5" />
                      تمّ، فهمت الخطوات
                    </>
                  ) : (
                    "التالي"
                  )}
                </Button>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="w-full py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    رجوع
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
