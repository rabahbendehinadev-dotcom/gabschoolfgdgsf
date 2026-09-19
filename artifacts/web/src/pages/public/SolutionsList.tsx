import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSolutionsPublic, useSolutionTaxonomiesPublic } from "@/features/solutions/use-solutions";
import { Search, Filter, Loader2, ChevronRight, Wrench, Smartphone, Crown, Lock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useSolutionMeta } from "@/features/solutions/use-solution-meta";

export function SolutionsList() {
  useSolutionMeta("الحلول التقنية", "ابحث في مكتبة حلول إصلاح الهواتف حسب الماركة والموديل والأداة. شروحات تقنية وصور وخطوات موثوقة للمشتركين.");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [tool, setTool] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useSolutionsPublic({ search: debouncedSearch, brand, category, tool, page, pageSize: 12 });
  const { data: tax } = useSolutionTaxonomiesPublic();

  // Simple debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const brands = tax?.brands || [];
  const categories = tax?.categories || [];

  return (
    <div className="bg-slate-50 min-h-screen py-8 pb-24" dir="rtl">
      <div className="container mx-auto px-4 max-w-6xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-4">
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-2 px-3 py-1">جديد</Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
            الحلول التقنية
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
            مكتبة شاملة لحلول إصلاح الهواتف، السوفتوير، فك الحماية، والمزيد. موثوقة ومدعومة بالشرح والصور.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center relative z-10">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              placeholder="ابحث عن موديل، أداة، أو مشكلة..."
              className="pr-12 py-6 text-lg bg-slate-50 border-slate-200 focus-visible:ring-primary rounded-xl"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex flex-wrap w-full md:w-auto gap-3">
            <select aria-label="الأداة" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3" value={tool} onChange={e => { setTool(e.target.value); setPage(1); }}>
              <option value="">كل الأدوات</option>{tax?.tools.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="flex h-12 w-full md:w-40 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={brand} onChange={e => { setBrand(e.target.value); setPage(1); }}
            >
              <option value="">كل الماركات</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select
              className="flex h-12 w-full md:w-48 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
            >
              <option value="">كل الأقسام</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Results */}
        {error && <p role="alert" className="text-red-700">تعذر تحميل الحلول. {error.message}</p>}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : data?.solutions.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-700">لم يتم العثور على نتائج</h3>
            <p className="text-slate-500 mt-2">حاول البحث بكلمات مختلفة أو تعديل الفلاتر.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data?.solutions.map((sol) => (
              <Link key={sol.id} href={`/solutions/${sol.slug}`}>
                <div className="group bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full">

                  {/* Cover */}
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    {sol.coverUrl ? (
                      <img src={sol.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={sol.title} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <Smartphone className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex gap-2">
                      <Badge className="bg-white/90 text-slate-900 backdrop-blur shadow-sm">{sol.brand}</Badge>
                    </div>
                    {/* Locked hint for non-entitled (UI only, actual logic depends on user state) */}
                    <div className="absolute bottom-3 left-3 bg-slate-900/70 backdrop-blur-md rounded-full p-2 text-white">
                      <Lock className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                      <span className="font-medium text-primary">{sol.category}</span>
                      <span>•</span>
                      <span>{sol.model}</span>
                      {sol.publishedAt && (
                        <>
                          <span>•</span>
                          <span>{format(new Date(sol.publishedAt), 'MMM yyyy', { locale: fr })}</span>
                        </>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                      {sol.title}
                    </h3>

                    <p className="text-sm text-slate-600 line-clamp-2 mb-4 flex-1">
                      {sol.excerpt}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        {sol.tool && (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 font-normal px-2">
                            {sol.tool}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center text-primary text-sm font-bold gap-1 group-hover:translate-x-1 transition-transform">
                        <span>عرض الحل</span>
                        <ChevronRight className="h-4 w-4 rotate-180" />
                      </div>
                    </div>
                  </div>

                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex justify-center gap-2 pt-8">
            <Button variant="outline" disabled={page === data.pages} onClick={() => setPage(p => p + 1)}>
              التالي
            </Button>
            <div className="flex items-center px-4 font-medium text-slate-600">
              {page} من {data.pages}
            </div>
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              السابق
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
