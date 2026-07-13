import { useState, useRef } from "react";
import { Link } from "wouter";
import { useGetSubscriptionPlans } from "@workspace/api-client-react/src/generated/api";
import { SubscriptionPlan } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { Crown, Check, ArrowRight, Zap, Infinity, Clock, MessageCircle, Copy, CheckCheck, Upload, Loader2, X, ImageIcon, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const WHATSAPP_NUMBER = "213772339494";

const PAYMENT_METHODS = [
  {
    id: "ccp",
    name: "CCP",
    label: "بريد الجزائر (CCP)",
    value: "27458906/02",
    extra: "bendehina rabah",
    color: "from-yellow-500/20 to-amber-500/20 border-yellow-500/30",
    icon: "🏦",
  },
  {
    id: "baridimob",
    name: "Baridi Mob",
    label: "بريدي موب",
    value: "00799999002745890659",
    extra: "",
    color: "from-green-500/20 to-emerald-500/20 border-green-500/30",
    icon: "📱",
  },
  {
    id: "paysera",
    name: "Paysera",
    label: "Paysera (تحويل دولي)",
    value: "LT163500010016530194",
    extra: "Anis Ouradj — EVIULT2VXXX",
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
    icon: "🌍",
  },
  {
    id: "redotpay",
    name: "Redot Pay",
    label: "Redot Pay (Crypto)",
    value: "1354987108",
    extra: "",
    color: "from-purple-500/20 to-violet-500/20 border-purple-500/30",
    icon: "₿",
  },
];

const planIcons: Record<string, React.ReactNode> = {
  demo:     <Clock className="w-7 h-7" />,
  annual:   <Zap className="w-7 h-7" />,
  lifetime: <Infinity className="w-7 h-7" />,
};

const planLabels: Record<string, string> = {
  demo:     "تجريبي",
  annual:   "سنوي",
  lifetime: "مدى الحياة",
};

const planColors: Record<string, string> = {
  demo:     "from-slate-500/20 to-slate-600/20 border-slate-500/30",
  annual:   "from-primary/20 to-orange-600/20 border-primary/40",
  lifetime: "from-amber-500/20 to-yellow-600/20 border-amber-400/40",
};

const planHighlight: Record<string, boolean> = {
  demo: false, annual: true, lifetime: false,
};

const planPerks: Record<string, string[]> = {
  demo:     ["وصول محدود للدروس", "مشاهدة عينات مجانية", "دعم Community GAB"],
  annual:   ["جميع دروس الفلاش", "جميع دروس الديكوداج", "تحديثات مستمرة طوال السنة", "دعم فني أولوي"],
  lifetime: ["جميع المزايا السنوية", "وصول مدى الحياة", "الدروس القادمة مجاناً", "دعم شخصي مباشر", "شارة VIP حصرية"],
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="shrink-0 p-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors border border-border">
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  );
}

