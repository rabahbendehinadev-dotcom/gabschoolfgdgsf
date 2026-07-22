import { useState, useRef, useEffect } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useCreateCategory, useUpdateCategory,
  useDeleteCategory, useReorderCategories, useGetAdminPlaylists,
} from "@workspace/api-client-react/src/generated/api";
import { Category } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { compressImageForUpload } from "@/lib/imageCompress";
import { Card, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash2, FolderTree, GripVertical, Eye, EyeOff, Star,
  Upload, X, Loader2, Save, PlayCircle, ArrowLeft, Home, Link2, GraduationCap, Video,
} from "lucide-react";

interface CategoryForm {
  name: string;
  nameEn: string;
  slug: string;
  icon: string;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
  accentColor: string;
  isVisible: boolean;
  isFeatured: boolean;
  showOnHomepage: boolean;
  linkedPlaylistId: number | null;
}

const EMPTY_FORM: CategoryForm = {
  name: "", nameEn: "", slug: "", icon: "", description: "",
  imageUrl: "", thumbnailUrl: "", accentColor: "", isVisible: true, isFeatured: false, showOnHomepage: true,
  linkedPlaylistId: null,
};

const PRESET_COLORS = ["#ea580c", "#2563eb", "#16a34a", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#475569"];

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^\w\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeUrl(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.pathname + parsed.search;
    }
  } catch { /* not absolute */ }
  return url;
}

function CategoryImage({ imageUrl, accentColor, className }: { imageUrl?: string; accentColor?: string; className?: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`object-contain ${className ?? ""}`}
        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return <FolderTree className={className} style={{ color: accentColor || "var(--primary)" }} />;
}

