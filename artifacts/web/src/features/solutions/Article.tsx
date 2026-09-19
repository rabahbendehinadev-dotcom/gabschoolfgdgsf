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
  meta?: Partial<Pick<SolutionDraft, "title" | "excerpt" | "brand" | "model" | "category" | "subcategory" | "tool" | "tags" | "coverImageId" | "coverUrl" | "publishedAt">>;
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

  if (error) return <div className="flex items-center justify-center h-full min-h-32 bg-red-50 text-red-700 text-sm p-4 rounded-xl border border-red-100 shadow-inner">{error}</div>;
  if (!url) return <div className="flex items-center justify-center h-full min-h-32 bg-slate-50 text-slate-400 text-sm p-4 rounded-xl border border-slate-100 animate-pulse">Chargement image…</div>;

  return <>
    <button type="button" data-testid={`button-expand-solution-image-${id || "local"}`} className={`block w-full cursor-zoom-in group relative overflow-hidden rounded-xl bg-slate-100 border border-slate-200 ${className}`} onClick={() => setExpanded(true)} aria-label={`Agrandir ${alt}`}>
      <img src={url} alt={alt} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/[0.03] transition-colors pointer-events-none" />
      <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shadow-sm pointer-events-none">
        <Search className="w-3.5 h-3.5" />
        <span>Agrandir / تكبير</span>
      </div>
    </button>
    {expanded && (
      <div data-testid="dialog-solution-image" role="dialog" aria-modal="true" aria-label={alt || "Image"} className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center animate-in fade-in duration-200" onClick={() => setExpanded(false)}>
        <button data-testid="button-close-solution-image" autoFocus className="absolute top-4 right-4 md:top-6 md:right-6 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-2 md:p-3 rounded-full transition-colors z-[101]" onClick={() => setExpanded(false)} aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>
        <img src={url} alt={alt} className="max-h-[90vh] max-w-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()} />
        {alt && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white bg-black/60 px-6 py-2.5 rounded-full text-sm font-medium backdrop-blur-md max-w-[90%] truncate shadow-lg">{alt}</div>}
      </div>
    )}
  </>;
}

