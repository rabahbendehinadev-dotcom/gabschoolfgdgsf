import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { SolutionContent, SolutionDraft, SolutionMedia, SolutionCard } from "./contract";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Info, ListOrdered, CheckCircle2, AlertTriangle, Image as ImageIcon,
  ChevronLeft, DownloadCloud, X, Wrench, Package, Search,
  Smartphone, Settings, Layers, Calendar, Tag, MonitorSmartphone, Target,
  Link as LinkIcon
} from "lucide-react";

export interface SolutionArticleProps {
  content: SolutionContent;
  images: SolutionMedia[];
  admin?: boolean;
  meta?: Partial<Pick<SolutionDraft, "title" | "excerpt" | "brand" | "model" | "category" | "subcategory" | "tool" | "tags" | "coverImageId" | "aiCoverImageId" | "customCoverImageId" | "coverUrl" | "publishedAt">>;
  coverFile?: File | null;
  related?: SolutionCard[];
}

export function SolutionImage({ id, admin = false, file, alt = "", className = "" }: { id?: string; admin?: boolean; file?: File; alt?: string; className?: string }) {
  const { getAuthHeaders, getAdminAuthHeaders, token, adminToken } = useAuth();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const credential = localStorage.getItem("device_credential");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    setUrl(""); setError(""); setExpanded(false);

    async function load() {
      try {
        let blob: Blob;
        if (file) blob = file;
        else {
          const response = await fetch(`/api/${admin ? "admin/" : ""}solutions/images/${id}`, {
            ...(admin ? getAdminAuthHeaders() : getAuthHeaders()), signal: controller.signal, cache: "no-store",
          });
          if (!response.ok) throw new Error(`Image indisponible (${response.status})`);
          blob = await response.blob();
        }
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Image indisponible"); }
    }

    if (id || file) void load();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, admin, file, token, adminToken, credential]);

  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [expanded]);

  if (error) return <div className="flex items-center justify-center h-full min-h-32 bg-red-50 text-red-700 text-sm p-4 rounded-2xl border border-red-100 shadow-inner">{error}</div>;
  if (!url) return <div className="flex items-center justify-center h-full min-h-32 bg-[#FFF8F1] text-slate-400 text-sm p-4 rounded-2xl border border-[#F3DFCF] animate-pulse">Chargement image…</div>;

  return <>
    <button type="button" data-testid={`button-expand-solution-image-${id || "local"}`} className={`block w-full cursor-zoom-in group relative overflow-hidden bg-[#FFF8F1] ${className}`} onClick={() => setExpanded(true)} aria-label={`Agrandir ${alt}`}>
      <img src={url} alt={alt} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/[0.03] transition-colors pointer-events-none" />
      <div className="absolute bottom-4 right-4 bg-orange-950/80 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-full flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm pointer-events-none">
        <Search className="w-4 h-4" />
        <span>Agrandir / تكبير</span>
      </div>
    </button>
    {expanded && (
      <div data-testid="dialog-solution-image" role="dialog" aria-modal="true" aria-label={alt || "Image"} className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center animate-in fade-in duration-200" onClick={() => setExpanded(false)}>
        <button data-testid="button-close-solution-image" autoFocus className="absolute top-4 right-4 md:top-6 md:right-6 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-2 md:p-3 rounded-full transition-colors z-[101]" onClick={() => setExpanded(false)} aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>
        <img src={url} alt={alt} className="max-h-[90vh] max-w-full object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()} />
        {alt && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white bg-black/60 px-6 py-2.5 rounded-full text-sm font-medium backdrop-blur-md max-w-[90%] truncate shadow-lg">{alt}</div>}
      </div>
    )}
  </>;
}