function SortableCategoryCard({
  category, onEdit, onDelete, onToggleVisible,
}: {
  category: Category;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onToggleVisible: (c: Category) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const accent = category.accentColor || undefined;
  const lessonCount = category.lessonCount ?? 0;
  const img = normalizeUrl(category.imageUrl || "");

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`border-white/5 bg-card overflow-hidden flex flex-col relative group ${!category.isVisible ? "opacity-60" : ""}`}>
        {/* Drag handle */}
        <div
          {...attributes} {...listeners}
          className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/50 text-white/60 hover:text-white hover:bg-black/70 cursor-grab active:cursor-grabbing transition-all"
          title="Glisser pour réordonner"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Top badges */}
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-black/70 text-white text-xs font-bold border border-white/20">
            {category.sortOrder + 1}
          </span>
          {category.isFeatured && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white" title="En vedette">
              <Star className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        <div
          className="aspect-[16/9] relative flex items-center justify-center p-4"
          style={{ background: accent ? `${accent}1a` : "rgba(255,255,255,0.03)" }}
        >
          <CategoryImage imageUrl={img} accentColor={accent} className="w-full h-full max-h-24" />
          {!category.isVisible && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center font-bold text-destructive backdrop-blur-sm">
              Masqué des élèves
            </div>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold line-clamp-1 flex-1">{category.name}</h3>
            {category.nameEn && <span className="text-xs text-muted-foreground" dir="ltr">{category.nameEn}</span>}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2rem]">
            {category.description || "Aucune description"}
          </p>
          <div className="flex items-center gap-3 text-xs text-foreground/50 mb-3">
            <span className="flex items-center gap-1"><PlayCircle className="w-3.5 h-3.5" /> {lessonCount} leçon(s)</span>
            <span dir="ltr" className="font-mono">/{category.slug}</span>
            {category.showOnHomepage && <span className="flex items-center gap-1 text-primary/70"><Home className="w-3 h-3" /> Accueil</span>}
          </div>

          <div className="mt-auto pt-3 flex gap-2 border-t border-white/5">
            <Button variant="secondary" className="flex-1 text-xs" onClick={() => onEdit(category)}>
              <Edit className="w-3 h-3 mr-1" /> Modifier
            </Button>
            <Button
              variant="ghost" size="icon"
              className={category.isVisible ? "text-foreground/60" : "text-destructive"}
              title={category.isVisible ? "Masquer" : "Afficher"}
              onClick={() => onToggleVisible(category)}
            >
              {category.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" title="Supprimer" onClick={() => onDelete(category)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CoursePickerForCategories({ playlists }: { playlists: { id: number; title: string; description?: string | null }[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FolderTree className="w-7 h-7 text-primary" />
          Gestion des catégories
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Choisissez un cours pour gérer ses catégories</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(playlists ?? []).map(pl => (
          <Card key={pl.id} className="glass-card p-5 hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold line-clamp-1">{pl.title}</h3>
                {pl.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{pl.description}</p>}
              </div>
            </div>
            <Link href={`/gab-ctrl-9x/categories?courseId=${pl.id}`}>
              <Button className="w-full gap-2" variant="outline">
                <FolderTree className="w-4 h-4" />
                Gérer les catégories du cours
              </Button>
            </Link>
          </Card>
        ))}
        {(playlists ?? []).length === 0 && (
          <div className="col-span-full">
            <Card className="glass-card p-14 text-center">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Aucun cours. Créez d'abord un cours.</p>
              <Link href="/gab-ctrl-9x/courses">
                <Button variant="outline" className="mt-4">Gérer les cours</Button>
              </Link>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminCategories() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const reqOpts = { request: getAdminAuthHeaders() };
  const search = useSearch();
  const courseIdStr = new URLSearchParams(search).get("courseId");
  const courseId = courseIdStr ? parseInt(courseIdStr) : null;

  const { data: playlists } = useGetAdminPlaylists(reqOpts);
  const currentCourse = courseId ? playlists?.find(p => p.id === courseId) : null;

  const authHeaders = getAdminAuthHeaders() as { headers?: Record<string, string> };
  const fetchHeaders = authHeaders.headers ?? {};

  const { data: categories, refetch } = useQuery({
    queryKey: ["/api/admin/categories", courseId],
    queryFn: async () => {
      const url = courseId
        ? `/api/admin/categories?playlistId=${courseId}`
        : `/api/admin/categories`;
      const res = await fetch(url, { headers: fetchHeaders });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<(Category & { lessonCount?: number })[]>;
    },
    enabled: courseId !== null,
  });
  const createMut = useCreateCategory({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateCategory({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteCategory({ request: getAdminAuthHeaders() });
  const reorderMut = useReorderCategories({ request: getAdminAuthHeaders() });

  const [ordered, setOrdered] = useState<Category[]>([]);
  const [hasOrderChanges, setHasOrderChanges] = useState(false);
  useEffect(() => {
    if (categories) { setOrdered(categories); setHasOrderChanges(false); }
  }, [categories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrdered(prev => {
      const oldIndex = prev.findIndex(c => c.id === active.id);
      const newIndex = prev.findIndex(c => c.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setHasOrderChanges(true);
  };

  const handleSaveOrder = () => {
    const items = ordered.map((c, index) => ({ id: c.id, sortOrder: index }));
    reorderMut.mutate({ data: { items } }, {
      onSuccess: () => {
        toast({ title: "✅ Ordre sauvegardé", className: "bg-green-600 text-white border-none" });
        setHasOrderChanges(false);
        refetch();
      },
      onError: () => toast({ variant: "destructive", title: "Échec de la sauvegarde de l'ordre" }),
    });
  };

  const handleCancelOrder = () => {
    if (categories) setOrdered(categories);
    setHasOrderChanges(false);
  };

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, linkedPlaylistId: courseId ?? null });
    setSlugTouched(false);
    setIsOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      nameEn: c.nameEn || "",
      slug: c.slug,
      icon: c.icon || "",
      description: c.description || "",
      imageUrl: normalizeUrl(c.imageUrl || ""),
      thumbnailUrl: normalizeUrl((c as any).thumbnailUrl || ""),
      accentColor: c.accentColor || "",
      isVisible: c.isVisible,
      isFeatured: c.isFeatured,
      showOnHomepage: c.showOnHomepage,
      linkedPlaylistId: (c as typeof c & { linkedPlaylistId?: number | null }).linkedPlaylistId ?? courseId ?? null,
    });
    setSlugTouched(true);
    setIsOpen(true);
  };

  const setName = (name: string) => {
    setForm(f => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(original.type)) {
      toast({ variant: "destructive", title: "Format non pris en charge", description: "PNG, JPG, WEBP, SVG uniquement" });
      return;
    }
    setUploading(true);
    try {
      const file = await compressImageForUpload(original);
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/storage/uploads/data", { method: "POST", body: formData });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error ?? `HTTP ${resp.status}`);
      }
      const { objectPath } = await resp.json() as { objectPath: string };
      const imageUrl = `/api/storage${objectPath}`;
      setForm(f => ({ ...f, imageUrl, thumbnailUrl: "" }));
      fetch("/api/admin/images/generate-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: objectPath }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.thumbnailUrl) setForm(f => ({ ...f, thumbnailUrl: data.thumbnailUrl }));
      }).catch(() => { /* best-effort */ });
      toast({ title: "Image téléversée" });
    } catch (err) {
      console.error("[upload] category image failed:", err);
      toast({ variant: "destructive", title: "Échec de l'upload", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast({ variant: "destructive", title: "Le nom et le slug sont requis" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      nameEn: form.nameEn.trim() || null,
      slug: form.slug.trim(),
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      thumbnailUrl: form.thumbnailUrl.trim() || null,
      accentColor: form.accentColor.trim() || null,
      isVisible: form.isVisible,
      isFeatured: form.isFeatured,
      showOnHomepage: form.showOnHomepage,
      linkedPlaylistId: form.linkedPlaylistId ?? null,
    };
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: payload })
      : createMut.mutateAsync({ data: payload });
    action.then(() => {
      toast({ title: "Sauvegardé avec succès" });
      setIsOpen(false);
      refetch();
    }).catch(() => toast({ variant: "destructive", title: "Erreur lors de la sauvegarde" }));
  };

  const handleToggleVisible = (c: Category) => {
    updateMut.mutate({ id: c.id, data: { isVisible: !c.isVisible } }, {
      onSuccess: () => { toast({ title: c.isVisible ? "Catégorie masquée" : "Catégorie affichée" }); refetch(); },
      onError: () => toast({ variant: "destructive", title: "Échec de la mise à jour" }),
    });
  };

  const handleDelete = (c: Category) => {
    const count = c.lessonCount ?? 0;
    if (count > 0) {
      toast({ variant: "destructive", title: "Impossible de supprimer", description: `Cette catégorie contient ${count} leçon(s). Déplacez ou supprimez-les d'abord.` });
      return;
    }
    if (!confirm(`Supprimer la catégorie "${c.name}" ?`)) return;
    deleteMut.mutate({ id: c.id }, {
      onSuccess: () => { toast({ title: "Catégorie supprimée" }); refetch(); },
      onError: () => toast({ variant: "destructive", title: "Échec de la suppression", description: "La catégorie contient peut-être des leçons liées." }),
    });
  };

  if (!courseId) {
    return <CoursePickerForCategories playlists={(playlists ?? []) as { id: number; title: string; description?: string | null }[]} />;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/gab-ctrl-9x/categories" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <FolderTree className="w-3.5 h-3.5" />
          Catégories
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium flex items-center gap-1">
          <GraduationCap className="w-3.5 h-3.5 text-primary" />
          {currentCourse?.title ?? `Cours #${courseId}`}
        </span>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{currentCourse?.title ?? `Cours #${courseId}`} — Catégories</h1>
          <p className="text-sm text-muted-foreground mt-1">Glissez les cartes pour réordonner — les changements sont visibles immédiatement</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/gab-ctrl-9x/videos?courseId=${courseId}`}>
            <Button variant="outline" className="gap-2">
              <Video className="w-4 h-4" /> Vidéos du cours
            </Button>
          </Link>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Ajouter une catégorie</Button>
        </div>
      </div>

      {/* Save order bar */}
      {hasOrderChanges && (
        <div className="flex items-center justify-between gap-4 bg-primary/10 border border-primary/30 rounded-xl px-5 py-3">
          <p className="text-sm font-medium text-primary">🔀 Ordre modifié — sauvegardez pour l'appliquer</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelOrder} disabled={reorderMut.isPending}>Annuler</Button>
            <Button size="sm" onClick={handleSaveOrder} disabled={reorderMut.isPending} className="gap-2">
              {reorderMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Sauvegarder l'ordre
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      {!categories ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Card key={i} className="h-64 animate-pulse bg-muted/30 border-white/5" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-24 bg-muted/20 rounded-2xl border border-white/5">
          <FolderTree className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">Aucune catégorie</h3>
          <p className="text-muted-foreground mb-6">Ajoutez une première catégorie pour organiser vos cours</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Ajouter une catégorie</Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {ordered.map(c => (
                <SortableCategoryCard
                  key={c.id}
                  category={c}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggleVisible={handleToggleVisible}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la catégorie" : "Ajouter une catégorie"}</DialogTitle>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6 py-4">
            {/* Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nom (arabe) *</Label>
                  <Input value={form.name} onChange={e => setName(e.target.value)} placeholder="Samsung" dir="rtl" />
                </div>
                <div className="space-y-2">
                  <Label>Nom (anglais)</Label>
                  <Input dir="ltr" className="text-left" value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Samsung" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Slug (URL permanent) *</Label>
                <Input dir="ltr" className="text-left font-mono" value={form.slug}
                  onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })); }}
                  placeholder="samsung" />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <textarea
                  className="flex min-h-[72px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Tutoriels de réparation et maintenance pour cette catégorie"
                />
              </div>

              {/* Image */}
              <div className="space-y-2">
                <Label>Image de la catégorie (PNG / JPG / WEBP / SVG)</Label>
                <div className="flex gap-2">
                  <Input dir="ltr" className="text-left text-sm" placeholder="Lien direct ou uploadez un fichier"
                    value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
                  {form.imageUrl && (
                    <button onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                      className="shrink-0 w-9 h-9 rounded-md bg-white/5 border border-white/10 text-foreground/50 hover:text-destructive hover:border-destructive/40 flex items-center justify-center transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl p-3 text-foreground/40 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50 text-sm">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? "Téléversement..." : "Uploader une image depuis votre appareil"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFileChange} />
              </div>

              {/* Fallback icon + accent color */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Icône de secours (optionnel)</Label>
                  <Input dir="ltr" className="text-left" value={form.icon}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="📱 ou smartphone" />
                </div>
                <div className="space-y-2">
                  <Label>Couleur d'accent</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.accentColor || "#ea580c"}
                      onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                      className="w-9 h-9 rounded-md border border-white/10 bg-transparent cursor-pointer shrink-0" />
                    <div className="flex gap-1 flex-wrap">
                      {PRESET_COLORS.map(col => (
                        <button key={col} type="button" onClick={() => setForm(f => ({ ...f, accentColor: col }))}
                          className="w-5 h-5 rounded-full border border-white/20" style={{ background: col }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Linked course */}
              <div className="space-y-2 pt-1 border-t border-white/10">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Link2 className="w-3.5 h-3.5 text-primary" />
                  Formation liée <span className="text-destructive">*</span>
                </Label>
                {courseId ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/20">
                    <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold flex-1">{currentCourse?.title ?? `Cours #${courseId}`}</span>
                    <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">Fixé</span>
                  </div>
                ) : (
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={form.linkedPlaylistId ?? ""}
                    onChange={e => setForm(f => ({ ...f, linkedPlaylistId: e.target.value ? parseInt(e.target.value) : null }))}
                  >
                    <option value="">— Choisir un cours —</option>
                    {(playlists ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <ToggleRow label="Visible pour les élèves" checked={form.isVisible} onChange={v => setForm(f => ({ ...f, isVisible: v }))} />
                <ToggleRow label="Afficher sur la page d'accueil" checked={form.showOnHomepage} onChange={v => setForm(f => ({ ...f, showOnHomepage: v }))} />
                <ToggleRow label="Catégorie en vedette ⭐" checked={form.isFeatured} onChange={v => setForm(f => ({ ...f, isFeatured: v }))} />
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-3">
              <Label className="text-muted-foreground">Aperçu de la carte (vue élève)</Label>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 overflow-hidden"
                  style={{ background: form.accentColor ? `${form.accentColor}26` : "rgba(234,88,12,0.12)" }}>
                  {form.imageUrl
                    ? <img src={form.imageUrl} alt="" className="w-full h-full object-contain p-1" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    : form.icon && /\p{Extended_Pictographic}/u.test(form.icon)
                      ? <span className="text-2xl leading-none">{form.icon}</span>
                      : <FolderTree className="w-7 h-7" style={{ color: form.accentColor || "var(--primary)" }} />}
                </div>
                <h3 className="font-bold text-lg mb-1.5" style={form.accentColor ? { color: form.accentColor } : undefined}>
                  {form.name || "Nom de la catégorie"}
                </h3>
                <p className="text-sm text-foreground/55 leading-relaxed line-clamp-2 mb-4 min-h-[2.5rem]">
                  {form.description || "La description apparaîtra ici"}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs font-semibold text-foreground/50 flex items-center gap-1">
                    <PlayCircle className="w-3.5 h-3.5" /> Leçons
                  </span>
                  <span className="text-xs font-bold flex items-center gap-1" style={{ color: form.accentColor || "var(--primary)" }}>
                    Voir les leçons <ArrowLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
              {!form.isVisible && (
                <p className="text-xs text-destructive flex items-center gap-1"><EyeOff className="w-3.5 h-3.5" /> Cette catégorie est masquée et n'apparaîtra pas aux élèves</p>
              )}
            </div>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending || uploading}>
            {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {editingId ? "Enregistrer" : "Ajouter la catégorie"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors">
      <span className="text-sm font-medium">{label}</span>
      <span className={`relative w-10 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? "right-0.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}
