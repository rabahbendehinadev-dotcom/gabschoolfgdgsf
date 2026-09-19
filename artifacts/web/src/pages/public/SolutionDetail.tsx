import { useSolutionMeta } from "@/features/solutions/use-solution-meta";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useSolutionDetail } from "@/features/solutions/use-solutions";
import { SolutionArticle } from "@/features/solutions/Article";
import { useAuth } from "@/lib/auth";
import { Loader2, Lock, Smartphone } from "lucide-react";

export function SolutionDetail({ slug }: { slug: string }) {
  const { data, isLoading, error } = useSolutionDetail(slug);
  const { user } = useAuth();
  useSolutionMeta(data?.solution.title || "الحلول التقنية", data?.solution.excerpt || "مكتبة الحلول التقنية لإصلاح الهواتف");
  if (isLoading) return <div className="flex items-center justify-center min-h-[70vh]"><Loader2 className="animate-spin text-primary h-10 w-10" /></div>;
  if (error || !data) return <div className="text-center min-h-[60vh] py-24 px-4" dir="rtl"><h1 className="text-2xl font-bold">تعذر تحميل الحل</h1><p role="alert">{error?.message || "الحل غير متوفر"}</p><Link href="/solutions" className="text-primary underline">العودة للمكتبة</Link></div>;
  const { solution, entitled, related } = data;
  const full = entitled && "content" in solution ? solution : null;
  return <div className="bg-slate-50 min-h-screen pb-24" dir="rtl">
    {!full && <header className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <Link href="/solutions" className="text-primary text-sm">← الحلول التقنية</Link>
        <div className="grid md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-2 space-y-4">
            <div className="flex gap-2 flex-wrap">{[solution.category, solution.subcategory, solution.tool].filter(Boolean).map((value, i) => <Badge key={i} variant="secondary">{value}</Badge>)}</div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">{solution.title}</h1>
            <p className="text-lg text-slate-600 whitespace-pre-wrap">{solution.excerpt}</p>
            <p className="font-semibold">{solution.brand} {solution.model}</p>
            {solution.publishedAt && <time className="text-sm text-slate-500" dateTime={solution.publishedAt}>{new Date(solution.publishedAt).toLocaleDateString("fr-FR")}</time>}
            <div className="flex flex-wrap gap-2">{solution.tags.map((tag, i) => <Badge key={i} variant="outline">{tag}</Badge>)}</div>
          </div>
          <div className="aspect-[4/3] rounded-2xl border overflow-hidden bg-slate-100">{solution.coverUrl ? <img src={solution.coverUrl} alt={solution.title} className="w-full h-full object-cover object-center" /> : <Smartphone className="w-16 h-16 mx-auto mt-12 text-slate-300" />}</div>
        </div>
      </div>
    </header>}
    <div className="max-w-5xl mx-auto px-4 py-10 grid lg:grid-cols-3 gap-8">
      <main className={`${related.length ? "lg:col-span-2" : "lg:col-span-3"} min-w-0`}>
        {full ? <SolutionArticle content={full.content} images={full.images} meta={full} /> : <section className="bg-white border rounded-3xl p-8 md:p-12 text-center shadow-sm">
          <Lock className="h-12 w-12 text-slate-400 mx-auto mb-6" /><h2 className="text-2xl font-bold mb-4">اشترك للوصول إلى الحل الكامل</h2>
          <p className="text-slate-600 mb-8">الخطوات التفصيلية والصور التقنية وروابط التحميل متاحة للمشتركين فقط.</p>
          <div className="flex flex-wrap justify-center gap-3"><Link href="/subscribe" className="bg-primary text-white rounded-full px-6 py-3 font-semibold">اشترك الآن</Link>{!user && <Link href="/login" className="border rounded-full px-6 py-3">تسجيل الدخول</Link>}</div>
        </section>}
      </main>
      {!!related.length && <aside className="bg-white rounded-2xl border p-6 h-fit space-y-4"><h2 className="text-lg font-bold">حلول مشابهة</h2>{related.map(item => <Link key={item.id} href={`/solutions/${item.slug}`} className="flex gap-3 border-t pt-4 group">
        {item.coverUrl && <img src={item.coverUrl} alt="" className="w-20 h-16 object-cover rounded-lg" />}<div><h3 className="font-semibold group-hover:text-primary">{item.title}</h3><p className="text-xs text-slate-500 mt-1">{item.brand} {item.model}</p></div>
      </Link>)}</aside>}
    </div>
  </div>;
}