export function SolutionArticleHero({ meta, coverFile, admin, fallbackImageId }: Pick<SolutionArticleProps, "meta" | "coverFile" | "admin"> & { fallbackImageId?: string }) {
  if (!meta) return null;
  const managedCoverImageId = meta.customCoverImageId || meta.aiCoverImageId || meta.coverImageId;
  return (
    <header className="bg-gradient-to-br from-[#FFFCF9] via-[#FFFCF9] to-[#FFF4E8] rounded-2xl border border-[#F3DFCF] p-4 md:p-5 mb-6 md:mb-8 shadow-[0_12px_32px_rgba(120,72,32,0.08)] flex flex-col md:flex-row gap-5 md:gap-6 items-start relative overflow-hidden">
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />

      {(coverFile || meta.coverUrl || managedCoverImageId || (admin && fallbackImageId)) && (
        <div className="w-full md:w-[35%] xl:w-[40%] shrink-0 aspect-video md:aspect-[4/3] rounded-xl overflow-hidden bg-[#FFFCF9] border-2 border-[#F3DFCF] relative group p-1 shadow-[0_4px_16px_rgba(120,72,32,0.07)] z-10">
          {coverFile ? (
            <SolutionImage file={coverFile} alt={meta.title} className="w-full h-full rounded-xl" />
          ) : managedCoverImageId ? (
            <SolutionImage id={managedCoverImageId} admin={admin} alt={meta.title} className="w-full h-full rounded-xl" />
          ) : admin && fallbackImageId ? (
            <SolutionImage id={fallbackImageId} admin alt={meta.title} className="w-full h-full rounded-xl" />
          ) : meta.coverUrl ? (
            <img src={meta.coverUrl} alt={meta.title} className="w-full h-full object-cover object-center rounded-xl" />
          ) : null}
        </div>
      )}
      <div className="flex-1 space-y-3 py-1 min-w-0 z-10">
        <div className="flex gap-2 flex-wrap">
          {[meta.brand, meta.category].filter(Boolean).map((value, i) => (
            <Badge key={`b-${i}`} variant="secondary" className="bg-orange-50 text-orange-700 hover:bg-orange-100 border-transparent px-3 py-1 font-bold rounded-lg">{value}</Badge>
          ))}
          {[meta.subcategory, meta.tool].filter(Boolean).map((value, i) => (
            <Badge key={`s-${i}`} variant="outline" className="bg-[#FFFCF9] text-slate-700 px-3 py-1 border-[#F3DFCF] rounded-lg shadow-sm">{value}</Badge>
          ))}
        </div>
        <h1 data-testid="text-solution-title" className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-tight text-slate-950 tracking-tight">{meta.title}</h1>
        {meta.excerpt && <p className="text-sm md:text-base text-slate-600 leading-relaxed line-clamp-3 max-w-3xl">{meta.excerpt}</p>}

        <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm text-slate-500 pt-3 mt-1 border-t border-orange-200/70">
          {meta.publishedAt && (
            <div className="flex items-center gap-2 font-medium bg-[#FFF8F1] px-3 py-1 rounded-lg">
              <Calendar className="w-4 h-4 text-orange-500" />
              <time dateTime={meta.publishedAt} className="text-slate-700">{new Date(meta.publishedAt).toLocaleDateString("fr-FR")}</time>
            </div>
          )}
          {!!meta.tags?.length && (
            <div className="flex items-center gap-2 font-medium">
              <Tag className="w-4 h-4 text-orange-500" />
              <span className="truncate max-w-[200px] md:max-w-[300px] text-slate-700">{meta.tags.join(", ")}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const SectionCard = ({ id, title, icon: Icon, children, className = "" }: { id?: string, title: string, icon?: React.ComponentType<{ className?: string }>, children: React.ReactNode, className?: string }) => (
  <section id={id} className={`scroll-mt-8 ${className}`}>
    <div className="flex items-center gap-3 mb-5">
      {Icon && (
        <div className="p-2 bg-orange-50 text-orange-600 rounded-xl shadow-sm border border-orange-200/70">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <h2 className="text-xl md:text-2xl font-bold text-slate-950 tracking-tight">{title}</h2>
    </div>
    <div className="bg-[#FFFCF9] border border-[#F3DFCF] rounded-3xl p-5 md:p-8 shadow-[0_4px_18px_rgba(120,72,32,0.06)] hover:shadow-[0_8px_24px_rgba(120,72,32,0.09)] transition-shadow duration-300 w-full break-words">
      {children}
    </div>
  </section>
);

const ChecklistSection = ({ id, title, items, icon }: { id?: string, title: string, items: string[], icon?: React.ComponentType<{ className?: string }> }) => {
  const valid = items?.filter(v => v.trim());
  if (!valid?.length) return null;
  return (
    <SectionCard id={id} title={title} icon={icon}>
      <ul className="space-y-4">
        {valid.map((v, i) => (
          <li key={i} className="flex items-start gap-4 text-slate-700">
            <div className="mt-0.5 shrink-0 text-orange-500 bg-orange-50 p-1 rounded-full border border-orange-200">
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <span className="whitespace-pre-wrap leading-relaxed text-slate-800 text-base md:text-lg break-words flex-1 min-w-0">{v}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

const InfoRow = ({ icon: Icon, label, value }: { icon: any, label: string, value: string | undefined | null }) => {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-[#F3DFCF]/70 last:border-0">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="p-1.5 bg-[#FFF4E8] rounded-lg text-slate-400">
          <Icon className="w-4 h-4 shrink-0" />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-950 text-right break-words max-w-[60%]">{value}</span>
    </div>
  );
};

export function SolutionArticle({ content, images, admin = false, meta, coverFile, related }: SolutionArticleProps) {
  const usedImageIds = new Set<string>();
  content.steps?.forEach(step => step.imageIds.forEach(id => usedImageIds.add(id)));
  const unusedImages = images.filter(img => !usedImageIds.has(img.id));

  const navItems = [
    { id: "introduction", label: "Introduction / مقدمة", show: !!content.introduction?.trim() },
    { id: "prerequisites", label: "Prérequis / المتطلبات", show: !!content.requirements?.some(v => v.trim()) },
    { id: "before-starting", label: "Avant de commencer / قبل البدء", show: !!content.beforeStarting?.some(v => v.trim()) },
    { id: "procedure", label: "Procédure / الخطوات", show: !!content.steps?.length },
    { id: "resources", label: "Ressources / التحميلات", show: !!content.resources?.length },
    { id: "unused-images", label: "Autres captures / صور إضافية", show: unusedImages.length > 0 },
    { id: "result", label: "Résultat / النتيجة", show: !!content.result?.trim(), responsive: true },
    { id: "warnings", label: "Avertissements / تحذيرات", show: !!content.warnings?.some(w => w.trim()), responsive: true },
    { id: "related", label: "Solutions similaires", show: !!related?.length, responsive: true },
  ].filter(i => i.show);

  // Shared Sidebar Blocks
  const deviceInfoBlock = (
    <div className="bg-[#FFF8F1] rounded-3xl border border-[#F3DFCF] p-5 md:p-6 shadow-[0_4px_18px_rgba(120,72,32,0.06)] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
      <div className="flex items-center gap-3 mb-5 relative z-10">
        <div className="p-2 bg-orange-50 text-orange-600 rounded-xl shadow-sm border border-orange-200/70">
          <Settings className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-950">Informations / معلومات</h2>
      </div>
      <div className="flex flex-col relative z-10">
        <InfoRow icon={Smartphone} label="Marque" value={meta?.brand} />
        <InfoRow icon={Layers} label="Modèle" value={meta?.model} />
        <InfoRow icon={Target} label="Opération" value={content.problem} />
        <InfoRow icon={Wrench} label="Outil" value={meta?.tool} />
        <InfoRow icon={MonitorSmartphone} label="Catégorie" value={meta?.category} />
        {meta?.publishedAt && (
          <InfoRow icon={Calendar} label="Publié" value={new Date(meta.publishedAt).toLocaleDateString("fr-FR")} />
        )}
      </div>
    </div>
  );

  const renderOnThisPageBlock = (placement: "mobile" | "desktop") => navItems.length > 0 ? (
    <div className="bg-[#FFF8F1] rounded-3xl border border-[#F3DFCF] p-5 md:p-6 shadow-[0_4px_18px_rgba(120,72,32,0.06)]">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-orange-50 text-orange-600 rounded-xl shadow-sm border border-orange-200/70">
          <ListOrdered className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-950">Sur cette page / في هذه الصفحة</h2>
      </div>
      <nav className="flex flex-col gap-1.5 text-sm font-medium text-slate-600">
        {navItems.map((item) => (
          <a key={item.id} href={`#${item.id}${item.responsive ? `-${placement}` : ""}`} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 transition-colors">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-300" />
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  ) : null;

  const renderResultBlock = (placement: "mobile" | "desktop") => content.result?.trim() ? (
    <div id={`result-${placement}`} className="scroll-mt-8 bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 md:p-6 shadow-sm relative group w-full break-words">
      <div className="flex gap-4 items-start relative z-10">
        <div className="bg-emerald-100/50 p-2.5 rounded-2xl shrink-0 text-emerald-600 border border-emerald-200/50">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-emerald-950 mb-2">Résultat / النتيجة</h2>
          <p className="text-emerald-900/90 whitespace-pre-wrap text-sm md:text-base leading-relaxed break-words">{content.result}</p>
        </div>
      </div>
    </div>
  ) : null;

  const renderWarningsBlock = (placement: "mobile" | "desktop") => (content.warnings?.length > 0 && content.warnings.some(w => w.trim())) ? (
    <div id={`warnings-${placement}`} className="scroll-mt-8 bg-amber-50/50 border border-amber-100 rounded-3xl p-5 md:p-6 shadow-sm relative group w-full break-words">
      <div className="flex items-center gap-3 mb-4 text-amber-900 relative z-10">
        <div className="bg-amber-100/50 p-2 rounded-xl text-amber-600 border border-amber-200/50">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-amber-950">Avertissements / تحذيرات</h2>
      </div>
      <ul className="space-y-3 text-amber-900/90 relative z-10 text-sm md:text-base">
        {content.warnings.filter(w => w.trim()).map((w, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-2 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="whitespace-pre-wrap leading-relaxed break-words flex-1 min-w-0">{w}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const renderRelatedBlock = (placement: "mobile" | "desktop") => (related && related.length > 0) ? (
    <div id={`related-${placement}`} className="scroll-mt-8 bg-[#FFF8F1] border border-[#F3DFCF] rounded-3xl p-5 md:p-6 shadow-[0_4px_18px_rgba(120,72,32,0.06)]">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-orange-50 text-orange-600 rounded-xl shadow-sm border border-orange-200/70">
          <LinkIcon className="w-5 h-5" />
        </div>
        <h2 className="font-bold text-slate-950 text-lg">Solutions similaires</h2>
      </div>
      <div className="space-y-4">
        {related.map(item => (
          <Link key={item.id} href={`/solutions/${item.slug}`} className="flex gap-4 group items-center p-2 -m-2 rounded-2xl hover:bg-[#FFF4E8] transition-colors">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" className="w-20 h-14 object-cover rounded-xl bg-[#FFF4E8] shrink-0 border border-[#F3DFCF] shadow-sm" />
            ) : (
              <div className="w-20 h-14 rounded-xl bg-[#FFF4E8] shrink-0 border border-[#F3DFCF] shadow-sm flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-slate-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-slate-950 group-hover:text-orange-600 line-clamp-2 leading-tight mb-1">{item.title}</h3>
              <p className="text-xs font-medium text-slate-500 truncate" dir="ltr">{item.brand} {item.model}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <article dir="auto" className="text-slate-800 break-words w-full max-w-full">
      <SolutionArticleHero meta={meta} coverFile={coverFile} admin={admin} fallbackImageId={images[0]?.id} />

      <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start w-full">
        {/* Main Content (Left Column) */}
        <div className="flex-1 min-w-0 space-y-8 md:space-y-12 w-full">
          {/* Mobile-only Top Sidebar items (Hero context) */}
          <div className="lg:hidden flex flex-col gap-6">
            {deviceInfoBlock}
            {renderOnThisPageBlock("mobile")}
          </div>

          {content.introduction?.trim() && (
            <SectionCard id="introduction" title="Introduction / مقدمة" icon={Info}>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-700 text-lg">{content.introduction}</p>
            </SectionCard>
          )}

          {content.requirements?.length > 0 && content.requirements.some(v => v.trim()) && (
            <ChecklistSection id="prerequisites" title="Prérequis / المتطلبات" items={content.requirements} icon={Package} />
          )}

          {content.beforeStarting?.length > 0 && content.beforeStarting.some(v => v.trim()) && (
            <ChecklistSection id="before-starting" title="Avant de commencer / قبل البدء" items={content.beforeStarting} icon={Wrench} />
          )}

          {!!content.steps?.length && (
            <section id="procedure" className="scroll-mt-8 w-full">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-xl shadow-sm border border-orange-200/70">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-950 tracking-tight">Procédure / الخطوات</h2>
              </div>
              <div data-testid="timeline-solution-procedure" className="relative border-s-2 border-orange-200 ms-4 md:ms-6 ps-8 md:ps-12 space-y-8 md:space-y-12">
                {content.steps.map((step, i) => (
                  <div key={i} className="relative group w-full break-words">
                    <span data-testid={`text-solution-step-number-${i}`} className="absolute -start-[47px] md:-start-[67px] top-0 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full bg-orange-500 text-white text-sm md:text-base font-bold ring-4 ring-[#FFF9F5] z-10 shadow-md">
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <div className="bg-[#FFFCF9] border border-[#F3DFCF] rounded-3xl p-5 md:p-8 shadow-[0_4px_18px_rgba(120,72,32,0.06)] hover:shadow-[0_8px_24px_rgba(120,72,32,0.09)] transition-shadow duration-300 w-full min-w-0">
                      <h3 className="font-bold text-xl md:text-2xl text-slate-950 mb-4 tracking-tight">{step.title}</h3>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed mb-6 text-base md:text-lg break-words">{step.text}</p>

                      {step.imageIds.length > 0 && (
                        <div className="space-y-6">
                          {step.imageIds.filter(id => images.some(img => img.id === id)).map(id => (
                            <div key={id} className="rounded-2xl overflow-hidden border-2 border-[#F3DFCF] bg-[#FFF4E8] p-2 shadow-[0_4px_16px_rgba(120,72,32,0.06)]">
                              <SolutionImage id={id} admin={admin} alt={images.find(img => img.id === id)?.name || step.title} className="w-full h-auto rounded-xl" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {content.resources?.length > 0 && (
            <section id="resources" className="scroll-mt-8 w-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-xl shadow-sm border border-orange-200/70">
                  <DownloadCloud className="w-5 h-5" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-950 tracking-tight">Ressources / التحميلات</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-5 w-full">
                {content.resources.map((res, i) => {
                  const isUrl = /^https?:\/\//i.test(res.url);
                  return (
                    <a key={i} data-testid={`link-solution-resource-${i}`} href={isUrl ? res.url : undefined} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noopener noreferrer" : undefined}
                       className={`group flex flex-col justify-between bg-[#FFFCF9] border border-[#F3DFCF] rounded-3xl p-5 md:p-6 transition-all shadow-[0_4px_18px_rgba(120,72,32,0.06)] ${isUrl ? 'hover:border-orange-300 hover:shadow-[0_8px_24px_rgba(120,72,32,0.09)] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40' : 'opacity-75 cursor-not-allowed'} min-w-0`}>
                      <div className="space-y-4 mb-4">
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-xs font-bold px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg uppercase tracking-wider whitespace-nowrap">{res.type} {res.version}</span>
                          <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${isUrl ? 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <DownloadCloud className="w-5 h-5" />
                          </div>
                        </div>
                        <h3 className={`font-bold text-lg leading-tight break-words ${isUrl ? 'text-slate-950 group-hover:text-orange-700' : 'text-slate-500'}`}>{res.name}</h3>
                        {res.note && <p className="text-sm text-slate-500 whitespace-pre-wrap break-words">{res.note}</p>}
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {unusedImages.length > 0 && (
            <SectionCard id="unused-images" title="Autres captures / صور إضافية" icon={ImageIcon}>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
                {unusedImages.map(image => (
                  <div key={image.id} className="rounded-2xl overflow-hidden border-2 border-[#F3DFCF] bg-[#FFF4E8] p-1.5 group shadow-[0_4px_16px_rgba(120,72,32,0.06)] transition-all hover:shadow-[0_8px_24px_rgba(120,72,32,0.09)] hover:border-orange-200">
                    <SolutionImage id={image.id} admin={admin} alt={image.name} className="w-full h-48 rounded-xl" />
                    <div className="px-3 py-3 text-center">
                      <p className="text-sm font-bold text-slate-600 group-hover:text-orange-600 truncate" title={image.name}>{image.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Mobile-only Bottom Sidebar items (After content) */}
          <div className="lg:hidden flex flex-col gap-6">
            {renderResultBlock("mobile")}
            {renderWarningsBlock("mobile")}
            {renderRelatedBlock("mobile")}
          </div>
        </div>

        {/* Desktop Sidebar (Right Column) */}
        <aside className="hidden lg:flex flex-col w-[320px] xl:w-[350px] shrink-0 space-y-6 sticky top-6 self-start pb-6">
          {deviceInfoBlock}
          {renderOnThisPageBlock("desktop")}
          {renderResultBlock("desktop")}
          {renderWarningsBlock("desktop")}
          {renderRelatedBlock("desktop")}
        </aside>
      </div>
    </article>
  );
}
