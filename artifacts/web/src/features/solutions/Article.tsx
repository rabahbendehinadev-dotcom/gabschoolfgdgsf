import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { SolutionContent, SolutionDraft, SolutionMedia } from "./contract";
import { Badge } from "@/components/ui/badge";
import { Info, ListOrdered, CheckCircle2, AlertTriangle, Image as ImageIcon, ChevronLeft, DownloadCloud, X, Wrench, Package } from "lucide-react";

export interface SolutionArticleProps {
  content: SolutionContent;
  images: SolutionMedia[];
  admin?: boolean;
  meta?: Partial<Pick<SolutionDraft, "title" | "excerpt" | "brand" | "model" | "category" | "subcategory" | "tool" | "tags" | "coverImageId" | "coverUrl" | "publishedAt">>;
  coverFile?: File | null;
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
    <button type="button" data-testid={`button-expand-solution-image-${id || "local"}`} className={`block w-full cursor-zoom-in group relative overflow-hidden rounded-xl bg-slate-50 border border-slate-200/50 ${className}`} onClick={() => setExpanded(true)} aria-label={`Agrandir ${alt}`}>
      <img src={url} alt={alt} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/[0.03] transition-colors pointer-events-none" />
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

export function SolutionArticleHero({ meta, coverFile, admin }: Pick<SolutionArticleProps, "meta" | "coverFile" | "admin">) {
  if (!meta) return null;
  return (
    <header className="space-y-8 mb-12">
      <div className="space-y-5">
        <div className="flex gap-2 flex-wrap">
          {[meta.brand, meta.model, meta.category, meta.subcategory, meta.tool].filter(Boolean).map((value, i) => (
            <Badge key={i} variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 px-3 py-1 text-sm font-bold transition-colors">{value}</Badge>
          ))}
        </div>
        <h1 data-testid="text-solution-title" className="text-3xl md:text-5xl font-extrabold leading-tight text-slate-900 tracking-tight">{meta.title}</h1>
        {meta.excerpt && <p className="text-xl text-slate-600 whitespace-pre-wrap leading-relaxed max-w-4xl">{meta.excerpt}</p>}

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 pt-2">
          {meta.publishedAt && <time dateTime={meta.publishedAt} className="font-semibold bg-slate-100 px-3.5 py-1.5 rounded-full">{new Date(meta.publishedAt).toLocaleDateString("fr-FR")}</time>}
          {!!meta.tags?.length && meta.tags.map((tag, i) => (
            <span key={i} className="text-slate-400 font-medium">#{tag}</span>
          ))}
        </div>
      </div>

      {(coverFile || meta.coverUrl || meta.coverImageId) && (
        <div className="aspect-video md:aspect-[21/9] rounded-3xl overflow-hidden bg-slate-50 border border-slate-200 shadow-sm relative group p-1">
          {coverFile ? (
            <SolutionImage file={coverFile} alt={meta.title} className="w-full h-full rounded-2xl" />
          ) : meta.coverImageId ? (
            <SolutionImage id={meta.coverImageId} admin={admin} alt={meta.title} className="w-full h-full rounded-2xl" />
          ) : meta.coverUrl ? (
            <img src={meta.coverUrl} alt={meta.title} className="w-full h-full object-contain rounded-2xl" />
          ) : null}
        </div>
      )}
    </header>
  );
}

const Section = ({ title, icon: Icon, children, className = "" }: { title: string, icon?: React.ComponentType<{ className?: string }>, children: React.ReactNode, className?: string }) => (
  <section className={`mb-12 ${className}`}>
    <div className="flex items-center gap-3.5 mb-6">
      {Icon && <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm border border-indigo-100"><Icon className="w-6 h-6" /></div>}
      <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
    </div>
    {children}
  </section>
);

const TextSection = ({ title, text, icon }: { title: string, text: string, icon?: React.ComponentType<{ className?: string }> }) => {
  if (!text?.trim()) return null;
  return (
    <Section title={title} icon={icon}>
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm hover:border-indigo-100 transition-colors">
        <p className="whitespace-pre-wrap leading-relaxed text-slate-700 text-lg">{text}</p>
      </div>
    </Section>
  );
};

const ListSection = ({ title, items, icon }: { title: string, items: string[], icon?: React.ComponentType<{ className?: string }> }) => {
  const valid = items?.filter(v => v.trim());
  if (!valid?.length) return null;
  return (
    <Section title={title} icon={icon}>
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm hover:border-indigo-100 transition-colors">
        <ul className="space-y-4">
          {valid.map((v, i) => (
            <li key={i} className="flex items-start gap-4 text-slate-700">
              <div className="mt-2.5 shrink-0 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
              <span className="whitespace-pre-wrap leading-relaxed text-lg">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
};

export function SolutionArticle({ content, images, admin = false, meta, coverFile }: SolutionArticleProps) {
  const usedImageIds = new Set<string>();
  content.steps?.forEach(step => step.imageIds.forEach(id => usedImageIds.add(id)));
  const unusedImages = images.filter(img => !usedImageIds.has(img.id));

  return (
    <article dir="auto" className="text-slate-800 break-words w-full max-w-full">
      <SolutionArticleHero meta={meta} coverFile={coverFile} admin={admin} />

      {(content.device?.trim() || content.problem?.trim() || meta?.tool || meta?.category) && (
        <div data-testid="grid-solution-quick-info" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
          {[
            { label: "Appareil / الجهاز", value: content.device || [meta?.brand, meta?.model].filter(Boolean).join(" ") },
            { label: "Opération / العملية", value: content.problem },
            { label: "Outil / الأداة", value: meta?.tool },
            { label: "Catégorie / التصنيف", value: meta?.category },
          ].filter(f => f.value?.trim()).map((f, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{f.label}</span>
              <p className="font-bold text-slate-900 text-lg leading-tight line-clamp-2">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      <TextSection title="Introduction / مقدمة" text={content.introduction} icon={Info} />
      <ListSection title="Prérequis / المتطلبات" items={content.requirements} icon={Package} />
      <ListSection title="Avant de commencer / قبل البدء" items={content.beforeStarting} icon={Wrench} />

      {!!content.steps?.length && (
        <Section title="Procédure / الخطوات" icon={ListOrdered} className="mt-10">
          <div data-testid="timeline-solution-procedure" className="relative border-s-2 border-slate-200 ms-4 md:ms-8 ps-6 md:ps-10 space-y-12 pb-4">
            {content.steps.map((step, i) => (
              <div key={i} className="relative group">
                <span data-testid={`text-solution-step-number-${i}`} className="absolute -start-[45px] md:-start-[65px] top-0 flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-white border-2 border-slate-200 group-hover:border-indigo-400 text-lg md:text-xl font-bold text-slate-400 group-hover:text-indigo-600 ring-8 ring-slate-50 transition-colors z-10 shadow-sm">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm group-hover:border-indigo-300 group-hover:shadow-md transition-all">
                  <h3 className="font-bold text-xl md:text-2xl text-slate-900 mb-4 leading-snug">{step.title}</h3>
                  <p className="text-slate-600 whitespace-pre-wrap leading-relaxed text-lg mb-6">{step.text}</p>

                  {step.imageIds.length > 0 && (
                    <div className="grid gap-5 sm:grid-cols-2">
                      {step.imageIds.filter(id => images.some(img => img.id === id)).map(id => (
                        <div key={id} className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
                          <SolutionImage id={id} admin={admin} alt={images.find(img => img.id === id)?.name || step.title} className="w-full h-auto min-h-48 max-h-[450px] rounded-xl" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {content.result?.trim() && (
        <section className="mb-12">
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 md:p-8 flex gap-5 md:gap-6 items-start shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
            <div className="bg-emerald-100 p-3.5 rounded-2xl shrink-0 text-emerald-600 relative z-10 shadow-sm border border-emerald-50 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="relative z-10">
              <h2 className="text-xl md:text-2xl font-bold text-emerald-950 mb-3">Résultat / النتيجة</h2>
              <p className="text-emerald-900 whitespace-pre-wrap leading-relaxed text-lg">{content.result}</p>
            </div>
          </div>
        </section>
      )}

      {content.warnings?.length > 0 && content.warnings.some(w => w.trim()) && (
        <section className="mb-12">
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none text-amber-900 transition-transform group-hover:scale-110"><AlertTriangle className="w-48 h-48" /></div>
            <div className="flex items-center gap-4 mb-6 text-amber-900 relative z-10">
              <div className="bg-amber-100 p-3.5 rounded-2xl text-amber-600 border border-amber-50 shadow-sm group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold">Avertissements / تحذيرات</h2>
            </div>
            <ul className="space-y-4 text-amber-950 relative z-10">
              {content.warnings.filter(w => w.trim()).map((w, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="mt-2.5 shrink-0 w-2 h-2 rounded-full bg-amber-400 ring-4 ring-amber-100" />
                  <span className="whitespace-pre-wrap leading-relaxed text-lg font-medium">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {unusedImages.length > 0 && (
        <Section title="Autres captures / صور إضافية" icon={ImageIcon}>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {unusedImages.map(image => (
              <div key={image.id} className="rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow group p-1">
                <SolutionImage id={image.id} admin={admin} alt={image.name} className="w-full h-48 rounded-2xl" />
                <div className="px-4 py-3 bg-white group-hover:bg-indigo-50/50 transition-colors">
                  <p className="text-sm font-bold text-slate-500 group-hover:text-indigo-700 truncate" title={image.name}>{image.name}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {content.resources?.length > 0 && (
        <Section title="Ressources / التحميلات" icon={DownloadCloud} className="mb-0">
          <div className="grid sm:grid-cols-2 gap-5">
            {content.resources.map((res, i) => {
              const isUrl = /^https?:\/\//i.test(res.url);
              return (
                <a key={i} data-testid={`link-solution-resource-${i}`} href={isUrl ? res.url : undefined} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noopener noreferrer" : undefined}
                   className={`group flex flex-col justify-between bg-white border border-slate-200 rounded-3xl p-6 transition-all ${isUrl ? 'hover:border-indigo-300 hover:shadow-lg hover:-translate-y-1' : 'opacity-75 cursor-not-allowed'}`}>
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-start gap-3">
                      <span className="text-xs font-bold px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg uppercase tracking-widest">{res.type} {res.version}</span>
                      <div className={`p-2.5 rounded-xl transition-colors shadow-sm border border-slate-100 ${isUrl ? 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-500' : 'bg-slate-100 text-slate-400'}`}>
                        <DownloadCloud className="w-6 h-6" />
                      </div>
                    </div>
                    <h3 className={`font-bold text-xl leading-tight transition-colors ${isUrl ? 'text-slate-900 group-hover:text-indigo-600' : 'text-slate-500'}`}>{res.name}</h3>
                    {res.note && <p className="text-sm text-slate-500 whitespace-pre-wrap">{res.note}</p>}
                  </div>
                  <div className={`text-sm font-bold flex items-center gap-1.5 ${isUrl ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {isUrl ? "Télécharger / تحميل" : "Lien invalide"}
                    {isUrl && <ChevronLeft className="w-4 h-4 rtl:rotate-180 transition-transform group-hover:-translate-x-1 rtl:group-hover:translate-x-1" />}
                  </div>
                </a>
              );
            })}
          </div>
        </Section>
      )}
    </article>
  );
}
