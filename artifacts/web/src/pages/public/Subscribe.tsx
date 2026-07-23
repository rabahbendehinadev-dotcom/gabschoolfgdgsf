import { useState, useRef } from "react";
import { Link } from "wouter";
import { useGetSubscriptionPlans } from "@workspace/api-client-react/src/generated/api";
import { SubscriptionPlan } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import {
  Crown, Check, ArrowRight, Zap, Infinity, Clock, MessageCircle,
  Copy, CheckCheck, Upload, Loader2, X, ImageIcon, Send, BookOpen,
  ShieldCheck, Star, Play, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const WHATSAPP_NUMBER = "213772339494";

const PAYMENT_METHODS = [
  { id: "ccp",      name: "CCP",       label: "بريد الجزائر (CCP)",    value: "27458906/02",              extra: "bendehina rabah", color: "border-yellow-500/40 bg-yellow-500/5",  icon: "🏦", accent: "text-yellow-400" },
  { id: "baridimob",name: "Baridi Mob",label: "بريدي موب",              value: "00799999002745890659",      extra: "",                color: "border-green-500/40 bg-green-500/5",    icon: "📱", accent: "text-green-400" },
  { id: "paysera",  name: "Paysera",   label: "Paysera (تحويل دولي)",   value: "LT163500010016530194",      extra: "Anis Ouradj — EVIULT2VXXX", color: "border-blue-500/40 bg-blue-500/5",  icon: "🌍", accent: "text-blue-400" },
  { id: "redotpay", name: "Redot Pay", label: "Redot Pay (Crypto)",     value: "1354987108",               extra: "",                color: "border-purple-500/40 bg-purple-500/5", icon: "₿",  accent: "text-purple-400" },
];

type PlanWithCourses = SubscriptionPlan & {
  courses?: { id: number; title: string; thumbnail: string | null; lessonCount: number; description: string }[];
};

function durationLabel(days: number | null | undefined): string {
  if (!days) return "مدى الحياة";
  if (days >= 360) return `${Math.round(days / 30)} شهراً`;
  if (days >= 28) return `${Math.round(days / 30)} أشهر`;
  return `${days} يوم`;
}

function planIcon(type: string) {
  if (type === "demo") return <Clock className="w-5 h-5" />;
  if (type === "lifetime") return <Infinity className="w-5 h-5" />;
  return <Zap className="w-5 h-5" />;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="shrink-0 p-2 rounded-lg bg-muted hover:bg-primary/10 hover:text-primary border border-border transition-all"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Payment Modal ─────────────────────────────────────────────────── */
interface PaymentModalProps { plan: PlanWithCourses; onClose: () => void; }

function PaymentModal({ plan, onClose }: PaymentModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"methods" | "proof">("methods");
  const [customerName, setCustomerName] = useState(user?.username || "");
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0].id);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);

  const mainCourse = plan.courses?.[0];
  const dur = durationLabel(plan.durationDays);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProofPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadProof = async (): Promise<string | null> => {
    if (!proofFile) return null;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", proofFile);
      const res = await fetch("/api/storage/uploads/data", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as any; throw new Error(d.error ?? `HTTP ${res.status}`); }
      const { objectPath } = await res.json() as { objectPath: string };
      return objectPath;
    } catch (err) {
      toast({ variant: "destructive", title: "فشل رفع الصورة", description: err instanceof Error ? err.message : String(err) });
      return null;
    } finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) { toast({ variant: "destructive", title: "أدخل اسمك أولاً" }); return; }
    setSubmitting(true);
    try {
      let objectPath: string | null = null;
      if (proofFile) { objectPath = await uploadProof(); if (!objectPath) { setSubmitting(false); return; } }
      const methodLabel = PAYMENT_METHODS.find(m => m.id === selectedMethod)?.label || selectedMethod;
      const res = await fetch("/api/payments/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: customerName.trim(), planType: plan.type, planPrice: plan.price, paymentMethod: methodLabel, proofObjectPath: objectPath, userId: user?.id ?? null }),
      });
      if (!res.ok) throw new Error("فشل الإرسال");
      const data = await res.json(); const sid: number = data.id;
      setSubmissionId(sid);
      const proofLine = objectPath ? `\nرابط الإيصال: ${window.location.origin}/api/payments/proof/${sid}` : "";
      const courseNames = plan.courses?.map(c => c.title).join("، ") || plan.type;
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `مرحباً 👋\nأريد الاشتراك في منصة GAB School\n\nالدورة: ${courseNames}\nالخطة: ${dur}\nالسعر: ${plan.price} DA\nالاسم: ${customerName.trim()}\nطريقة الدفع: ${methodLabel}\nرقم الطلب: #${sid}${proofLine}\n\nأرجو التأكيد 🙏`
      )}`, "_blank");
      toast({ title: "تم إرسال الطلب ✅", description: "انتظر تأكيد الأدمن عبر الواتساب" });
    } catch (err) { toast({ variant: "destructive", title: "حدث خطأ", description: String(err) }); }
    finally { setSubmitting(false); }
  };

  if (submissionId) return (
    <div className="text-center py-8 space-y-5">
      <div className="w-20 h-20 mx-auto rounded-full bg-green-500/15 flex items-center justify-center ring-4 ring-green-500/20">
        <CheckCheck className="w-10 h-10 text-green-400" />
      </div>
      <div>
        <p className="text-xl font-bold mb-1">تم إرسال الطلب! ✅</p>
        <p className="text-muted-foreground text-sm">رقم طلبك: <span className="font-bold text-primary">#{submissionId}</span></p>
      </div>
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 text-right space-y-1">
        <p className="font-semibold">📋 الخطوات التالية:</p>
        <p>• سيُفتح واتساب مع رسالة تلقائية للأدمن</p>
        <p>• انتظر التأكيد وتفعيل حسابك (عادةً خلال ساعات)</p>
      </div>
      <Button className="w-full" onClick={onClose}>إغلاق</Button>
    </div>
  );

  return (
    <div className="space-y-4 py-1" dir="rtl">
      {/* Plan summary */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-primary/10 to-orange-600/5 border border-primary/20">
        {mainCourse?.thumbnail ? (
          <img src={mainCourse.thumbnail} alt={mainCourse.title} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 text-primary">
            {planIcon(plan.type)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight truncate">
            {plan.courses && plan.courses.length > 1 ? `${plan.courses.length} دورات` : (mainCourse?.title || plan.type)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{dur}</p>
          <p className="text-2xl font-black text-primary mt-1">{plan.price} <span className="text-sm font-medium text-muted-foreground">DA</span></p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {(["methods", "proof"] as const).map((s, i) => (
          <button key={s} onClick={() => setStep(s)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${step === s ? "bg-primary text-white shadow-lg shadow-primary/25" : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? "bg-white/20" : "bg-border"}`}>{i + 1}</span>
            {s === "methods" ? "طرق الدفع" : "إرسال الإيصال"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === "methods" ? (
          <motion.div key="methods" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-2.5">
            <p className="text-xs text-muted-foreground">اختر طريقة الدفع وانسخ رقم الحساب لإتمام التحويل:</p>
            {PAYMENT_METHODS.map(m => (
              <div key={m.id} onClick={() => setSelectedMethod(m.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${m.color} ${selectedMethod === m.id ? "ring-2 ring-primary border-primary/40" : "hover:border-border/80"}`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{m.icon}</span>
                    <span className="font-semibold text-sm">{m.label}</span>
                  </div>
                  {selectedMethod === m.id && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background/60 px-2.5 py-2 rounded-lg font-mono break-all border border-border/60" dir="ltr">{m.value}</code>
                  <CopyButton value={m.value} />
                </div>
                {m.extra && <p className="text-xs text-muted-foreground mt-1.5 pr-1">{m.extra}</p>}
              </div>
            ))}
            <Button className="w-full h-11 mt-1 font-bold gap-2" onClick={() => setStep("proof")}>
              التالي — رفع إيصال الدفع
              <ChevronRight className="w-4 h-4" />
            </Button>
          </motion.div>
        ) : (
          <motion.div key="proof" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold">اسمك الكامل *</Label>
              <Input placeholder="مثال: أحمد بن علي" value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" /> صورة إيصال الدفع
                <span className="text-xs font-normal text-muted-foreground">(مُفضَّل)</span>
              </Label>
              {proofPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30 aspect-video">
                  <img src={proofPreview} alt="إيصال" className="w-full h-full object-contain" />
                  <button onClick={() => { setProofFile(null); setProofPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-red-500/80 transition-colors">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all">
                  <Upload className="w-8 h-8" />
                  <div className="text-center">
                    <p className="text-sm font-medium">انقر لرفع صورة الإيصال</p>
                    <p className="text-xs opacity-60 mt-0.5">PNG, JPG, WEBP</p>
                  </div>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <p className="font-semibold">📋 بعد النقر على «إرسال»:</p>
              <p>• سيُفتح واتساب مع رسالة تلقائية</p>
              <p>• انتظر تأكيد الأدمن وتفعيل حسابك</p>
            </div>
            <Button
              className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 font-bold text-base gap-2 shadow-lg shadow-green-500/20"
              onClick={handleSubmit} disabled={submitting || uploading || !customerName.trim()}>
              {submitting || uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><MessageCircle className="w-5 h-5" /> إرسال عبر واتساب <Send className="w-4 h-4" /></>}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Plan Card ─────────────────────────────────────────────────────── */
function PlanCard({ plan, index, onSubscribe, onWhatsApp }: {
  plan: PlanWithCourses; index: number;
  onSubscribe: (p: PlanWithCourses) => void;
  onWhatsApp: () => void;
}) {
  const courses = plan.courses ?? [];
  const mainCourse = courses[0];
  const isHighlighted = plan.type === "annual" || (plan.type !== "demo" && index === 0 && courses.length > 0);
  const isDemo = plan.type === "demo";
  const dur = durationLabel(plan.durationDays);
  const totalLessons = courses.reduce((s, c) => s + c.lessonCount, 0);

  const badge = isHighlighted ? "الأكثر طلباً" : courses.length === 1 ? "دورة كاملة" : courses.length > 1 ? `${courses.length} دورات` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 120 }}
      className={`relative flex flex-col rounded-3xl border overflow-hidden shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
        isHighlighted
          ? "border-primary/60 shadow-primary/10 bg-gradient-to-b from-primary/5 via-background to-background"
          : isDemo
          ? "border-border bg-card"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      {/* Badge */}
      {badge && (
        <div className="absolute top-4 left-4 z-10">
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${
            isHighlighted ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-muted text-foreground/70 border border-border"
          }`}>
            {isHighlighted && <Star className="w-3 h-3 fill-current" />}
            {badge}
          </span>
        </div>
      )}

      {/* Thumbnail */}
      {mainCourse?.thumbnail ? (
        <div className="relative w-full aspect-video overflow-hidden">
          <img src={mainCourse.thumbnail} alt={mainCourse.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-3 right-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
          {courses.length > 1 && (
            <div className="absolute bottom-3 left-3 flex -space-x-2 rtl:space-x-reverse">
              {courses.slice(1, 4).map(c => c.thumbnail && (
                <img key={c.id} src={c.thumbnail} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-background" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`w-full aspect-video flex items-center justify-center ${isHighlighted ? "bg-gradient-to-br from-primary/20 to-orange-600/10" : "bg-gradient-to-br from-muted/60 to-muted/30"}`}>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isHighlighted ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
            {planIcon(plan.type)}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col flex-1 p-5 gap-4">
        {/* Course name & plan type */}
        <div>
          <h3 className="font-black text-lg leading-tight mb-1">
            {courses.length > 1
              ? `${courses.length} دورات شاملة`
              : mainCourse?.title || (plan.type === "demo" ? "وصول تجريبي" : plan.type)}
          </h3>
          {courses.length > 1 && (
            <p className="text-xs text-muted-foreground">{courses.map(c => c.title).join(" · ")}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${isHighlighted ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              {planIcon(plan.type)}
              {dur}
            </span>
            {totalLessons > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg">
                <BookOpen className="w-3.5 h-3.5" />
                {totalLessons} درس
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {(mainCourse?.description || plan.description) && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {mainCourse?.description || plan.description}
          </p>
        )}

        {/* Perks */}
        <ul className="space-y-2 flex-1">
          {courses.length > 0 ? (
            <>
              {courses.slice(0, 3).map(c => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isHighlighted ? "bg-primary/15 text-primary" : "bg-green-500/15 text-green-400"}`}>
                    <Check className="w-3 h-3" />
                  </div>
                  <span className="font-medium">{c.title}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isHighlighted ? "bg-primary/15 text-primary" : "bg-green-500/15 text-green-400"}`}>
                  <Check className="w-3 h-3" />
                </div>
                <span>دعم فني مباشر</span>
              </li>
              {plan.type !== "demo" && (
                <li className="flex items-center gap-2 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isHighlighted ? "bg-primary/15 text-primary" : "bg-green-500/15 text-green-400"}`}>
                    <ShieldCheck className="w-3 h-3" />
                  </div>
                  <span>تحديثات مستمرة</span>
                </li>
              )}
            </>
          ) : (
            <>
              {(isDemo
                ? ["وصول محدود للدروس", "مشاهدة عينات مجانية", "دعم Community GAB"]
                : ["جميع الدروس المتاحة", "تحديثات مستمرة", "دعم فني أولوي"]
              ).map(p => (
                <li key={p} className="flex items-center gap-2 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isHighlighted ? "bg-primary/15 text-primary" : "bg-green-500/15 text-green-400"}`}>
                    <Check className="w-3 h-3" />
                  </div>
                  {p}
                </li>
              ))}
            </>
          )}
        </ul>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Price */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-black text-primary">
              {plan.price}
              <span className="text-base font-semibold text-muted-foreground ml-1">DA</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{!plan.durationDays ? "دفعة واحدة للأبد" : `لمدة ${dur}`}</p>
          </div>
          {/* Payment methods mini */}
          {!isDemo && (
            <div className="flex gap-1">
              {PAYMENT_METHODS.slice(0, 3).map(m => (
                <span key={m.id} className="text-base" title={m.name}>{m.icon}</span>
              ))}
              <span className="text-xs text-muted-foreground self-center">+1</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            onClick={() => onSubscribe(plan)}
            className={`w-full h-12 font-bold text-base rounded-xl transition-all ${
              isHighlighted
                ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
                : isDemo
                ? "bg-muted hover:bg-muted/70 border border-border text-foreground"
                : "bg-foreground text-background hover:bg-foreground/90"
            }`}
            variant={isHighlighted ? "default" : "ghost"}
          >
            {isDemo ? "ابدأ مجاناً" : "اشترك الآن"}
            {!isDemo && <ChevronRight className="w-4 h-4 mr-1" />}
          </Button>
          {!isDemo && (
            <button onClick={onWhatsApp}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm text-green-400 hover:text-green-300 hover:bg-green-500/10 transition-all font-medium">
              <MessageCircle className="w-4 h-4" />
              استفسر عبر واتساب
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */
export function Subscribe() {
  const { data: rawPlans, isLoading } = useGetSubscriptionPlans();
  const plans = rawPlans as PlanWithCourses[] | undefined;
  const [selectedPlan, setSelectedPlan] = useState<PlanWithCourses | null>(null);

  const openWhatsApp = () => window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("مرحباً 👋\nأريد الاستفسار عن الاشتراك في منصة GAB School")}`,
    "_blank"
  );

  const handleSubscribe = (plan: PlanWithCourses) => {
    if (plan.type === "demo") { window.location.href = "/register"; return; }
    setSelectedPlan(plan);
  };

  const visiblePlans = plans?.filter(p => !p.isHidden) ?? [];

  return (
    <div className="min-h-screen py-12 px-4" dir="rtl">
      <div className="container mx-auto max-w-6xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <span className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-5">
            <Crown className="w-4 h-4" /> اشتراكات المنصة
          </span>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
            ابدأ رحلتك في{" "}
            <span className="text-primary">إصلاح الهواتف</span>
          </h1>
          <p className="text-lg text-foreground/60 max-w-xl mx-auto mb-6">
            اختر الباقة المناسبة وتمتع بوصول كامل للدورات الاحترافية
          </p>
          <button onClick={openWhatsApp}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all font-medium text-sm">
            <MessageCircle className="w-4 h-4" />
            تواصل معنا مباشرة عبر واتساب
          </button>
        </motion.div>

        {/* Plans grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-3xl border border-border bg-card overflow-hidden animate-pulse">
                <div className="aspect-video bg-muted/60" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-10 bg-muted rounded mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : visiblePlans.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">لا توجد باقات متاحة حالياً</div>
        ) : (
          <div className={`grid gap-6 items-start ${
            visiblePlans.length === 1 ? "grid-cols-1 max-w-md mx-auto"
            : visiblePlans.length === 2 ? "grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          }`}>
            {visiblePlans.map((plan, i) => (
              <PlanCard key={plan.id} plan={plan} index={i} onSubscribe={handleSubscribe} onWhatsApp={openWhatsApp} />
            ))}
          </div>
        )}

        {/* Trust badges */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          {[
            { icon: <ShieldCheck className="w-4 h-4 text-green-400" />, label: "دفع آمن ومضمون" },
            { icon: <MessageCircle className="w-4 h-4 text-green-400" />, label: "دعم عبر واتساب" },
            { icon: <BookOpen className="w-4 h-4 text-primary" />, label: "محتوى احترافي حصري" },
            { icon: <Crown className="w-4 h-4 text-amber-400" />, label: "تفعيل فوري بعد التأكيد" },
          ].map(b => (
            <div key={b.label} className="flex items-center gap-2">{b.icon}<span>{b.label}</span></div>
          ))}
        </motion.div>

        {/* Back */}
        <div className="text-center mt-10">
          <Link href="/videos">
            <Button variant="ghost" className="text-muted-foreground hover:text-primary">
              <ArrowRight className="w-4 h-4 ml-2" />
              العودة لمكتبة الدروس
            </Button>
          </Link>
        </div>
      </div>

      {/* Floating WhatsApp */}
      <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: "spring" }}
        onClick={openWhatsApp}
        className="fixed bottom-6 left-6 w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 shadow-2xl shadow-green-500/40 flex items-center justify-center z-50 transition-colors"
        title="تواصل عبر واتساب">
        <MessageCircle className="w-7 h-7 text-white" />
      </motion.button>

      {/* Payment Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={o => { if (!o) setSelectedPlan(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Crown className="w-5 h-5 text-primary" />
              إتمام الاشتراك
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && <PaymentModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
