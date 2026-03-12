import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui";
import { Link } from "wouter";
import { Play, CheckCircle2, Shield, Zap, Crown, Smartphone, Lock, Search } from "lucide-react";
import { useGetCategories, useGetSubscriptionPlans, useGetVideos } from "@workspace/api-client-react/src/generated/api";

export function Home() {
  const { data: categories } = useGetCategories();
  const { data: plans } = useGetSubscriptionPlans();
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const { data: videos } = useGetVideos({ categoryId: activeCategory });

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[150px]" />
          <div className="absolute inset-0 bg-[url('https://pixabay.com/get/g49e2cb578275d925a004e49b44d4f49cff63b43276cad1782a3b44e5b61ebfc0290ea794870a21bd19ada014a89da23f84e32236b6f9f0d9e22d0378cca52842_1280.jpg')] opacity-5 bg-cover bg-center mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>

        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl mx-auto"
          >
            <Badge variant="outline" className="mb-6 px-4 py-2 border-primary/30 bg-primary/10 text-primary">
              <SparklesIcon className="w-4 h-4 ml-2 inline-block" /> المنصة الأولى عربياً
            </Badge>
            <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
              احترف <span className="text-gradient">الفلاش والديكوداج</span> من الصفر للإحتراف
            </h1>
            <p className="text-lg md:text-2xl text-foreground/70 mb-10 max-w-2xl mx-auto leading-relaxed">
              كورسات احترافية، شروحات حصرية، وحلول لأعقد مشاكل الهواتف الذكية. انضم لمجتمع المحترفين الآن.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto rounded-full px-10 text-lg">
                  ابدأ التعلم الآن
                  <Play className="w-5 h-5 mr-2" />
                </Button>
              </Link>
              <Link href="#pricing">
                <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full px-10 text-lg bg-white/5 backdrop-blur-md border-white/20">
                  عرض الاشتراكات
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Videos Showcase Section - Marketing */}
      <section id="courses" className="py-24 bg-black/30 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
              <Lock className="w-3.5 h-3.5 ml-1.5 inline-block" /> محتوى حصري
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">الدروس المتاحة</h2>
            <p className="text-foreground/60 max-w-xl mx-auto">اكتشف مئات الدروس الاحترافية — اشترك الآن للوصول إليها</p>
          </motion.div>

          {/* Category filter tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            <button
              onClick={() => setActiveCategory(undefined)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === undefined
                  ? "bg-primary text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]"
                  : "bg-white/5 border border-white/10 text-foreground/70 hover:bg-white/10"
              }`}
            >
              الكل
            </button>
            {categories?.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat.id
                    ? "bg-primary text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]"
                    : "bg-white/5 border border-white/10 text-foreground/70 hover:bg-white/10"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Videos grid — all locked */}
          {videos && videos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {videos.map((video, i) => (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i % 8) * 0.07 }}
                >
                  <Link href="/subscribe">
                    <div className="group relative rounded-2xl overflow-hidden bg-card border border-white/10 hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                      <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                        {video.thumbnailUrl ? (
                          <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-orange-900/20" />
                        )}
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 group-hover:bg-black/60 transition-colors">
                          <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform group-hover:bg-primary/40">
                            <Lock className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                        {video.accessType === "vip" && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
                            <Crown className="w-2.5 h-2.5" /> VIP
                          </div>
                        )}
                        {video.accessType === "visitor" && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                            مجاني
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-sm leading-snug text-foreground/90 group-hover:text-white line-clamp-2 transition-colors">
                          {video.title}
                        </h3>
                        {video.description && (
                          <p className="text-xs text-foreground/50 mt-1 line-clamp-1">{video.description}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[10px] text-primary/70 font-medium">
                            {categories?.find(c => c.id === video.categoryId)?.name ?? "عام"}
                          </span>
                          <span className="text-[10px] text-foreground/40 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> مقفل
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
              <Search className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg">لا توجد دروس في هذه الفئة</p>
            </div>
          )}

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-14"
          >
            <p className="text-foreground/60 mb-5">اشترك الآن وابدأ مسيرتك نحو الاحتراف</p>
            <Link href="/subscribe">
              <Button size="lg" className="rounded-full px-12 glow-primary">
                اشترك وشاهد جميع الدروس
                <Play className="w-5 h-5 mr-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-black/40 relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">لماذا تختار منصتنا؟</h2>
            <div className="w-24 h-1 bg-primary mx-auto rounded-full opacity-50" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              { icon: Shield, title: "حماية وتحديثات مستمرة", desc: "دروس متجددة تواكب أحدث الحمايات وأنظمة التشغيل" },
              { icon: Crown, title: "عضوية VIP حصرية", desc: "وصول كامل لجميع الملفات والدروس المتقدمة بلا قيود" },
              { icon: Zap, title: "حلول عملية وسريعة", desc: "اختصر الوقت وتعلم طرق حل المشاكل المعقدة في دقائق" }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
              >
                <Card className="p-8 text-center glass-card hover:-translate-y-2 transition-transform duration-300">
                  <div className="w-16 h-16 mx-auto bg-primary/20 text-primary rounded-2xl flex items-center justify-center mb-6 glow-primary">
                    <feature.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-foreground/60">{feature.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories / Brands */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">ماركات الهواتف المدعومة</h2>
              <p className="text-foreground/60">اختر الماركة لتصفح الدروس الخاصة بها</p>
            </div>
            <Link href="/videos">
              <Button variant="ghost" className="hidden sm:flex text-primary hover:text-primary/80">
                عرض الكل <span className="mr-2">←</span>
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {categories?.slice(0, 6).map((cat, i) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Link href={`/videos?categoryId=${cat.id}`}>
                  <Card className="p-6 text-center glass-card hover:bg-white/10 hover:border-primary/50 cursor-pointer transition-all group">
                    <div className="w-12 h-12 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Smartphone className="w-6 h-6 text-foreground/80 group-hover:text-primary" />
                    </div>
                    <h3 className="font-bold">{cat.name}</h3>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-black/60 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <Badge variant="vip" className="mb-4">كن محترفاً</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">اختر الباقة المناسبة لك</h2>
            <p className="text-foreground/60 max-w-2xl mx-auto">استثمر في تطوير مهاراتك وانضم لعضوية VIP للحصول على جميع المميزات</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans?.map((plan, i) => {
              const isPopular = plan.type === 'annual';
              const isVIP = plan.type !== 'demo';
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className={`relative ${isPopular ? '-mt-4 mb-4 md:mb-0 md:-mt-8' : ''}`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 inset-x-0 flex justify-center z-20">
                      <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 border-none text-black font-bold">الأكثر طلباً</Badge>
                    </div>
                  )}
                  <Card className={`h-full flex flex-col p-8 ${
                    isPopular 
                      ? 'border-primary/50 shadow-[0_0_30px_rgba(234,88,12,0.15)] bg-card/95' 
                      : 'border-white/10 bg-black/40'
                  }`}>
                    <div className="mb-8 text-center">
                      <h3 className="text-xl font-bold text-foreground/80 mb-2 uppercase tracking-wider">{
                        plan.type === 'demo' ? 'تجريبي' : 
                        plan.type === 'annual' ? 'اشتراك سنوي' : 'مدى الحياة'
                      }</h3>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-5xl font-black">{plan.price}</span>
                      </div>
                      <p className="text-sm text-foreground/50 mt-2">{plan.durationDays ? `${plan.durationDays} يوم` : 'اشتراك دائم'}</p>
                    </div>

                    <div className="flex-1 space-y-4 mb-8">
                      {plan.description.split('\n').map((line, j) => (
                        <div key={j} className="flex items-start gap-3">
                          <CheckCircle2 className={`w-5 h-5 shrink-0 ${isVIP ? 'text-primary' : 'text-foreground/40'}`} />
                          <span className="text-sm text-foreground/80">{line}</span>
                        </div>
                      ))}
                    </div>

                    <Link href="/register">
                      <Button 
                        variant={isPopular ? 'default' : 'outline'} 
                        className={`w-full ${isPopular ? 'glow-primary' : ''}`}
                      >
                        اشترك الآن
                      </Button>
                    </Link>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
