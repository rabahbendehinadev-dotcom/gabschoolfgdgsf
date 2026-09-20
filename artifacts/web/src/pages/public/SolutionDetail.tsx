import { useSolutionMeta } from "@/features/solutions/use-solution-meta";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useSolutionDetail } from "@/features/solutions/use-solutions";
import { SolutionArticle } from "@/features/solutions/Article";
import { useAuth } from "@/lib/auth";
import { Loader2, Lock, Smartphone } from "lucide-react";
import { useLocale } from "@/i18n";
import { learningT } from "@/i18n/learningMessages";

export function SolutionDetail({ slug }: { slug: string }) {
  const { data, isLoading, error } = useSolutionDetail(slug);
  const { locale, direction } = useLocale();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  useSolutionMeta(data?.solution.title || learningT(locale, "solutions.title", "الحلول التقنية"), data?.solution.excerpt || learningT(locale, "solutions.title", "مكتبة الحلول التقنية لإصلاح الهواتف"));
  useEffect(() => {
    if (data?.solution.slug && data.solution.slug !== slug) {
      setLocation(`/solutions/${data.solution.slug}`, { replace: true });
    }
  }, [data?.solution.slug, slug, setLocation]);

  if (isLoading) return <div className="flex items-center justify-center min-h-[70vh]"><Loader2 className="animate-spin text-primary h-10 w-10" /></div>;
  if (error || !data) return <div className="text-center min-h-[60vh] py-24 px-4" dir={direction}><h1 className="text-2xl font-bold">{learningT(locale, "solutions.loadingError", "تعذر تحميل الحل")}</h1><p role="alert">{error?.message || learningT(locale, "solutions.unavailable", "الحل غير متوفر")}</p><Link href="/solutions" className="text-primary underline">{learningT(locale, "solutions.back", "العودة للمكتبة")}</Link></div>;

  const { solution, entitled, related } = data;
  const full = entitled && "content" in solution ? solution : null;

  return (
    <div className="bg-[#FFF9F5] min-h-screen pb-24" dir={direction}>
      {!full && (
        <header className="bg-[#FFFCF9] border-b border-[#F3DFCF]">
          <div className="max-w-[1200px] mx-auto px-4 py-10 space-y-6">
            <Link href="/solutions" className="text-primary text-sm font-medium hover:underline">← {learningT(locale, "solutions.back", "الحلول التقنية")}</Link>
            <div className="grid md:grid-cols-3 gap-8 items-start">
              <div className="md:col-span-2 space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {[solution.category].filter(Boolean).map((value, i) => (
                    <Badge key={i} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-transparent px-3 py-1 font-bold">{value}</Badge>
                  ))}
                </div>
                <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-slate-900">{solution.title}</h1>
                <p className="text-lg text-slate-600 whitespace-pre-wrap">{solution.excerpt}</p>
                <p className="font-semibold text-slate-800" dir="ltr">{solution.brand} {solution.model}</p>
                {solution.publishedAt && <time className="text-sm text-slate-500 font-medium" dateTime={solution.publishedAt}>{new Date(solution.publishedAt).toLocaleDateString("fr-FR")}</time>}
                <div className="flex flex-wrap gap-2 pt-2">
                </div>
              </div>
              <div className="aspect-[4/3] rounded-2xl border border-[#F3DFCF] overflow-hidden bg-[#FFF4E8] p-1 shadow-[0_4px_18px_rgba(120,72,32,0.06)]">
                {solution.coverUrl ? (
                  <img src={solution.coverUrl} alt={solution.title} className="w-full h-full object-cover object-center rounded-xl" />
                ) : (
                  <Smartphone className="w-16 h-16 mx-auto mt-12 text-slate-300" />
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="max-w-[1200px] mx-auto px-4 py-6 md:py-10">
        {full ? (
          <SolutionArticle content={full.content} images={full.images} meta={full} related={related} />
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <main className={`${related.length ? "lg:col-span-2" : "lg:col-span-3"} min-w-0`}>
              <section className="bg-[#FFFCF9] border border-[#F3DFCF] rounded-3xl p-8 md:p-12 text-center shadow-[0_4px_18px_rgba(120,72,32,0.06)]">
                <Lock className="h-12 w-12 text-slate-400 mx-auto mb-6" />
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{learningT(locale, "solutions.subscribeFull", "اشترك للوصول إلى الحل الكامل")}</h2>
                <p className="text-slate-600 mb-8 text-lg">{learningT(locale, "solutions.subscribeFull", "الخطوات التفصيلية والصور التقنية وروابط التحميل متاحة للمشتركين فقط.")}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/subscribe" className="bg-primary hover:bg-primary/90 transition-colors text-white rounded-full px-6 py-3 font-semibold shadow-sm">اشترك الآن</Link>
                  {!user && <Link href="/login" className="border border-[#F3DFCF] hover:bg-[#FFF4E8] transition-colors text-slate-700 rounded-full px-6 py-3 font-semibold">تسجيل الدخول</Link>}
                </div>
              </section>
            </main>
            {!!related.length && (
              <aside className="bg-[#FFF8F1] rounded-2xl border border-[#F3DFCF] p-6 h-fit space-y-4 shadow-[0_4px_18px_rgba(120,72,32,0.06)]">
                <h2 className="text-lg font-bold text-slate-900">{learningT(locale, "solutions.similar", "حلول مشابهة")}</h2>
                {related.map(item => (
                  <Link key={item.id} href={`/solutions/${item.slug}`} className="flex gap-3 border-t border-[#F3DFCF]/70 pt-4 group">
                    {item.coverUrl ? (
                      <img src={item.coverUrl} alt="" className="w-20 h-16 object-cover rounded-lg bg-[#FFF4E8] border border-[#F3DFCF] shrink-0" />
                    ) : (
                      <div className="w-20 h-16 rounded-lg bg-[#FFF4E8] border border-[#F3DFCF] shrink-0 flex items-center justify-center">
                        <Smartphone className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-slate-900 group-hover:text-primary line-clamp-2 leading-tight">{item.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 truncate" dir="ltr">{item.brand} {item.model}</p>
                    </div>
                  </Link>
                ))}
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}