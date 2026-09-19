import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useAdminSolution, useAdminSolutionMutations, useSolutionTaxonomiesPublic } from "@/features/solutions/use-solutions";
import { SolutionArticle, SolutionImage } from "@/features/solutions/Article";
import type { SolutionDraftInput, SolutionDraft, SolutionMedia, SolutionContent, SolutionCard, SolutionResource } from "@/features/solutions/contract";

const emptyContent: SolutionContent = { introduction: "", device: "", problem: "", requirements: [], beforeStarting: [], steps: [], result: "", warnings: [], resources: [] };
function hasGeneratedArticle(draft: SolutionDraftInput): boolean {
  const content = { ...emptyContent, ...draft.content };
  return Boolean(
    draft.title?.trim() ||
    draft.excerpt?.trim() ||
    content.introduction.trim() ||
    content.problem.trim() ||
    content.steps.length,
  );
}
function editable(d: SolutionDraftInput): SolutionDraftInput {
  return Object.fromEntries(["title", "slug", "excerpt", "brand", "model", "category", "subcategory", "tool", "tags", "keywords", "rawInput", "content", "imageIds", "coverImageId", "reviewFlags"].filter(k => k in d).map(k => [k, d[k as keyof SolutionDraftInput]]));
}
function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}
const fieldClass = "w-full rounded-md border p-2 bg-white";
export function AdminSolutionForm({ id: routeId }: { id?: string }) {
  const [, navigate] = useLocation();
  const routeNumber = routeId && routeId !== "new" ? Number(routeId) : undefined;
  const { admin } = useAuth();
  const backupKey = `solutions-composer:${admin?.id}:${routeNumber || "new"}`;
  const { data: solution, isLoading, error: loadError } = useAdminSolution(routeNumber);
  const mutations = useAdminSolutionMutations();
  const { data: taxonomy } = useSolutionTaxonomiesPublic();
  const { toast } = useToast();
  const [draft, setDraft] = useState<SolutionDraftInput>({ content: emptyContent, rawInput: "", imageIds: [] });
  const [images, setImages] = useState<SolutionMedia[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [currentId, setCurrentId] = useState<number | undefined>(routeNumber);
  const idRef = useRef<number | undefined>(routeNumber);
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [duplicates, setDuplicates] = useState<SolutionCard[]>([]);
  const [ready, setReady] = useState(false);
  const [backupWarning, setBackupWarning] = useState("");
  const [generationError, setGenerationError] = useState("");
  const initialized = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initialized.current || (routeNumber && !solution)) return;
    initialized.current = true;
    if (solution) {
      setDraft(editable(solution));
      setImages(solution.images);
      setStatus(solution.status);
      setGenerationError(solution.generationError || "");
      setPreview(hasGeneratedArticle(solution));
    }
    try {
      const backup = JSON.parse(localStorage.getItem(backupKey) || "null");
      if (backup && (!solution || backup.savedAt > Date.parse(solution.updatedAt))) {
        setDraft(editable(backup.draft)); setImages(backup.images || []);
        if (backup.id) { idRef.current = backup.id; setCurrentId(backup.id); }
        setBackupWarning("Brouillon local restauré. Vérifiez puis sauvegardez.");
      }
    } catch { setBackupWarning("La sauvegarde locale n'est pas disponible dans ce navigateur."); }
    setReady(true);
  }, [solution, routeNumber, backupKey]);
  const persist = (value = draft, media = images, id = idRef.current) => {
    try { localStorage.setItem(backupKey, JSON.stringify({ draft: editable(value), images: media, id, savedAt: Date.now() })); }
    catch { setBackupWarning("Sauvegarde locale impossible. Sauvegardez sur le serveur avant de quitter."); }
  };
  useEffect(() => { if (ready) persist(); }, [draft, images, ready, currentId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (files.length || busyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const guardNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || !anchor.href || anchor.href === location.href) return;
      if (busyRef.current || (files.length && !confirm("Des images sont encore en attente. Sauvegardez-les avant de quitter. Quitter sans les sauvegarder ?"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardNavigation, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardNavigation, true); };
  }, [files.length]);
  const content = { ...emptyContent, ...draft.content };
  const change = (value: SolutionDraftInput) => { setDraft(d => ({ ...d, ...value })); setReviewed(false); setDuplicates([]); };
  const changeContent = (value: Partial<SolutionContent>) => change({ content: { ...content, ...value } });
  const addFiles = (incoming: File[], cover = false) => {
    if (busyRef.current) return;
    if (incoming.some(f => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024)) {
      setError("Images PNG, JPEG ou WebP uniquement, 8 Mo maximum par image."); return;
    }
    if (images.length + files.length + incoming.length > 10) { setError("Maximum 10 images par solution."); return; }
    setFiles(previous => [...previous, ...incoming]); setReviewed(false);
    if (cover && incoming[0]) setPendingCover(incoming[0]);
  };
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const paste = (e: React.ClipboardEvent, cover = false) => {
    const incoming = Array.from(e.clipboardData.items).filter(item => item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => !!file);
    if (incoming.length) { e.preventDefault(); addFiles(incoming, cover); }
  };
  const applyServer = (value: SolutionDraft) => { setDraft(editable(value)); setImages(value.images); setStatus(value.status); setGenerationError(value.generationError || ""); persist(value, value.images, value.id); };
  const save = async () => {
    persist();
    let saved: SolutionDraft;
    if (!idRef.current) {
      saved = await mutations.create.mutateAsync(editable(draft));
      idRef.current = saved.id; setCurrentId(saved.id);
      persist(draft, images, saved.id);
    } else saved = await mutations.update.mutateAsync({ id: idRef.current, data: editable(draft) });
    let nextImages = [...images];
    let nextDraft = editable(draft);
    if (files.length) {
      const uploaded = await mutations.uploadImages.mutateAsync({ id: saved.id, files });
      const newImages = uploaded.images.filter(image => !images.some(existing => existing.id === image.id));
      nextImages = [...images, ...newImages];
      nextDraft = { ...draft, imageIds: nextImages.map(image => image.id), coverImageId: pendingCover ? newImages[files.indexOf(pendingCover)]?.id || draft.coverImageId : draft.coverImageId };
      setImages(nextImages); setFiles([]); setPendingCover(null); setDraft(nextDraft);
      persist(nextDraft, nextImages, saved.id);
      saved = await mutations.update.mutateAsync({ id: saved.id, data: editable(nextDraft) });
    }
    applyServer(saved);
    return saved.id;
  };
  const run = async (action: "save" | "generate" | "publish" | "unpublish", overrideDuplicate = false) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (action === "publish" && !reviewed) throw new Error("Confirmez la vérification du contenu et des avertissements.");
      if (action === "unpublish") {
        if (!idRef.current) throw new Error("Solution introuvable.");
        applyServer(await mutations.unpublish.mutateAsync(idRef.current));
        toast({ title: "Solution dépubliée — vous pouvez la modifier." });
        return;
      }
      if (status === "published") throw new Error("Dépubliez la solution avant de la modifier.");
      const id = await save();
      if (action === "generate") {
        const generated = await mutations.generate.mutateAsync({ id });
        applyServer(generated);
        setReviewed(false);
        setAdvancedOpen(false);
        setPreview(true);
        requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      if (action === "publish") { applyServer(await mutations.publish.mutateAsync({ id, reviewed: true, overrideDuplicate })); setDuplicates([]); }
      toast({ title: action === "generate" ? "Génération terminée — vérifiez le contenu" : action === "publish" ? "Solution publiée" : "Brouillon sauvegardé" });
      if (!routeNumber) {
        localStorage.removeItem(backupKey);
        navigate(`/bendehinaonline97/solutions/${id}/edit`, { replace: true });
      }
    } catch (e: unknown) {
      const failure = e as { message?: string; data?: { code?: string; message?: string; error?: string; duplicates?: SolutionCard[] } };
      if (failure.data?.code === "POSSIBLE_DUPLICATES") setDuplicates(failure.data.duplicates || []);
      setError(failure.data?.message || failure.data?.error || failure.message || "Opération impossible. Vérifiez les doublons et réessayez. Vos notes sauvegardées sont conservées.");
    } finally { busyRef.current = false; setBusy(false); }
  };
  const removeImage = (id: string) => {
    setImages(images.filter(image => image.id !== id));
    change({ imageIds: (draft.imageIds || []).filter(imageId => imageId !== id), coverImageId: draft.coverImageId === id ? null : draft.coverImageId,
      content: { ...content, steps: content.steps.map(step => ({ ...step, imageIds: step.imageIds.filter(imageId => imageId !== id) })) } });
  };
  const reorderImage = (index: number, direction: number) => { const next = move(images, index, index + direction); setImages(next); change({ imageIds: next.map(image => image.id) }); };
  if (loadError) return <p role="alert">Chargement impossible : {loadError.message}</p>;
  if (!ready || isLoading) return <p>Chargement du brouillon…</p>;
  return <div className="max-w-5xl mx-auto space-y-6 pb-24">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">{currentId ? `Solution #${currentId}` : "Nouvelle solution"}</h1><p className="text-slate-500">Notes + captures → Générer → Vérifier → Publier</p></div><Link href="/bendehinaonline97/solutions">← Toutes les solutions</Link></div>
    <p className="text-sm font-semibold">{status === "published" ? "Publié — dépubliez pour modifier cette solution." : "Brouillon privé"}</p>
    {status === "published" && <div className="flex flex-wrap gap-3"><Button disabled={busy} variant="outline" onClick={() => { if (confirm("Retirer cette solution du public pour la modifier ?")) void run("unpublish"); }}>Dépublier pour modifier</Button><a className="text-primary underline" href={`/solutions/${draft.slug}`} target="_blank" rel="noopener noreferrer">Voir la publication</a></div>}
    {backupWarning && <p className="p-3 rounded bg-amber-50 text-amber-900">{backupWarning}</p>}
    {(error || generationError) && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded">{error || generationError}</p>}
    <fieldset disabled={busy || status === "published"} className="space-y-6 min-w-0">
      <Card className="p-6 space-y-4" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}>
        <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
          <h2 className="font-bold text-xl text-indigo-950">AI Composer — créez la solution ici</h2>
          <p className="text-sm text-indigo-800 mt-1">Écrivez simplement vos notes, collez vos captures et ajoutez vos liens. L’IA remplira automatiquement le titre, les métadonnées, l’article, les étapes, les ressources et le placement des captures.</p>
        </div>
        <label className="block">Notes brutes — Ctrl+V pour coller une capture
          <Textarea className="min-h-48 mt-2" value={draft.rawInput || ""} onChange={e => change({ rawInput: e.target.value })} onPaste={e => paste(e)} placeholder="Appareil, problème, outil, instructions vérifiées, liens…" />
        </label>
        <label className="block border-dashed border-2 rounded-xl p-4">Glissez vos captures ici ou sélectionnez des images (10 max, 8 Mo/image)
          <input aria-label="Captures" className="block mt-2 max-w-full" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{images.map((image, i) => <div key={image.id} className="border rounded-xl p-2 space-y-2">
          <SolutionImage id={image.id} admin alt={image.name} className="h-32 w-full" /><p className="text-xs break-all">{i + 1}. {image.name}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!i} onClick={() => reorderImage(i, -1)}>↑</Button><Button size="sm" variant="outline" disabled={i === images.length - 1} onClick={() => reorderImage(i, 1)}>↓</Button><Button size="sm" variant="outline" onClick={() => removeImage(image.id)}>Retirer</Button></div>
          <label className="text-xs"><input type="radio" name="cover" checked={draft.coverImageId === image.id && !pendingCover} onChange={() => { change({ coverImageId: image.id }); setPendingCover(null); }} /> Couverture publique</label>
        </div>)}{files.map((file, i) => <div key={i} className="border border-amber-300 rounded-xl p-2 space-y-2">
          <SolutionImage file={file} alt={file.name} className="h-32 w-full" /><p className="text-xs">En attente{pendingCover === file ? " — couverture" : ""}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!i} onClick={() => setFiles(move(files, i, i - 1))}>↑</Button><Button size="sm" variant="outline" disabled={i === files.length - 1} onClick={() => setFiles(move(files, i, i + 1))}>↓</Button><Button size="sm" variant="outline" onClick={() => { setFiles(files.filter((_, index) => i !== index)); if (pendingCover === file) setPendingCover(null); }}>Retirer</Button></div>
          <label className="text-xs"><input type="radio" name="cover" checked={pendingCover === file} onChange={() => setPendingCover(file)} /> Couverture publique</label>
        </div>)}</div>
        <div tabIndex={0} onPaste={e => { e.stopPropagation(); paste(e, true); }} className="bg-amber-50 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-amber-900">Attention : la couverture sera publique, même sans abonnement. N'y placez pas d'instructions confidentielles.</p>
          <p className="text-sm">Sélectionnez une capture ci-dessus, ou cliquez ici puis Ctrl+V pour coller une couverture.</p>
          <input aria-label="Importer une couverture" type="file" accept="image/png,image/jpeg,image/webp" className="max-w-full" onChange={e => { addFiles(Array.from(e.target.files || []), true); e.target.value = ""; }} />
          <Button variant="outline" size="sm" onClick={() => { change({ coverImageId: null }); setPendingCover(null); }}>Sans couverture</Button>
        </div>
        {!!files.length && <p className="text-amber-800 text-sm">Sauvegardez avant de quitter : les fichiers en attente ne sont pas conservés après fermeture de la page.</p>}
        <div className="flex flex-wrap gap-3"><Button size="lg" onClick={() => void run("generate")} className="bg-indigo-600 hover:bg-indigo-700">Générer avec AI / Réessayer</Button><Button variant="outline" onClick={() => void run("save")}>Sauvegarder le brouillon et les images</Button></div>
      </Card>

      {preview && <Card ref={previewRef} className="p-6 space-y-6 scroll-mt-6 border-indigo-200 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Résultat généré par l’IA</p><h2 className="text-xl font-bold">Aperçu de l’article</h2><p className="text-sm text-slate-500">Relisez l’article comme il apparaîtra aux membres, puis publiez ou ouvrez l’édition avancée pour une correction.</p></div>
          <Button type="button" variant="outline" onClick={() => { setAdvancedOpen(true); requestAnimationFrame(() => document.getElementById("advanced-solution-editing")?.scrollIntoView({ behavior: "smooth" })); }}>Corriger dans l’édition avancée</Button>
        </div>
        <div className="rounded-2xl bg-slate-50 border p-4 md:p-6 space-y-5">
          <div className="space-y-2"><h1 className="text-2xl md:text-3xl font-bold">{draft.title || "Titre à vérifier"}</h1><p className="text-slate-600 whitespace-pre-wrap">{draft.excerpt || "Aucun extrait public généré."}</p><p className="font-medium">{[draft.brand, draft.model, draft.category, draft.subcategory, draft.tool].filter(Boolean).join(" · ")}</p></div>
          {pendingCover ? <SolutionImage file={pendingCover} alt="Couverture" className="max-h-80 w-full" /> : draft.coverImageId && <SolutionImage id={draft.coverImageId} admin alt="Couverture publique" className="max-h-80 w-full" />}
          <SolutionArticle content={content} images={images} admin />
        </div>
        {!!(draft.reviewFlags || []).filter(Boolean).length && <div className="space-y-2"><h3 className="font-bold text-amber-900">Points signalés par l’IA</h3>{(draft.reviewFlags || []).filter(Boolean).map((flag, i) => <p key={i} className="bg-amber-50 border border-amber-100 p-3 text-amber-900 rounded">À vérifier : {flag}</p>)}</div>}
      </Card>}

      <details id="advanced-solution-editing" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)} className="rounded-xl border bg-white overflow-hidden">
        <summary className="cursor-pointer select-none p-6 font-bold text-lg hover:bg-slate-50">Édition manuelle avancée <span className="font-normal text-sm text-slate-500">— corrections facultatives après génération</span></summary>
        <div className="p-6 pt-0 space-y-6">
      <Card className="p-6 space-y-6 shadow-none">
        <h2 className="font-bold text-lg">Métadonnées générées</h2>
        <div className="grid sm:grid-cols-2 gap-4">{([["title", "Titre"], ["slug", "Slug SEO"], ["brand", "Marque"], ["model", "Modèle"], ["category", "Catégorie"], ["subcategory", "Sous-catégorie"], ["tool", "Outil"]] as const).map(([key, label]) => <label key={key}>{label}<Input value={draft[key] || ""} list={`solution-${key}`} onChange={e => change({ [key]: e.target.value })} /><datalist id={`solution-${key}`}>{key === "tool" ? taxonomy?.tools.map(tool => <option key={tool} value={tool} />) : taxonomy?.taxonomies.filter(t => t.kind === key && (key !== "subcategory" || taxonomy.taxonomies.find(parent => parent.id === t.parentId)?.name === draft.category)).map(t => <option key={t.id} value={t.name} />)}</datalist></label>)}</div>
        <label className="block">Extrait public<Textarea value={draft.excerpt || ""} onChange={e => change({ excerpt: e.target.value })} /></label>
        {(["tags", "keywords"] as const).map(key => <label className="block" key={key}>{key === "tags" ? "Tags" : "Mots-clés de recherche"} (séparés par virgules)<Input value={(draft[key] || []).join(",")} onChange={e => change({ [key]: e.target.value.split(",") })} /></label>)}
      </Card>
      <Card className="p-6 space-y-5 shadow-none">
        <h2 className="font-bold text-lg">Article — tout est modifiable</h2>
        {([["introduction", "Introduction"], ["device", "Informations appareil / plateforme / version"], ["problem", "Problème / opération"], ["result", "Résultat"]] as const).map(([key, label]) => <label className="block" key={key}>{label}<Textarea value={content[key]} onChange={e => changeContent({ [key]: e.target.value })} /></label>)}
        {([["requirements", "Prérequis"], ["beforeStarting", "Avant de commencer"], ["warnings", "Avertissements"]] as const).map(([key, label]) => <label className="block" key={key}>{label} (une entrée par ligne)<Textarea value={content[key].join("\n")} onChange={e => changeContent({ [key]: e.target.value.split("\n") })} /></label>)}
        <h3 className="font-bold">Étapes et placement des captures</h3>
        {content.steps.map((step, index) => <div key={index} className="border rounded-xl p-4 space-y-3 bg-slate-50">
          <div className="flex flex-wrap gap-2 items-center"><strong>Étape {index + 1}</strong><Button variant="outline" size="sm" disabled={!index} onClick={() => changeContent({ steps: move(content.steps, index, index - 1) })}>↑</Button><Button variant="outline" size="sm" disabled={index === content.steps.length - 1} onClick={() => changeContent({ steps: move(content.steps, index, index + 1) })}>↓</Button><Button variant="outline" size="sm" onClick={() => changeContent({ steps: content.steps.filter((_, i) => i !== index) })}>Supprimer</Button></div>
          <Input aria-label={`Titre étape ${index + 1}`} value={step.title} onChange={e => changeContent({ steps: content.steps.map((s, i) => i === index ? { ...s, title: e.target.value } : s) })} />
          <Textarea aria-label={`Texte étape ${index + 1}`} value={step.text} onChange={e => changeContent({ steps: content.steps.map((s, i) => i === index ? { ...s, text: e.target.value } : s) })} />
          <div className="grid sm:grid-cols-2 gap-2">{images.map((image, i) => {
            const assignedIndex = step.imageIds.indexOf(image.id);
            return <div key={image.id} className="flex items-center gap-2 text-sm border rounded-lg p-2">
              <label className="flex items-center gap-2 flex-1"><input type="checkbox" checked={assignedIndex >= 0} onChange={e => changeContent({ steps: content.steps.map((s, j) => j === index ? { ...s, imageIds: e.target.checked ? [...s.imageIds, image.id] : s.imageIds.filter(id => id !== image.id) } : s) })} /> Capture {i + 1}</label>
              {assignedIndex >= 0 && <><Button type="button" size="sm" variant="outline" disabled={!assignedIndex} onClick={() => changeContent({ steps: content.steps.map((s, j) => j === index ? { ...s, imageIds: move(s.imageIds, assignedIndex, assignedIndex - 1) } : s) })}>↑</Button><Button type="button" size="sm" variant="outline" disabled={assignedIndex === step.imageIds.length - 1} onClick={() => changeContent({ steps: content.steps.map((s, j) => j === index ? { ...s, imageIds: move(s.imageIds, assignedIndex, assignedIndex + 1) } : s) })}>↓</Button></>}
            </div>;
          })}</div>
        </div>)}
        <Button variant="outline" onClick={() => changeContent({ steps: [...content.steps, { title: "", text: "", imageIds: [] }] })}>+ Ajouter une étape</Button>
        <h3 className="font-bold">Ressources protégées</h3>
        {content.resources.map((resource, index) => <div className="border rounded-xl p-4 grid sm:grid-cols-2 gap-3" key={index}>
          {(["name", "url", "version", "note"] as const).map(key => <label key={key}>{({ name: "Nom", url: "URL HTTP/HTTPS", version: "Version", note: "Note" })[key]}<Input type={key === "url" ? "url" : "text"} value={resource[key] || ""} onChange={e => changeContent({ resources: content.resources.map((r, i) => i === index ? { ...r, [key]: e.target.value } : r) })} /></label>)}
          <label>Type<select className={fieldClass} value={resource.type} onChange={e => changeContent({ resources: content.resources.map((r, i) => i === index ? { ...r, type: e.target.value as SolutionResource["type"] } : r) })}>{["tool", "driver", "firmware", "file", "external"].map(type => <option key={type}>{type}</option>)}</select></label>
          <div className="flex gap-2 items-end"><Button size="sm" variant="outline" disabled={!index} onClick={() => changeContent({ resources: move(content.resources, index, index - 1) })}>↑</Button><Button size="sm" variant="outline" disabled={index === content.resources.length - 1} onClick={() => changeContent({ resources: move(content.resources, index, index + 1) })}>↓</Button><Button variant="outline" size="sm" onClick={() => changeContent({ resources: content.resources.filter((_, i) => i !== index) })}>Retirer</Button></div>
        </div>)}
        <Button variant="outline" onClick={() => changeContent({ resources: [...content.resources, { name: "", type: "external", url: "" }] })}>+ Ajouter une ressource</Button>
      </Card>
        </div>
      </details>
      <Card className="p-6 space-y-4">
        <h2 className="font-bold text-lg">Vérification et publication</h2>
        {!preview && <p className="text-sm text-slate-600">Générez d’abord l’article avec l’AI Composer. L’aperçu complet apparaîtra avant la publication.</p>}
        <label className="flex gap-3 items-start"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>J'ai vérifié les instructions techniques, les liens, les avertissements et la couverture publique. Je confirme la publication.</span></label>
        {!!duplicates.length && <div className="bg-amber-50 p-4 space-y-3"><h3 className="font-bold">Doublons possibles</h3>{duplicates.map(duplicate => <p key={duplicate.id}><a className="underline" target="_blank" rel="noopener noreferrer" href={`/bendehinaonline97/solutions/${duplicate.id}/edit`}>{duplicate.title} — {duplicate.brand} {duplicate.model}</a></p>)}<Button disabled={!reviewed} onClick={() => void run("publish", true)}>Publier malgré ces doublons</Button></div>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => void run("save")}>Sauvegarder</Button><Button disabled={!preview || !reviewed} onClick={() => void run("publish")}>Confirmer et publier</Button>{status === "published" && <Button variant="outline" onClick={() => { if (confirm("Retirer cette solution du public ?")) void run("unpublish"); }}>Dépublier</Button>}</div>
      </Card>
    </fieldset>
    {busy && <p role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-indigo-700 text-white p-4 rounded-xl shadow-xl">Enregistrement / traitement en cours… Ne fermez pas la page.</p>}
  </div>;
}