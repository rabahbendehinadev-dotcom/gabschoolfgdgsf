import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X, Compass, Copy, Check, Smartphone, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui";
import { getInAppBrowser, type InAppBrowser } from "@/lib/pwa";
import step1Img from "@assets/ios-install/step1.png";
import step2Img from "@assets/ios-install/step2.png";
import step3Img from "@assets/ios-install/step3.png";
import step4Img from "@assets/ios-install/step4.png";
import step5Img from "@assets/ios-install/step5.png";

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

type Step = {
  img: string;
  title: string;
  desc: string;
  wide?: boolean;
};

const STEPS: Step[] = [
  {
    img: step1Img,
    title: "اضغط على زر المشاركة",
    desc: "في شريط الأدوات أسفل متصفح Safari، اضغط على زر المشاركة (Share).",
  },
  {
    img: step2Img,
    title: "اختر «En voir plus»",
    desc: "من قائمة الخيارات، اضغط على «En voir plus» لعرض المزيد.",
  },
  {
    img: step3Img,
    title: "اضغط على «Sur l'écran d'accueil»",
    desc: "ابحث عن خيار «Sur l'écran d'accueil» ثم اضغط عليه.",
  },
  {
    img: step4Img,
    title: "أضف التطبيق إلى الشاشة الرئيسية",
    desc: "يمكنك تغيير الاسم إذا أردت، ثم اضغط على «Ajouter».",
    wide: true,
  },
  {
    img: step5Img,
    title: "تم التثبيت بنجاح!",
    desc: "تمت إضافة أيقونة GAB School إلى الشاشة الرئيسية.",
    wide: true,
  },
];

/* -------------------------------- step card ------------------------------- */

function StepCard({ step, index }: { step: Step; index: number }) {
  const isDone = index === STEPS.length - 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: "easeOut" }}
      className={
        "group relative rounded-3xl border border-border bg-card p-5 pt-7 shadow-sm transition-shadow hover:shadow-md " +
        (step.wide ? "lg:col-span-3" : "lg:col-span-2")
      }
    >
      {/* number badge straddling the top edge */}
      <span
        className={
          "absolute -top-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full text-sm font-extrabold text-white shadow-lg ring-4 ring-card " +
          (isDone ? "bg-green-500 shadow-green-500/30" : "bg-primary shadow-primary/30")
        }
      >
        {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
      </span>

      <h3 className="text-start text-base font-extrabold leading-snug">{step.title}</h3>
      <p className="mt-1.5 text-start text-[13px] leading-relaxed text-muted-foreground">
        {step.desc}
      </p>

      {/* screenshot stage */}
      <div className="mt-4 flex justify-center">
        <div className="w-full max-w-[220px] overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/10 ring-1 ring-black/5">
          <img
            src={step.img}
            alt={step.title}
            loading="lazy"
            className="block w-full select-none"
            draggable={false}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------- component ------------------------------- */

export function IosInstallGuide({ open, onOpenChange }: IosInstallGuideProps) {
  const [copied, setCopied] = useState(false);
  const [showSafariHelp, setShowSafariHelp] = useState(false);

  const inApp = getInAppBrowser();
  const appUrl = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    if (open) {
      setCopied(false);
      setShowSafariHelp(false);
    }
  }, [open]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir="rtl"
          className="fixed inset-0 z-[60] flex flex-col bg-background outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4"
        >
          {/* sticky top bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Close className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5" />
              <span className="sr-only">إغلاق</span>
            </DialogPrimitive.Close>
            <span className="text-sm font-bold text-muted-foreground">دليل التثبيت</span>
            <span className="h-9 w-9" aria-hidden="true" />
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
                <DialogPrimitive.Title className="text-lg font-extrabold">
                  افتح الرابط في Safari أولاً
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  أنت تتصفّح حالياً داخل تطبيق{" "}
                  <span className="font-semibold text-foreground">
                    {inApp ? IN_APP_LABEL[inApp] : ""}
                  </span>
                  ، ولا يمكن تثبيت التطبيق من هنا. انسخ الرابط ثم افتحه في متصفح Safari لإكمال
                  التثبيت.
                </DialogPrimitive.Description>

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

              <div className="mx-auto w-full max-w-sm space-y-2.5">
                <Button
                  onClick={copyLink}
                  size="lg"
                  className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
                >
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
            /* ---------------- single-page Safari walkthrough ---------------- */
            <div className="flex-1 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto max-w-5xl px-4 py-7 sm:py-9">
                {/* header */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="mb-9 text-center"
                >
                  <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                    <Smartphone className="h-7 w-7" />
                  </span>
                  <DialogPrimitive.Title className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    تثبيت التطبيق على <span className="text-primary">iPhone</span>
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                    أضف <span className="font-semibold text-foreground">GAB School</span> إلى الشاشة
                    الرئيسية لتجربة أفضل
                  </DialogPrimitive.Description>
                </motion.div>

                {/* steps grid: 1 col on mobile, 2 on md, 3+2 on lg (6-col base) */}
                <div className="grid grid-cols-1 gap-x-5 gap-y-9 md:grid-cols-2 lg:grid-cols-6">
                  {STEPS.map((step, i) => (
                    <StepCard key={i} step={step} index={i} />
                  ))}
                </div>

                {/* tip bar */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
                  className="mt-8 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5 text-start"
                >
                  <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-[13px] leading-relaxed text-foreground/80 sm:text-sm">
                    <span className="font-bold text-foreground">نصيحة:</span> بعد التثبيت، ستجد
                    التطبيق على الشاشة الرئيسية ويمكنك فتحه كتطبيق كامل بدون متصفح.
                  </p>
                </motion.div>

                {/* done */}
                <div className="mx-auto mt-7 max-w-sm">
                  <Button
                    onClick={() => onOpenChange(false)}
                    size="lg"
                    className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
                  >
                    <Check className="h-5 w-5" />
                    تمّ، فهمت الخطوات
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
