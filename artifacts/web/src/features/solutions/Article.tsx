import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { SolutionContent, SolutionMedia } from "./contract";

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
    void load();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, admin, file, token, adminToken, credential]);
  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  if (error) return <p role="alert" className="text-xs text-red-700 p-2">{error}</p>;
  if (!url) return <span className="text-xs p-2">Chargement image…</span>;
  return <>
    <button type="button" className={`block cursor-zoom-in ${className}`} onClick={() => setExpanded(true)} aria-label={`Agrandir ${alt}`}>
      <img src={url} alt={alt} className="w-full h-full object-contain rounded-lg" />
    </button>
    {expanded && <div role="dialog" aria-modal="true" aria-label={alt || "Image"} className="fixed inset-0 z-[100] bg-black/90 p-8 flex items-center justify-center" onClick={() => setExpanded(false)}>
      <button autoFocus className="absolute top-3 right-4 text-white p-2" onClick={() => setExpanded(false)}>Fermer ×</button>
      <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>}
  </>;
}

export function SolutionArticle({ content, images, admin = false }: { content: SolutionContent; images: SolutionMedia[]; admin?: boolean }) {
  const text = (title: string, value: string) => value?.trim() ? <section><h2 className="text-xl font-bold border-b pb-2 mb-3">{title}</h2><p className="whitespace-pre-wrap leading-relaxed">{value}</p></section> : null;
  const list = (title: string, values: string[]) => values?.some(v => v.trim()) ? <section><h2 className="text-xl font-bold mb-3">{title}</h2><ul className="list-disc list-inside space-y-2">{values.filter(v => v.trim()).map((v, i) => <li key={i} className="whitespace-pre-wrap">{v}</li>)}</ul></section> : null;
  return <article className="space-y-8 text-slate-700 break-words">
    {text("Introduction / مقدمة", content.introduction)}
    {text("Appareil / معلومات الجهاز", content.device)}
    {text("Problème / العملية", content.problem)}
    {list("Prérequis / المتطلبات", content.requirements)}
    {list("Avant de commencer / قبل البدء", content.beforeStarting)}
    {!!content.steps?.length && <section className="space-y-6"><h2 className="text-2xl font-bold">Procédure / الخطوات</h2>{content.steps.map((step, i) => <section key={i} className="bg-white border rounded-xl p-4 space-y-3">
      <h3 className="font-bold text-lg">{i + 1}. {step.title}</h3><p className="whitespace-pre-wrap">{step.text}</p>
      <div className="grid sm:grid-cols-2 gap-3">{step.imageIds.filter(id => images.some(image => image.id === id)).map(id => <SolutionImage key={id} id={id} admin={admin} alt={images.find(image => image.id === id)?.name || step.title} />)}</div>
    </section>)}</section>}
    {text("Résultat / النتيجة", content.result)}
    {list("Avertissements / تحذيرات", content.warnings)}
    {!!images.length && <section><h2 className="text-xl font-bold mb-3">Captures / الصور</h2><div className="grid sm:grid-cols-2 gap-4">{images.map(image => <SolutionImage key={image.id} id={image.id} admin={admin} alt={image.name} />)}</div></section>}
    {!!content.resources?.length && <section><h2 className="text-xl font-bold mb-3">Ressources / التحميلات</h2><div className="space-y-3">{content.resources.map((resource, i) => <div key={i} className="border rounded-xl p-4">
      <p className="text-xs">{resource.type} {resource.version}</p>
      {/^https?:\/\//i.test(resource.url) ? <a className="text-primary underline font-semibold" href={resource.url} target="_blank" rel="noopener noreferrer">{resource.name}</a> : <span>{resource.name} — URL invalide</span>}
      {resource.note && <p className="whitespace-pre-wrap text-sm mt-2">{resource.note}</p>}
    </div>)}</div></section>}
  </article>;
}