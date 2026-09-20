import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ImageIcon, Loader2, Pencil, Plus, Save, Trash2, Upload, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  createHeroBanner,
  deleteHeroBanner,
  fetchAdminHeroBanners,
  reorderHeroBanners,
  updateHeroBanner,
  uploadHeroBannerImage,
  type HeroBanner,
} from "@/features/heroBanners/api";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateImage(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Format accepté : JPEG, PNG ou WebP.";
  if (file.size > MAX_IMAGE_SIZE) return "L'image ne doit pas dépasser 8 Mo.";
  return null;
}

function AuthenticatedBannerImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const { getAdminAuthHeaders } = useAuth();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let nextObjectUrl: string | null = null;

    fetch(src, { headers: getAdminAuthHeaders()?.headers ?? {} })
      .then((response) => {
        if (!response.ok) throw new Error("Image unavailable");
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (!disposed) setObjectUrl(null);
      });

    return () => {
      disposed = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [getAdminAuthHeaders, src]);

  if (!objectUrl) {
    return <div className={`${className} animate-pulse bg-muted`} aria-label={alt} />;
  }

  return <img src={objectUrl} alt={alt} className={className} />;
}

export function AdminHeroBanners() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [title, setTitle] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [preview, setPreview] = useState<HeroBanner | null>(null);
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [desktopPreviewUrl, setDesktopPreviewUrl] = useState<string | null>(null);
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState<string | null>(null);
  const desktopRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextDesktopUrl = desktopFile ? URL.createObjectURL(desktopFile) : null;
    const nextMobileUrl = mobileFile ? URL.createObjectURL(mobileFile) : null;
    setDesktopPreviewUrl(nextDesktopUrl);
    setMobilePreviewUrl(nextMobileUrl);
    return () => {
      if (nextDesktopUrl) URL.revokeObjectURL(nextDesktopUrl);
      if (nextMobileUrl) URL.revokeObjectURL(nextMobileUrl);
    };
  }, [desktopFile, mobileFile]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBanners(await fetchAdminHeroBanners(getAdminAuthHeaders));
    } catch (error) {
      toast({ variant: "destructive", title: "Impossible de charger les bannières", description: error instanceof Error ? error.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeaders, toast]);

  useEffect(() => { void load(); }, [load]);

  const openForm = (banner?: HeroBanner) => {
    setEditing(banner ?? null);
    setTitle(banner?.title ?? "");
    setIsActive(banner?.isActive ?? true);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setTitle("");
    setIsActive(true);
    setDesktopFile(null);
    setMobileFile(null);
    if (desktopRef.current) desktopRef.current.value = "";
    if (mobileRef.current) mobileRef.current.value = "";
  };

  const save = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Le nom interne est requis" });
      return;
    }
    const desktop = desktopRef.current?.files?.[0];
    const mobile = mobileRef.current?.files?.[0];
    for (const file of [desktop, mobile]) {
      if (file) {
        const error = validateImage(file);
        if (error) {
          toast({ variant: "destructive", title: "Image invalide", description: error });
          return;
        }
      }
    }
    if (!editing && !desktop) {
      toast({ variant: "destructive", title: "Une image desktop est requise" });
      return;
    }

    setSaving(true);
    try {
      let banner: HeroBanner | null = null;
      let created = false;
      try {
        const target = editing
          ? editing
          : await createHeroBanner(getAdminAuthHeaders, { title: title.trim(), isActive: false });
        banner = target;
        created = !editing;
        if (desktop) await uploadHeroBannerImage(getAdminAuthHeaders, target.id, "desktop", desktop);
        if (mobile) await uploadHeroBannerImage(getAdminAuthHeaders, target.id, "mobile", mobile);
        await updateHeroBanner(getAdminAuthHeaders, target.id, { title: title.trim(), isActive });
      } catch (error) {
        if (created && banner) {
          try {
            await deleteHeroBanner(getAdminAuthHeaders, banner.id);
          } catch {
            // Keep the original upload error; the server cleanup can be retried by an admin.
          }
        }
        throw error;
      }
      toast({ title: editing ? "Bannière mise à jour" : "Bannière créée" });
      closeForm();
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "Échec de la sauvegarde", description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (banner: HeroBanner) => {
    try {
      await updateHeroBanner(getAdminAuthHeaders, banner.id, { isActive: !banner.isActive });
      setBanners((current) => current.map((item) => item.id === banner.id ? { ...item, isActive: !banner.isActive } : item));
    } catch (error) {
      toast({ variant: "destructive", title: "Impossible de modifier le statut", description: error instanceof Error ? error.message : undefined });
    }
  };

  const remove = async (banner: HeroBanner) => {
    if (!window.confirm(`Supprimer la bannière « ${banner.title ?? "Sans nom"} » ?`)) return;
    try {
      await deleteHeroBanner(getAdminAuthHeaders, banner.id);
      setBanners((current) => current.filter((item) => item.id !== banner.id));
      toast({ title: "Bannière supprimée" });
    } catch (error) {
      toast({ variant: "destructive", title: "Échec de la suppression", description: error instanceof Error ? error.message : undefined });
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= banners.length) return;
    const next = [...banners];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setBanners(next);
    try {
      await reorderHeroBanners(getAdminAuthHeaders, next.map((banner) => banner.id));
    } catch (error) {
      toast({ variant: "destructive", title: "Échec du réordonnancement", description: error instanceof Error ? error.message : undefined });
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ImageIcon className="h-6 w-6 text-primary" />
            Gestion des bannières
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Gérez les visuels promotionnels affichés sur l'accueil.</p>
        </div>
        <Button onClick={() => openForm()} className="gap-2"><Plus className="h-4 w-4" /> Nouvelle bannière</Button>
      </div>

      {formOpen && (
        <Card className="space-y-5 border-primary/20 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{editing ? "Modifier la bannière" : "Nouvelle bannière"}</h2>
            <Button variant="ghost" size="icon" onClick={closeForm}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="banner-title">Nom interne</Label>
              <Input id="banner-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Offre rentrée" />
              <p className="text-xs text-muted-foreground">Ce nom est visible uniquement dans l'administration.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 accent-orange-500" />
              <span><strong> Bannière active</strong><br /><small className="text-muted-foreground">Afficher dans le carousel public</small></span>
            </label>
            <div className="space-y-2">
              <Label>Image desktop {!editing && <span className="text-destructive">*</span>}</Label>
              <Input ref={desktopRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => setDesktopFile(event.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP · 8 Mo maximum</p>
              {desktopPreviewUrl && <img src={desktopPreviewUrl} alt="Aperçu desktop" className="h-24 w-full rounded-lg object-cover" />}
            </div>
            <div className="space-y-2">
              <Label>Image mobile (optionnelle)</Label>
              <Input ref={mobileRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => setMobileFile(event.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">Sans image mobile, l'image desktop est utilisée.</p>
              {mobilePreviewUrl && <img src={mobilePreviewUrl} alt="Aperçu mobile" className="mx-auto h-32 w-20 rounded-lg object-cover" />}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : banners.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-semibold">Aucune bannière configurée</p>
          <p className="text-sm text-muted-foreground">Ajoutez une image desktop pour commencer.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {banners.map((banner, index) => (
            <Card key={banner.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-44">
                {banner.desktopImageUrl ? <AuthenticatedBannerImage src={banner.desktopImageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Upload className="h-5 w-5 text-muted-foreground" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold">{banner.title || "Sans nom"}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{banner.mobileImageUrl ? "Desktop + mobile" : "Desktop uniquement"}</p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${banner.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{banner.isActive ? "Active" : "Désactivée"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="outline" size="icon" title="Monter" disabled={index === 0} onClick={() => void move(index, -1)}><ChevronUp className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Descendre" disabled={index === banners.length - 1} onClick={() => void move(index, 1)}><ChevronDown className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Prévisualiser" onClick={() => setPreview(banner)}><Eye className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title={banner.isActive ? "Désactiver" : "Activer"} onClick={() => void toggle(banner)}>{banner.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                <Button variant="outline" size="icon" title="Modifier" onClick={() => openForm(banner)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Supprimer" onClick={() => void remove(banner)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Prévisualisation de la bannière" onClick={() => setPreview(null)}>
          <div className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-xl bg-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <Button variant="secondary" size="icon" className="absolute right-3 top-3 z-10" onClick={() => setPreview(null)}><X className="h-4 w-4" /></Button>
            <div className="flex max-h-[85vh] max-w-[90vw] flex-col gap-5 overflow-auto p-5 sm:flex-row sm:items-start">
              {preview.desktopImageUrl && (
                <div className="space-y-2">
                  <p className="text-center text-xs font-semibold text-white/80">Desktop</p>
                  <AuthenticatedBannerImage
                    src={preview.desktopImageUrl}
                    alt={`${preview.title ?? "Bannière"} — desktop`}
                    className="max-h-[72vh] max-w-[min(68vw,900px)] object-contain"
                  />
                </div>
              )}
              {preview.mobileImageUrl && (
                <div className="space-y-2">
                  <p className="text-center text-xs font-semibold text-white/80">Mobile</p>
                  <AuthenticatedBannerImage
                    src={preview.mobileImageUrl}
                    alt={`${preview.title ?? "Bannière"} — mobile`}
                    className="mx-auto max-h-[60vh] max-w-[min(28vw,300px)] object-contain"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}