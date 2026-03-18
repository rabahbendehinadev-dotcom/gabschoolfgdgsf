import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, Badge } from "@/components/ui";
import { Link } from "wouter";
import { Play, CheckCircle2, Shield, Zap, Crown, Smartphone, Lock, Search } from "lucide-react";
import { useGetCategories, useGetSubscriptionPlans, useGetVideos } from "@workspace/api-client-react/src/generated/api";
import { useAuth } from "@/lib/auth";

export function Home() {
  const { user, getAuthHeaders } = useAuth();
  const { data: categories } = useGetCategories();
  const { data: plans } = useGetSubscriptionPlans();
  const [activeCategory, setActiveCategory] = useState<number | undefined>();
  const { data: videos } = useGetVideos({ categoryId: activeCategory }, { request: getAuthHeaders() });

  const isLoggedIn = !!user;
  const isDemo = user?.subscriptionType === "demo";
  const isVipUser = user?.accountType === "vip";
  const isLocked = !isLoggedIn || isDemo;

  return (
    <div className="w-full">
      {/* ═══════════════════════════════════════════════════════
          HERO BANNER — Orange-dominant with SVG decode icon
      ════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">

        {/* ── Orange gradient background ── */}
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-800" />

        {/* ── Circuit board overlay pattern ── */}
        <div className="absolute inset-0 z-0 opacity-10">
          <CircuitPattern />
        </div>

        {/* ── Radial glow top-center ── */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-amber-300/20 rounded-full blur-[120px] z-0" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-orange-900/40 rounded-full blur-[100px] z-0" />

        <div className="container relative z-10 mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">

            {/* ── Left side: Text content ── */}
            <motion.div
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex-1 text-center lg:text-right max-w-2xl"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <span className="inline-flex items-center gap-2 mb-6 px-5 py-2 rounded-full bg-black/20 border border-white/30 text-white text-sm font-semibold backdrop-blur-sm">
                  <SparklesIcon className="w-4 h-4" /> المنصة الأولى عربياً في فك شفرات الهواتف
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.7 }}
                className="text-5xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight text-white drop-shadow-lg"
              >
                احترف{" "}
                <span className="text-black">الفلاش</span>
                {" "}والديكوداج
                <br />
                <span className="text-black text-4xl md:text-5xl">من الصفر للإحتراف</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.6 }}
                className="text-lg md:text-xl text-white/85 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed"
              >
                كورسات احترافية، شروحات حصرية، وحلول لأعقد مشاكل الهواتف الذكية.
                انضم لمجتمع المحترفين الآن.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
              >
                <Link href="/register">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto rounded-full px-10 text-lg bg-black hover:bg-black/80 text-white border-0 shadow-2xl"
                  >
                    ابدأ التعلم الآن
                    <Play className="w-5 h-5 mr-2" />
                  </Button>
                </Link>
                <Link href="#pricing">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto rounded-full px-10 text-lg bg-white/20 hover:bg-white/30 text-white border border-white/40 backdrop-blur-sm"
                  >
                    عرض الاشتراكات
                  </Button>
                </Link>
              </motion.div>

              {/* Stats row */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.8 }}
                className="flex items-center justify-center lg:justify-start gap-8 mt-12"
              >
                {[
                  { value: "+500", label: "دورة تدريبية" },
                  { value: "+10K", label: "طالب محترف" },
                  { value: "100%", label: "حلول عملية" },
                ].map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-2xl md:text-3xl font-black text-white">{stat.value}</div>
                    <div className="text-xs text-white/70 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* ── Right side: Animated SVG Icon ── */}
            <motion.div
              initial={{ opacity: 0, y: -120, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="flex-shrink-0 flex items-center justify-center"
            >
              <PhoneDecodeIcon />
            </motion.div>

          </div>
        </div>

        {/* ── Wave divider at bottom ── */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0,60 C360,0 1080,120 1440,40 L1440,80 L0,80 Z" fill="hsl(var(--background))" />
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════
          COURSES SECTION
      ══════════════════════════════════ */}
      <section id="courses" className="py-24 bg-background relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
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

          {videos && videos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {videos.map((video, i) => {
                const at = video.accessType || "normal";
                const isVipVideo = at === "vip";
                const isVisitorVideo = at === "visitor";
                const videoLocked = isVisitorVideo ? false : isVipVideo ? !isVipUser : isLocked;
                const href = videoLocked
                  ? (isLoggedIn ? "/subscribe" : "/login")
                  : `/videos/${video.id}`;

                return (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: (i % 8) * 0.07 }}
                  >
                    <Link href={href}>
                      <div className="group relative rounded-2xl overflow-hidden bg-card border border-white/10 hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                        <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                          {video.thumbnailUrl ? (
                            <img src={video.thumbnailUrl} alt={video.title} className={`w-full h-full object-cover transition-opacity ${videoLocked ? "opacity-60 group-hover:opacity-40" : "opacity-80 group-hover:opacity-100"}`} />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-primary/10 to-orange-900/20" />
                          )}
                          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-colors ${videoLocked ? "bg-black/50 group-hover:bg-black/60" : "bg-black/20 group-hover:bg-black/30"}`}>
                            {videoLocked ? (
                              <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform group-hover:bg-primary/40">
                                <Lock className="w-5 h-5 text-primary" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-primary/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity group-hover:scale-110">
                                <Play className="w-5 h-5 ml-0.5" />
                              </div>
                            )}
                          </div>
                          {isVipVideo && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
                              <Crown className="w-2.5 h-2.5" /> VIP
                            </div>
                          )}
                          {isVisitorVideo && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                              مجاني
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <h3 className={`font-bold text-sm leading-snug line-clamp-2 transition-colors ${videoLocked ? "text-foreground/70" : "text-foreground/90 group-hover:text-white"}`}>
                            {video.title}
                          </h3>
                          {video.description && (
                            <p className="text-xs text-foreground/50 mt-1 line-clamp-1">{video.description}</p>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[10px] text-primary/70 font-medium">
                              {categories?.find(c => c.id === video.categoryId)?.name ?? "عام"}
                            </span>
                            <span className={`text-[10px] flex items-center gap-1 ${videoLocked ? "text-foreground/40" : "text-primary/70"}`}>
                              {videoLocked ? <><Lock className="w-2.5 h-2.5" /> مقفل</> : <><Play className="w-2.5 h-2.5" /> شاهد</>}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
              <Search className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg">لا توجد دروس في هذه الفئة</p>
            </div>
          )}

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

      {/* ══════════════════════════════════
          FEATURES SECTION
      ══════════════════════════════════ */}
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

      {/* ══════════════════════════════════
          CATEGORIES / BRANDS
      ══════════════════════════════════ */}
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

      {/* ══════════════════════════════════
          PRICING
      ══════════════════════════════════ */}
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

/* ─── Animated Phone + Decode SVG Icon ─── */
function PhoneDecodeIcon() {
  return (
    <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
      {/* Outer glow ring */}
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full bg-black/30 blur-2xl"
      />

      <svg
        viewBox="0 0 320 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl"
      >
        {/* ── Circuit lines radiating from phone ── */}
        <g opacity="0.4" stroke="white" strokeWidth="1.5" strokeLinecap="round">
          <line x1="60" y1="100" x2="20" y2="100" />
          <line x1="20" y1="100" x2="20" y2="60" />
          <circle cx="20" cy="60" r="4" fill="white" />

          <line x1="60" y1="160" x2="10" y2="160" />
          <circle cx="10" cy="160" r="4" fill="white" />

          <line x1="60" y1="220" x2="20" y2="220" />
          <line x1="20" y1="220" x2="20" y2="270" />
          <circle cx="20" cy="270" r="4" fill="white" />

          <line x1="260" y1="100" x2="300" y2="100" />
          <line x1="300" y1="100" x2="300" y2="60" />
          <circle cx="300" cy="60" r="4" fill="white" />

          <line x1="260" y1="160" x2="310" y2="160" />
          <circle cx="310" cy="160" r="4" fill="white" />

          <line x1="260" y1="220" x2="300" y2="220" />
          <line x1="300" y1="220" x2="300" y2="270" />
          <circle cx="300" cy="270" r="4" fill="white" />
        </g>

        {/* ── Phone body ── */}
        <rect x="80" y="30" width="160" height="260" rx="24" ry="24" fill="black" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />

        {/* ── Phone screen ── */}
        <rect x="92" y="58" width="136" height="200" rx="12" ry="12" fill="#111" />

        {/* ── Screen glow ── */}
        <rect x="92" y="58" width="136" height="200" rx="12" ry="12" fill="url(#screenGlow)" opacity="0.6" />

        {/* ── Status bar dots ── */}
        <circle cx="160" cy="46" r="5" fill="#333" />
        <rect x="140" y="44" width="20" height="4" rx="2" fill="#222" />

        {/* ── Home indicator ── */}
        <rect x="135" y="276" width="50" height="4" rx="2" fill="#333" />

        {/* ── Binary code lines on screen ── */}
        <g fontFamily="monospace" fontSize="9" fill="rgba(255,165,0,0.7)">
          <text x="100" y="85">01101100 01101111</text>
          <text x="100" y="100">11010010 00110101</text>
          <text x="100" y="115">10110001 11001010</text>
          <text x="100" y="130">01010101 10101100</text>
        </g>

        {/* ── Central lock icon ── */}
        <g transform="translate(130, 148)">
          {/* Lock body */}
          <rect x="5" y="20" width="50" height="36" rx="7" fill="#ea580c" />
          {/* Lock shackle */}
          <path d="M15 20 V12 A15 15 0 0 1 45 12 V20" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* Keyhole */}
          <circle cx="30" cy="35" r="6" fill="white" opacity="0.9" />
          <rect x="27" y="37" width="6" height="10" rx="2" fill="white" opacity="0.9" />
        </g>

        {/* ── "Decoding" progress bar ── */}
        <rect x="100" y="210" width="120" height="6" rx="3" fill="#222" />
        <motion.rect
          x="100" y="210" width={10} height="6" rx="3" fill="#ea580c"
          animate={{ width: [10, 120, 50, 120] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* ── Label ── */}
        <text x="160" y="232" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="rgba(255,255,255,0.5)">DECODING...</text>

        {/* Gradient defs */}
        <defs>
          <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      {/* ── Floating binary particles ── */}
      {["01", "10", "11", "00", "1010", "0101"].map((bit, i) => (
        <motion.div
          key={i}
          className="absolute text-white/40 font-mono text-xs font-bold select-none pointer-events-none"
          style={{
            left: `${[5, 80, 90, -5, 70, 15][i]}%`,
            top: `${[20, 5, 75, 60, 85, 40][i]}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            duration: 2.5 + i * 0.4,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut",
          }}
        >
          {bit}
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Circuit board SVG pattern ─── */
function CircuitPattern() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="circuit" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M0 40 H30 M50 40 H80 M40 0 V30 M40 50 V80" stroke="white" strokeWidth="1" fill="none" />
          <circle cx="40" cy="40" r="4" fill="none" stroke="white" strokeWidth="1" />
          <circle cx="0" cy="40" r="2" fill="white" />
          <circle cx="80" cy="40" r="2" fill="white" />
          <circle cx="40" cy="0" r="2" fill="white" />
          <circle cx="40" cy="80" r="2" fill="white" />
          <rect x="20" y="20" width="10" height="10" fill="none" stroke="white" strokeWidth="0.8" />
          <rect x="50" y="50" width="10" height="10" fill="none" stroke="white" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit)" />
    </svg>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}