interface PaymentModalProps {
  plan: SubscriptionPlan;
  onClose: () => void;
}

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProofPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadProof = async (): Promise<string | null> => {
    if (!proofFile) return null;
    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: proofFile.name, size: proofFile.size, contentType: proofFile.type }),
      });
      if (!urlRes.ok) throw new Error("فشل طلب رابط الرفع");
      const { uploadURL, objectPath } = await urlRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": proofFile.type },
        body: proofFile,
      });
      if (!putRes.ok) throw new Error("فشل رفع الصورة");
      return objectPath;
    } catch (err) {
      toast({ variant: "destructive", title: "فشل رفع الصورة", description: String(err) });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitAndWhatsApp = async () => {
    if (!customerName.trim()) {
      toast({ variant: "destructive", title: "أدخل اسمك أولاً" });
      return;
    }
    setSubmitting(true);
    try {
      let objectPath: string | null = null;
      if (proofFile) {
        objectPath = await uploadProof();
        if (!objectPath) { setSubmitting(false); return; }
      }

      const methodLabel = PAYMENT_METHODS.find(m => m.id === selectedMethod)?.label || selectedMethod;
      const res = await fetch("/api/payments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          planType: plan.type,
          planPrice: plan.price,
          paymentMethod: methodLabel,
          proofObjectPath: objectPath,
          userId: user?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error("فشل الإرسال");
      const data = await res.json();
      const sid: number = data.id;
      setSubmissionId(sid);

      const proofLine = objectPath ? `\nرابط الإيصال: ${window.location.origin}/api/payments/proof/${sid}` : "";
      const template = encodeURIComponent(
        `مرحباً 👋\nأريد الاشتراك في منصة فلاش والديكوداج\n\nالخطة: ${planLabels[plan.type] || plan.type}\nالسعر: ${plan.price}\nالاسم: ${customerName.trim()}\nطريقة الدفع: ${methodLabel}\nرقم الطلب: #${sid}${proofLine}\n\nأرجو التأكيد 🙏`
      );
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${template}`, "_blank");
      toast({ title: "تم إرسال الطلب ✅", description: "انتظر تأكيد الأدمن عبر الواتساب" });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const planName = planLabels[plan.type] || plan.type;

  return (
    <div className="space-y-5 py-2">
      {/* Plan badge */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
        <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
          {planIcons[plan.type] ?? <Crown className="w-6 h-6" />}
        </div>
        <div>
          <p className="font-bold">{planName}</p>
          <p className="text-2xl font-black text-primary">{plan.price}</p>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setStep("methods")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${step === "methods" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70 border border-border"}`}
        >
          ١. طرق الدفع
        </button>
        <button
          onClick={() => setStep("proof")}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${step === "proof" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70 border border-border"}`}
        >
          ٢. إرسال الإيصال
        </button>
      </div>

      <AnimatePresence mode="wait">
        {step === "methods" ? (
          <motion.div key="methods" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
            <p className="text-sm text-muted-foreground">اختر طريقة الدفع وانقل رقم الحساب لإتمام التحويل:</p>
            {PAYMENT_METHODS.map(method => (
              <div
                key={method.id}
                onClick={() => setSelectedMethod(method.id)}
                className={`p-3.5 rounded-xl border bg-gradient-to-r cursor-pointer transition-all ${method.color} ${selectedMethod === method.id ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{method.icon}</span>
                    <span className="font-bold text-sm">{method.label}</span>
                  </div>
                  {selectedMethod === method.id && (
                    <Badge className="bg-primary/20 text-primary border-0 text-xs">محدد</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted/60 px-2 py-1.5 rounded-lg font-mono break-all border border-border" dir="ltr">{method.value}</code>
                  <CopyButton value={method.value} />
                </div>
                {method.extra && (
                  <p className="text-xs text-muted-foreground mt-1.5 mr-1">{method.extra}</p>
                )}
              </div>
            ))}
            <Button className="w-full mt-2" onClick={() => setStep("proof")}>
              التالي — رفع إيصال الدفع ←
            </Button>
          </motion.div>
        ) : (
          <motion.div key="proof" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
            {submissionId ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 mx-auto bg-green-500/20 text-green-400 rounded-full flex items-center justify-center">
                  <CheckCheck className="w-8 h-8" />
                </div>
                <p className="font-bold text-lg">تم إرسال الطلب! ✅</p>
                <p className="text-sm text-muted-foreground">رقم طلبك: <span className="font-bold text-primary">#{submissionId}</span></p>
                <p className="text-sm text-muted-foreground">انتظر تأكيد الأدمن عبر الواتساب</p>
                <Button variant="outline" className="w-full" onClick={onClose}>إغلاق</Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>اسمك الكامل *</Label>
                  <Input
                    placeholder="أدخل اسمك الكامل"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    صورة إيصال الدفع
                    <span className="text-xs text-muted-foreground">(اختياري لكن يُفضَّل)</span>
                  </Label>

                  {proofPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-border aspect-video bg-muted/30">
                      <img src={proofPreview} alt="إيصال الدفع" className="w-full h-full object-contain" />
                      <button
                        onClick={() => { setProofFile(null); setProofPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-red-500/80 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      <Upload className="w-8 h-8" />
                      <span className="text-sm">انقر لرفع صورة الإيصال</span>
                      <span className="text-xs opacity-60">PNG, JPG, WEBP</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                  <p className="font-semibold">📋 بعد الإرسال:</p>
                  <p>• سيُفتح واتساب مع رسالة تلقائية للأدمن</p>
                  <p>• انتظر التأكيد وتفعيل حسابك</p>
                </div>

                <Button
                  className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 font-bold text-base gap-2"
                  onClick={handleSubmitAndWhatsApp}
                  disabled={submitting || uploading || !customerName.trim()}
                >
                  {submitting || uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <MessageCircle className="w-5 h-5" />
                      إرسال عبر واتساب
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Subscribe() {
  const { data: plans, isLoading } = useGetSubscriptionPlans();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (plan.type === "demo") {
      window.location.href = "/register";
      return;
    }
    setSelectedPlan(plan);
  };

  const openWhatsApp = () => {
    const template = encodeURIComponent("مرحباً 👋\nأريد الاستفسار عن الاشتراك في منصة فلاش والديكوداج");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${template}`, "_blank");
  };

  return (
    <div className="min-h-screen py-16 px-4" dir="rtl">
      <div className="container mx-auto max-w-5xl">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Crown className="w-4 h-4" />
            اشتراكات المنصة
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            ابدأ رحلتك في
            <span className="text-primary"> إصلاح الهواتف</span>
          </h1>
          <p className="text-lg text-foreground/60 max-w-xl mx-auto mb-6">
            اختر الخطة المناسبة لك وتمتع بوصول كامل لجميع دروس الفلاش والديكوداج الاحترافية
          </p>

          {/* WhatsApp CTA */}
          <button
            onClick={openWhatsApp}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 hover:border-green-500/50 transition-all font-medium text-sm"
          >
            <MessageCircle className="w-4 h-4" />
            تواصل معنا مباشرة عبر واتساب
          </button>
        </motion.div>

        {/* Plans */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => <Card key={i} className="h-80 animate-pulse bg-muted/50 border-border" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans?.map((plan, i) => {
              const isHighlighted = planHighlight[plan.type] ?? false;
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={isHighlighted ? "-mt-4" : ""}
                >
                  <Card className={`relative p-6 bg-gradient-to-b ${planColors[plan.type] ?? "from-muted/30 to-muted/50 border-border"} border flex flex-col gap-5`}>
                    {isHighlighted && (
                      <div className="absolute -top-4 right-0 left-0 flex justify-center">
                        <Badge className="bg-primary text-white border-0 shadow-lg shadow-primary/30 px-4 py-1 text-sm">الأكثر طلباً</Badge>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isHighlighted ? "bg-primary/20 text-primary" : "bg-muted text-foreground/70"}`}>
                        {planIcons[plan.type] ?? <Crown className="w-7 h-7" />}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{planLabels[plan.type] ?? plan.type}</h3>
                        {plan.durationDays && (
                          <p className="text-xs text-foreground/50">{plan.durationDays} يوم</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-foreground/50 text-sm mr-1">
                        {plan.type === "annual" ? "/ سنة" : plan.type === "lifetime" ? "مرة واحدة" : ""}
                      </span>
                    </div>

                    <p className="text-sm text-foreground/60">{plan.description}</p>

                    <ul className="space-y-2.5 flex-1">
                      {(planPerks[plan.type] ?? []).map(perk => (
                        <li key={perk} className="flex items-center gap-2 text-sm">
                          <Check className={`w-4 h-4 shrink-0 ${isHighlighted ? "text-primary" : "text-green-400"}`} />
                          {perk}
                        </li>
                      ))}
                    </ul>

                    {/* Payment methods preview */}
                    {plan.type !== "demo" && (
                      <div className="pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">طرق الدفع المتاحة:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {PAYMENT_METHODS.map(m => (
                            <span key={m.id} className="text-xs px-2 py-0.5 rounded-full bg-muted/60 border border-border text-foreground/60">
                              {m.icon} {m.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => handleSubscribe(plan)}
                        className={`w-full h-11 font-bold ${isHighlighted ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30" : "bg-muted hover:bg-muted/70 border border-border"}`}
                        variant={isHighlighted ? "default" : "ghost"}
                      >
                        {plan.type === "demo" ? "ابدأ مجاناً" : "اشترك الآن"}
                      </Button>
                      {plan.type !== "demo" && (
                        <button
                          onClick={openWhatsApp}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm text-green-400 hover:text-green-300 hover:bg-green-500/10 transition-all"
                        >
                          <MessageCircle className="w-4 h-4" />
                          استفسر عبر واتساب
                        </button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Back */}
        <div className="text-center mt-12">
          <Link href="/videos">
            <Button variant="ghost" className="text-muted-foreground hover:text-primary">
              <ArrowRight className="w-4 h-4 ml-2" />
              العودة لمكتبة الدروس
            </Button>
          </Link>
        </div>
      </div>

      {/* Floating WhatsApp Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: "spring" }}
        onClick={openWhatsApp}
        className="fixed bottom-6 left-6 w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 shadow-2xl shadow-green-500/40 flex items-center justify-center z-50 transition-colors"
        title="تواصل عبر واتساب"
      >
        <MessageCircle className="w-7 h-7 text-white" />
      </motion.button>

      {/* Payment Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={(o) => { if (!o) setSelectedPlan(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              إتمام الاشتراك
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <PaymentModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