export function SolutionArticleHero({ meta, coverFile, admin, fallbackImageId }: Pick<SolutionArticleProps, "meta" | "coverFile" | "admin"> & { fallbackImageId?: string }) {
  if (!meta) return null;
  return (
    <header className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 mb-6 md:mb-8 shadow-sm flex flex-col md:flex-row gap-5 md:gap-6 items-start">
      {(coverFile || meta.coverUrl || meta.coverImageId || (admin && fallbackImageId)) && (
        <div className="w-full md:w-[35%] xl:w-[40%] shrink-0 aspect-video md:aspect-[4/3] rounded-xl overflow-hidden bg-slate-50 border border-slate-100 relative group p-1">
          {coverFile ? (
            <SolutionImage file={coverFile} alt={meta.title} className="w-full h-full rounded-lg" />
          ) : meta.coverImageId ? (
            <SolutionImage id={meta.coverImageId} admin={admin} alt={meta.title} className="w-full h-full rounded-lg" />
          ) : admin && fallbackImageId ? (
            <SolutionImage id={fallbackImageId} admin alt={meta.title} className="w-full h-full rounded-lg" />
          ) : meta.coverUrl ? (
            <img src={meta.coverUrl} alt={meta.title} className="w-full h-full object-cover object-center rounded-lg" />
          ) : null}
        </div>
      )}
      <div className="flex-1 space-y-3 py-1 min-w-0">
        <div className="flex gap-2 flex-wrap">
          {[meta.brand, meta.category].filter(Boolean).map((value, i) => (
            <Badge key={`b-${i}`} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-transparent px-3 py-1 font-bold">{value}</Badge>
          ))}
          {[meta.subcategory, meta.tool].filter(Boolean).map((value, i) => (
            <Badge key={`s-${i}`} variant="outline" className="text-slate-600 px-3 py-1 border-slate-200">{value}</Badge>
          ))}
        </div>
        <h1 data-testid="text-solution-title" className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-tight text-slate-900">{meta.title}</h1>
        {meta.excerpt && <p className="text-sm md:text-base text-slate-600 leading-relaxed line-clamp-3">{meta.excerpt}</p>}

        <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm text-slate-500 pt-3 mt-1 border-t border-slate-100">
          {meta.publishedAt && (
            <div className="flex items-center gap-1.5 font-medium bg-slate-50 px-2.5 py-1 rounded-md">
              <Calendar className="w-4 h-4 text-slate-400" />
              <time dateTime={meta.publishedAt}>{new Date(meta.publishedAt).toLocaleDateString("fr-FR")}</time>
            </div>
          )}
          {!!meta.tags?.length && (
            <div className="flex items-center gap-1.5 font-medium">
              <Tag className="w-4 h-4 text-slate-400" />
              <span className="truncate max-w-[200px] md:max-w-[250px]">{meta.tags.join(", ")}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const SectionCard = ({ id, title, icon: Icon, children, className = "" }: { id?: string, title: string, icon?: React.ComponentType<{ className?: string }>, children: React.ReactNode, className?: string }) => (
  <section id={id} className={`scroll-mt-8 ${className}`}>
    <div className="flex items-center gap-2.5 mb-4">
      {Icon && <div className="p-1.5 bg-primary/10 text-primary rounded-lg"><Icon className="w-5 h-5" /></div>}
      <h2 className="text-lg md:text-xl font-bold text-slate-900">{title}</h2>
    </div>
    <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm">
      {children}
    </div>
  </section>
);

const ChecklistSection = ({ id, title, items, icon }: { id?: string, title: string, items: string[], icon?: React.ComponentType<{ className?: string }> }) => {
  const valid = items?.filter(v => v.trim());
  if (!valid?.length) return null;
  return (
    <SectionCard id={id} title={title} icon={icon}>
      <ul className="space-y-3">
        {valid.map((v, i) => (
          <li key={i} className="flex items-start gap-3 text-slate-700">
            <div className="mt-0.5 shrink-0 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="whitespace-pre-wrap leading-relaxed">{v}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

const InfoRow = ({ icon: Icon, label, value }: { icon: any, label: string, value: string | undefined | null }) => {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2.5 text-slate-500">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-900 text-right">{value}</span>
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
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 font-bold text-slate-900">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-base">Informations / معلومات</h2>
      </div>
      <div className="flex flex-col">
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
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 font-bold text-slate-900">
        <ListOrdered className="w-5 h-5 text-primary" />
        <h2 className="text-base">Sur cette page / في هذه الصفحة</h2>
      </div>
      <nav className="flex flex-col gap-1 text-sm font-medium text-slate-600">
        {navItems.map((item) => (
          <a key={item.id} href={`#${item.id}${item.responsive ? `-${placement}` : ""}`} className="flex items-center gap-2.5 py-1.5 hover:text-primary transition-colors">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  ) : null;

  const renderResultBlock = (placement: "mobile" | "desktop") => content.result?.trim() ? (
    <div id={`result-${placement}`} className="scroll-mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 md:p-5 shadow-sm relative overflow-hidden group">
      <div className="flex gap-3 items-start relative z-10">
        <div className="bg-emerald-100 p-2 rounded-xl shrink-0 text-emerald-600">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-emerald-950 mb-1">Résultat / النتيجة</h2>
          <p className="text-emerald-900 whitespace-pre-wrap text-sm leading-relaxed">{content.result}</p>
        </div>
      </div>
    </div>
  ) : null;

  const renderWarningsBlock = (placement: "mobile" | "desktop") => (content.warnings?.length > 0 && content.warnings.some(w => w.trim())) ? (
    <div id={`warnings-${placement}`} className="scroll-mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-5 shadow-sm relative overflow-hidden group">
      <div className="flex items-center gap-2 mb-3 text-amber-900 relative z-10">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <h2 className="text-base font-bold">Avertissements / تحذيرات</h2>
      </div>
      <ul className="space-y-2 text-amber-950 relative z-10 text-sm">
        {content.warnings.filter(w => w.trim()).map((w, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="whitespace-pre-wrap leading-relaxed">{w}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const renderRelatedBlock = (placement: "mobile" | "desktop") => (related && related.length > 0) ? (
    <div id={`related-${placement}`} className="scroll-mt-8 bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2 text-base">
          <LinkIcon className="w-4 h-4 text-primary" />
          Solutions similaires
        </h2>
      </div>
      <div className="space-y-4">
        {related.map(item => (
          <Link key={item.id} href={`/solutions/${item.slug}`} className="flex gap-3 group items-center">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" className="w-16 h-12 object-cover rounded-lg bg-slate-100 shrink-0 border border-slate-200" />
            ) : (
              <div className="w-16 h-12 rounded-lg bg-slate-100 shrink-0 border border-slate-200 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-slate-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-slate-900 group-hover:text-primary line-clamp-2 leading-tight mb-1">{item.title}</h3>
              <p className="text-xs text-slate-500 truncate" dir="ltr">{item.brand} {item.model}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <article dir="auto" className="text-slate-800 break-words w-full max-w-full">
      <SolutionArticleHero meta={meta} coverFile={coverFile} admin={admin} fallbackImageId={images[0]?.id} />

      <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start">
        {/* Main Content (Left Column) */}
        <div className="flex-1 min-w-0 space-y-8 md:space-y-10 w-full">
          {/* Mobile-only Top Sidebar items (Hero context) */}
          <div className="lg:hidden flex flex-col gap-6">
            {deviceInfoBlock}
            {renderOnThisPageBlock("mobile")}
          </div>

          {content.introduction?.trim() && (
            <SectionCard id="introduction" title="Introduction / مقدمة" icon={Info}>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{content.introduction}</p>
            </SectionCard>
          )}

          {content.requirements?.length > 0 && content.requirements.some(v => v.trim()) && (
            <ChecklistSection id="prerequisites" title="Prérequis / المتطلبات" items={content.requirements} icon={Package} />
          )}

          {content.beforeStarting?.length > 0 && content.beforeStarting.some(v => v.trim()) && (
            <ChecklistSection id="before-starting" title="Avant de commencer / قبل البدء" items={content.beforeStarting} icon={Wrench} />
          )}

          {!!content.steps?.length && (
            <section id="procedure" className="scroll-mt-8">
              <div className="flex items-center gap-2.5 mb-6">
                <div className="p-1.5 bg-primary/10 text-primary rounded-lg"><ListOrdered className="w-5 h-5" /></div>
                <h2 className="text-lg md:text-xl font-bold text-slate-900">Procédure / الخطوات</h2>
              </div>
              <div data-testid="timeline-solution-procedure" className="relative border-s-2 border-slate-200 ms-3 md:ms-5 ps-6 md:ps-8 space-y-8">
                {content.steps.map((step, i) => (
                  <div key={i} className="relative group">
                    <span data-testid={`text-solution-step-number-${i}`} className="absolute -start-[37px] md:-start-[49px] top-0 flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-800 text-white text-sm font-bold ring-4 ring-slate-50 z-10 shadow-sm">
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm">
                      <h3 className="font-bold text-lg md:text-xl text-slate-900 mb-3">{step.title}</h3>
                      <p className="text-slate-600 whitespace-pre-wrap leading-relaxed mb-5">{step.text}</p>

                      {step.imageIds.length > 0 && (
                        <div className="space-y-4">
                          {step.imageIds.filter(id => images.some(img => img.id === id)).map(id => (
                            <div key={id} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
                              <SolutionImage id={id} admin={admin} alt={images.find(img => img.id === id)?.name || step.title} className="w-full h-auto rounded-lg" />
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
            <section id="resources" className="scroll-mt-8">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 bg-primary/10 text-primary rounded-lg"><DownloadCloud className="w-5 h-5" /></div>
                <h2 className="text-lg md:text-xl font-bold text-slate-900">Ressources / التحميلات</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {content.resources.map((res, i) => {
                  const isUrl = /^https?:\/\//i.test(res.url);
                  return (
                    <a key={i} data-testid={`link-solution-resource-${i}`} href={isUrl ? res.url : undefined} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noopener noreferrer" : undefined}
                       className={`group flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-4 md:p-5 transition-all shadow-sm ${isUrl ? 'hover:border-primary/40 hover:shadow-md' : 'opacity-75 cursor-not-allowed'}`}>
                      <div className="space-y-3 mb-4">
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-[11px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md uppercase tracking-wider">{res.type} {res.version}</span>
                          <div className={`p-2 rounded-lg transition-colors ${isUrl ? 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <DownloadCloud className="w-5 h-5" />
                          </div>
                        </div>
                        <h3 className={`font-bold text-base leading-tight ${isUrl ? 'text-slate-900 group-hover:text-primary' : 'text-slate-500'}`}>{res.name}</h3>
                        {res.note && <p className="text-xs text-slate-500 whitespace-pre-wrap">{res.note}</p>}
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {unusedImages.length > 0 && (
            <SectionCard id="unused-images" title="Autres captures / صور إضافية" icon={ImageIcon}>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {unusedImages.map(image => (
                  <div key={image.id} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1 group">
                    <SolutionImage id={image.id} admin={admin} alt={image.name} className="w-full h-40 rounded-lg" />
                    <div className="px-2 py-2">
                      <p className="text-xs font-bold text-slate-500 group-hover:text-primary truncate" title={image.name}>{image.name}</p>
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
        <aside className="hidden lg:flex flex-col w-[320px] xl:w-[350px] shrink-0 space-y-6 sticky top-6 self-start max-h-[calc(100vh-2rem)] overflow-y-auto sidebar-scroll pb-6">
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
