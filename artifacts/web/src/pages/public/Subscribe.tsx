import { Link } from "wouter";
import { useGetSubscriptionPlans } from "@workspace/api-client-react/src/generated/api";
import { Card, Button, Badge } from "@/components/ui";
import { Crown, Check, ArrowRight, Zap, Infinity, Clock } from "lucide-react";
import { motion } from "framer-motion";

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
  demo:     ["وصول محدود للدروس", "مشاهدة عينات مجانية", "دعم المجتمع"],
  annual:   ["جميع دروس الفلاش", "جميع دروس الديكوداج", "تحديثات مستمرة طوال السنة", "دعم فني أولوي"],
  lifetime: ["جميع المزايا السنوية", "وصول مدى الحياة", "الدروس القادمة مجاناً", "دعم شخصي مباشر", "شارة VIP حصرية"],
};

export function Subscribe() {
  const { data: plans, isLoading } = useGetSubscriptionPlans();

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
          <p className="text-lg text-foreground/60 max-w-xl mx-auto">
            اختر الخطة المناسبة لك وتمتع بوصول كامل لجميع دروس الفلاش والديكوداج الاحترافية
          </p>
        </motion.div>

        {/* Plans */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => <Card key={i} className="h-80 animate-pulse bg-white/5 border-white/10" />)}
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
                  <Card className={`relative p-6 bg-gradient-to-b ${planColors[plan.type] ?? "from-white/5 to-white/10 border-white/10"} border flex flex-col gap-5`}>
                    {isHighlighted && (
                      <div className="absolute -top-4 right-0 left-0 flex justify-center">
                        <Badge className="bg-primary text-white border-0 shadow-lg shadow-primary/30 px-4 py-1 text-sm">الأكثر طلباً</Badge>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isHighlighted ? "bg-primary/20 text-primary" : "bg-white/10 text-foreground/70"}`}>
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

                    <Link href="/register">
                      <Button
                        className={`w-full h-12 font-bold ${isHighlighted ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30" : "bg-white/10 hover:bg-white/20 border border-white/10"}`}
                        variant={isHighlighted ? "default" : "ghost"}
                      >
                        {plan.type === "demo" ? "ابدأ مجاناً" : "اشترك الآن"}
                      </Button>
                    </Link>
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
    </div>
  );
}
