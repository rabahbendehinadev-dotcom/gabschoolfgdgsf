import { useState, useRef, useEffect } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
  useSortable, arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCreateVideo, useUpdateVideo, useDeleteVideo, useReorderVideos, useMigrateVideoStorage, useGetAdminPlaylists } from "@workspace/api-client-react/src/generated/api";
import { AdminVideo, CreateVideoInput } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Upload, ImageIcon, X, Loader2, Layers, GripVertical, Save, Zap, GraduationCap, ArrowRight, Video } from "lucide-react";

interface DrivePart { label: string; url: string; }

function validateDriveUrl(url: string): string | null {
  if (!url || !url.trim()) return null;
  if (!url.includes("drive.google.com") && !url.includes("docs.google.com")) {
    return "يجب أن يكون رابط Google Drive صالحاً";
  }
  if (/\/folders\/[a-zA-Z0-9_-]{10,}/.test(url)) {
    return "هذا رابط مجلد وليس ملف فيديو. افتح المجلد واختر الفيديو وانسخ رابطه المباشر (file/d/...)";
  }
  const hasId =
    /\/d\/[a-zA-Z0-9_-]{10,}/.test(url) ||
    /[?&]id=[a-zA-Z0-9_-]{10,}/.test(url);
  if (!hasId) return "لم يتم التعرف على صيغة رابط Google Drive";
  return null;
}

/* ── شاشة اختيار الدورة (عند دخول /videos بدون courseId) ── */
function CoursePickerScreen({ playlists }: { playlists: { id: number; title: string; description?: string | null; imageUrl?: string | null; videos?: unknown[] }[] }) {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Video className="w-7 h-7 text-primary" />
          إدارة الفيديوهات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">اختر الدورة لإدارة فيديوهاتها</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(playlists ?? []).map(pl => (
          <Card key={pl.id} className="glass-card overflow-hidden hover:border-primary/30 transition-colors">
            {(pl as { imageUrl?: string | null }).imageUrl && (
              <div className="aspect-video relative overflow-hidden bg-muted/30">
                <img
                  src={(pl as { imageUrl?: string | null }).imageUrl!}
                  alt={pl.title}
                  className="w-full h-full object-cover opacity-80"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              </div>
            )}
            {!(pl as { imageUrl?: string | null }).imageUrl && (
              <div className="aspect-video flex items-center justify-center bg-muted/20">
                <GraduationCap className="w-12 h-12 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-4">
              <h3 className="font-bold text-base mb-1 line-clamp-1">{pl.title}</h3>
              {pl.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{pl.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                <span>{pl.videos?.length ?? 0} درس</span>
              </div>
              <Link href={`/gab-ctrl-9x/videos?courseId=${pl.id}`}>
                <Button className="w-full gap-2">
                  <Video className="w-4 h-4" />
                  إدارة فيديوهات الدورة
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </Card>
        ))}

        {(playlists ?? []).length === 0 && (
          <div className="col-span-full">
            <Card className="glass-card p-14 text-center">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد دورات. أنشئ دورة أولاً من صفحة إدارة الدورات.</p>
              <Link href="/gab-ctrl-9x/courses">
                <Button variant="outline" className="mt-4">الذهاب إلى إدارة الدورات</Button>
              </Link>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sortable Video Card ── */
function SortableVideoCard({
  video,
  onEdit,
  onDelete,
  onMigrate,
  isMigrating,
}: {
  video: AdminVideo;
  onEdit: (v: AdminVideo) => void;
  onDelete: (id: number) => void;
  onMigrate: (v: AdminVideo) => void;
  isMigrating: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: video.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-white/5 bg-card overflow-hidden flex flex-col relative group">
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/50 text-white/50 hover:text-white hover:bg-black/70 cursor-grab active:cursor-grabbing transition-all opacity-0 group-hover:opacity-100"
          title="اسحب لتغيير الترتيب"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="aspect-video relative bg-black">
          {video.thumbnailUrl
            ? <img src={video.thumbnailUrl} className="w-full h-full object-cover opacity-80" alt={video.title} />
            : <div className="w-full h-full flex items-center justify-center text-foreground/20"><ImageIcon className="w-12 h-12" /></div>
          }
          {!video.isVisible && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center font-bold text-destructive backdrop-blur-sm">مخفي</div>
          )}
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/70 text-white text-xs font-bold border border-white/20">
              {video.sortOrder + 1}
            </span>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <div className="flex gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{video.categoryName}</Badge>
            {video.accessType === "vip" && <Badge variant="vip" className="text-xs">VIP</Badge>}
            {video.accessType === "visitor" && <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">مجاني</Badge>}
            {video.migratedAt && (
              <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-300">
                <Zap className="w-3 h-3 ml-0.5" /> تشغيل سريع
              </Badge>
            )}
          </div>
          <h3 className="font-bold line-clamp-1 mb-1">{video.title}</h3>
          <div className="mt-auto pt-4 flex gap-2 border-t border-white/5">
            <Button variant="secondary" className="flex-1 text-xs" onClick={() => onEdit(video)}>
              <Edit className="w-3 h-3 ml-1" /> تعديل
            </Button>
            {!video.migratedAt && (
              <Button
                variant="outline"
                size="icon"
                className="border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
                title="تفعيل التشغيل السريع"
                disabled={isMigrating}
                onClick={() => onMigrate(video)}
              >
                {isMigrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              </Button>
            )}
            <Button variant="destructive" size="icon" onClick={() => onDelete(video.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── Main Component ── */
export function AdminVideos() {
  const { getAdminAuthHeaders } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const courseIdStr = new URLSearchParams(search).get("courseId");
  const courseId = courseIdStr ? parseInt(courseIdStr) : null;

  const reqOpts = { request: getAdminAuthHeaders() };
  const { data: playlists } = useGetAdminPlaylists(reqOpts);
  const currentCourse = courseId ? playlists?.find(p => p.id === courseId) : null;

  /* ── جلب الفيديوهات مُصفَّاة حسب الدورة من الـ Backend ── */
  const authHeaders = getAdminAuthHeaders() as { headers?: Record<string, string> };
  const fetchHeaders = authHeaders.headers ?? {};

  const { data: videos, refetch } = useQuery({
    queryKey: ["/api/admin/videos", courseId],
    queryFn: async () => {
      const url = courseId
        ? `/api/admin/videos?playlistId=${courseId}`
        : `/api/admin/videos`;
      const res = await fetch(url, { headers: fetchHeaders });
      if (!res.ok) throw new Error("Failed to fetch videos");
      return res.json() as Promise<AdminVideo[]>;
    },
    enabled: courseId !== null,
  });

  /* ── جلب الأقسام مُصفَّاة حسب الدورة من الـ Backend ── */
  const { data: categories } = useQuery({
    queryKey: ["/api/admin/categories", courseId],
    queryFn: async () => {
      const url = courseId
        ? `/api/admin/categories?playlistId=${courseId}`
        : `/api/admin/categories`;
      const res = await fetch(url, { headers: fetchHeaders });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json() as Promise<{ id: number; name: string; isVisible: boolean }[]>;
    },
    enabled: courseId !== null,
  });

  const createMut = useCreateVideo({ request: getAdminAuthHeaders() });
  const updateMut = useUpdateVideo({ request: getAdminAuthHeaders() });
  const deleteMut = useDeleteVideo({ request: getAdminAuthHeaders() });
  const reorderMut = useReorderVideos({ request: getAdminAuthHeaders() });
  const migrateMut = useMigrateVideoStorage({ request: getAdminAuthHeaders() });
  const [migratingId, setMigratingId] = useState<number | null>(null);
  const [bulkMigrating, setBulkMigrating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{done: number; total: number} | null>(null);

  /* ── DnD state ── */
  const [orderedVideos, setOrderedVideos] = useState<AdminVideo[]>([]);
  const [hasOrderChanges, setHasOrderChanges] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");

  useEffect(() => {
    if (videos) {
      const scoped = categoryFilter === "all"
        ? videos
        : videos.filter(v => v.categoryId === categoryFilter);
      setOrderedVideos(scoped);
      setHasOrderChanges(false);
    }
  }, [videos, categoryFilter]);

  useEffect(() => {
    setCategoryFilter("all");
  }, [courseId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedVideos(prev => {
      const oldIndex = prev.findIndex(v => v.id === active.id);
      const newIndex = prev.findIndex(v => v.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setHasOrderChanges(true);
  };

  const handleSaveOrder = () => {
    const items = orderedVideos.map((v, index) => ({ id: v.id, sortOrder: index }));
    reorderMut.mutate(
      { data: { items } },
      {
        onSuccess: () => {
          toast({ title: "✅ تم حفظ الترتيب بنجاح", className: "bg-green-600 text-white border-none" });
          setHasOrderChanges(false);
          refetch();
        },
        onError: () => toast({ variant: "destructive", title: "حدث خطأ أثناء حفظ الترتيب" }),
      }
    );
  };

  const handleCancelOrder = () => {
    if (videos) {
      const scoped = categoryFilter === "all"
        ? videos
        : videos.filter(v => v.categoryId === categoryFilter);
      setOrderedVideos(scoped);
    }
    setHasOrderChanges(false);
  };

  /* ── Dialog state ── */
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [driveParts, setDriveParts] = useState<DrivePart[]>([]);
  const [driveUrlErrors, setDriveUrlErrors] = useState<Record<number | "single", string>>({});

  const defaultForm = (): CreateVideoInput => ({
    title: "", description: "", thumbnailUrl: "", driveEmbedUrl: "",
    categoryId: categories?.[0]?.id || 0,
    accessType: "normal", isVipOnly: false, isVisible: true,
    playlistId: courseId ?? null, partNumber: null, softwareLink: null
  });

  const [formData, setFormData] = useState<CreateVideoInput>(defaultForm());

  const normalizeThumbnailUrl = (url: string) => {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.pathname + parsed.search;
      }
    } catch { /* not absolute URL */ }
    return url;
  };

  const handleOpen = (video?: AdminVideo) => {
    if (video) {
      setEditingId(video.id);
      const thumbUrl = normalizeThumbnailUrl(video.thumbnailUrl || "");
      setFormData({
        title: video.title, description: video.description, thumbnailUrl: thumbUrl,
        driveEmbedUrl: video.driveEmbedUrl, categoryId: video.categoryId,
        accessType: (video.accessType as "visitor" | "normal" | "vip") || "normal",
        isVipOnly: video.isVipOnly, isVisible: video.isVisible,
        playlistId: courseId ?? video.playlistId ?? null,
        partNumber: video.partNumber ?? null,
        softwareLink: video.softwareLink ?? null,
      });
      setPreviewUrl(thumbUrl);
      try {
        const parsed = video.driveParts ? JSON.parse(video.driveParts) as DrivePart[] : [];
        setDriveParts(Array.isArray(parsed) ? parsed : []);
      } catch { setDriveParts([]); }
    } else {
      setEditingId(null);
      setFormData(defaultForm());
      setDriveParts([]);
      setPreviewUrl("");
    }
    setDriveUrlErrors({});
    setIsOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploading(true);
    try {
      const step1 = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!step1.ok) throw new Error("فشل طلب رابط الرفع");
      const { uploadURL, objectPath } = await step1.json() as { uploadURL: string; objectPath: string };
      const step2 = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!step2.ok) throw new Error("فشل رفع الصورة إلى التخزين");
      const serveUrl = `/api/storage${objectPath}`;
      setFormData(prev => ({ ...prev, thumbnailUrl: serveUrl }));
      setPreviewUrl(serveUrl);
      toast({ title: "تم رفع الصورة بنجاح" });
    } catch {
      toast({ variant: "destructive", title: "فشل رفع الصورة" });
      setPreviewUrl("");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeThumbnail = () => {
    setPreviewUrl("");
    setFormData(prev => ({ ...prev, thumbnailUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = () => {
    if (!formData.playlistId) {
      toast({ variant: "destructive", title: "يجب اختيار الدورة التابع لها الفيديو" });
      return;
    }
    if (!formData.categoryId) {
      toast({ variant: "destructive", title: "يجب اختيار القسم" });
      return;
    }
    const newErrors: Record<number | "single", string> = {};
    if (driveParts.length === 0) {
      const err = validateDriveUrl(formData.driveEmbedUrl);
      if (err) newErrors["single"] = err;
    } else {
      driveParts.forEach((p, i) => {
        const err = validateDriveUrl(p.url);
        if (err) newErrors[i] = err;
      });
    }
    if (Object.keys(newErrors).length > 0) {
      setDriveUrlErrors(newErrors);
      toast({ variant: "destructive", title: "رابط Google Drive غير صالح", description: Object.values(newErrors)[0] });
      return;
    }
    setDriveUrlErrors({});
    const drivePartsJson = driveParts.length > 0 ? JSON.stringify(driveParts) : null;
    const firstPartUrl = driveParts.length > 0 ? driveParts[0].url : formData.driveEmbedUrl;
    const finalForm = { ...formData, driveParts: drivePartsJson, driveEmbedUrl: firstPartUrl || formData.driveEmbedUrl };
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: finalForm })
      : createMut.mutateAsync({ data: finalForm });
    action.then(() => {
      toast({ title: "تم الحفظ بنجاح" });
      setIsOpen(false);
      refetch();
    }).catch(() => toast({ variant: "destructive", title: "حدث خطأ" }));
  };

  const handleDelete = (id: number) => {
    if (!confirm("حذف الفيديو؟")) return;
    deleteMut.mutate({ id }, { onSuccess: () => { toast({ title: "تم الحذف" }); refetch(); } });
  };

  const handleBulkMigrate = async () => {
    const unmigrated = (videos || []).filter(v => !v.migratedAt);
    if (unmigrated.length === 0) { toast({ title: "كل الفيديوهات مرحّلة بالفعل ✓" }); return; }
    if (!confirm(`ترحيل ${unmigrated.length} فيديو إلى التخزين السحابي؟\n\nسيتم النسخ تلقائياً واحداً تلو الآخر. لا تغلق الصفحة.`)) return;
    setBulkMigrating(true);
    setBulkProgress({ done: 0, total: unmigrated.length });
    let done = 0;
    for (const v of unmigrated) {
      try {
        await migrateMut.mutateAsync({ id: v.id });
        done++;
        setBulkProgress({ done, total: unmigrated.length });
      } catch { /* نتابع بقية الفيديوهات */ }
    }
    setBulkMigrating(false);
    setBulkProgress(null);
    toast({ title: `⚡ تم ترحيل ${done}/${unmigrated.length} فيديو بنجاح`, className: "bg-green-600 text-white border-none" });
    refetch();
  };

  const handleMigrate = (video: AdminVideo) => {
    if (!confirm(`تفعيل التشغيل السريع لـ "${video.title}"؟\n\nسيتم نسخ الفيديو إلى التخزين السحابي.`)) return;
    setMigratingId(video.id);
    migrateMut.mutate(
      { id: video.id },
      {
        onSuccess: (data) => {
          const mb = Math.round(data.totalBytes / (1024 * 1024));
          toast({ title: `⚡ تم تفعيل التشغيل السريع (${data.parts} ${data.parts === 1 ? "ملف" : "ملفات"} — ${mb} MB)`, className: "bg-green-600 text-white border-none" });
          refetch();
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "";
          toast({ variant: "destructive", title: "فشل النقل إلى التخزين السحابي", description: msg || "حاول مرة أخرى" });
        },
        onSettled: () => setMigratingId(null),
      }
    );
  };

  /* ── إذا لم يُختر courseId → شاشة اختيار الدورة ── */
  if (!courseId) {
    return <CoursePickerScreen playlists={(playlists ?? []) as { id: number; title: string; description?: string | null; imageUrl?: string | null; videos?: unknown[] }[]} />;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/gab-ctrl-9x/videos" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <Video className="w-3.5 h-3.5" />
          الفيديوهات
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium flex items-center gap-1">
          <GraduationCap className="w-3.5 h-3.5 text-primary" />
          {currentCourse?.title ?? `دورة #${courseId}`}
        </span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{currentCourse?.title ?? `دورة #${courseId}`}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {videos?.length ?? 0} فيديو — اسحب الكروت لتغيير ترتيب الظهور
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            onClick={handleBulkMigrate}
            disabled={bulkMigrating}
          >
            {bulkMigrating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "..."}</>
              : <><Zap className="w-4 h-4" /> ترحيل الكل</>
            }
          </Button>
          <Button onClick={() => handleOpen()}>
            <Plus className="w-4 h-4 ml-2" /> إضافة فيديو للدورة
          </Button>
        </div>
      </div>

      {/* فلتر الأقسام */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground/70">تصفية حسب القسم:</span>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">كل الأقسام</option>
          {categories?.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.isVisible ? "" : " (مخفي)"}</option>
          ))}
        </select>
        {categoryFilter !== "all" && (
          <span className="text-xs text-muted-foreground">اسحب لترتيب دروس هذا القسم — {orderedVideos.length} درس</span>
        )}
        {(categories ?? []).length === 0 && (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            لا توجد أقسام لهذه الدورة —
            <Link href={`/gab-ctrl-9x/categories?courseId=${courseId}`} className="underline hover:text-amber-300">
              أضف قسماً الآن
            </Link>
          </span>
        )}
      </div>

      {/* Save order bar */}
      {hasOrderChanges && (
        <div className="flex items-center justify-between gap-4 bg-primary/10 border border-primary/30 rounded-xl px-5 py-3">
          <p className="text-sm font-medium text-primary">
            🔀 تم تغيير الترتيب — احفظ التغييرات لتطبيقها على الموقع
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelOrder} disabled={reorderMut.isPending}>إلغاء</Button>
            <Button size="sm" onClick={handleSaveOrder} disabled={reorderMut.isPending} className="gap-2">
              {reorderMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الترتيب
            </Button>
          </div>
        </div>
      )}

      {/* DnD Grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedVideos.map(v => v.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {orderedVideos.map(v => (
              <SortableVideoCard
                key={v.id}
                video={v}
                onEdit={handleOpen}
                onDelete={handleDelete}
                onMigrate={handleMigrate}
                isMigrating={migratingId === v.id}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {orderedVideos.length === 0 && videos !== undefined && (
        <div className="text-center py-16 text-muted-foreground">
          <Video className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>لا توجد فيديوهات في هذه الدورة بعد</p>
          <Button className="mt-4" onClick={() => handleOpen()}>
            <Plus className="w-4 h-4 ml-2" /> أضف أول فيديو
          </Button>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل الفيديو" : "إضافة فيديو جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">

            {/* الدورة التابعة — مقيَّدة بالدورة الحالية */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/20">
              <GraduationCap className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-muted-foreground block leading-none mb-0.5">الدورة التابعة لها</span>
                <span className="text-sm font-semibold">{currentCourse?.title ?? `دورة #${courseId}`}</span>
              </div>
              <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">ثابت</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>العنوان</Label>
                <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>الوصف</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* Thumbnail */}
              <div className="space-y-3 col-span-2">
                <Label>صورة الغلاف (Thumbnail)</Label>
                <div className="flex gap-2">
                  <Input
                    dir="ltr" className="text-left text-sm"
                    placeholder="الصق رابط صورة مباشر (https://...) أو ارفع ملف أدناه"
                    value={formData.thumbnailUrl || ""}
                    onChange={e => {
                      const v = e.target.value;
                      setFormData(prev => ({ ...prev, thumbnailUrl: v }));
                      setPreviewUrl(v);
                    }}
                  />
                  {formData.thumbnailUrl && (
                    <button
                      onClick={removeThumbnail}
                      className="shrink-0 w-9 h-9 rounded-md bg-white/5 border border-white/10 text-foreground/50 hover:text-destructive hover:border-destructive/40 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {previewUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
                    <img
                      src={previewUrl} alt="preview"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {uploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl p-4 text-foreground/40 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50 text-sm"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? "جاري الرفع..." : "أو ارفع صورة من جهازك (PNG, JPG, WEBP — 5MB)"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>

              {/* Drive parts / URL */}
              <div className="space-y-2 col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    {driveParts.length > 0 ? `روابط الأجزاء (${driveParts.length} جزء)` : "رابط تضمين جوجل درايف (Embed URL)"}
                  </Label>
                  {driveParts.length === 0 ? (
                    <button type="button"
                      onClick={() => setDriveParts([{ label: "الجزء 1", url: formData.driveEmbedUrl }])}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> إضافة أجزاء متعددة
                    </button>
                  ) : (
                    <button type="button"
                      onClick={() => { setFormData(p => ({ ...p, driveEmbedUrl: driveParts[0]?.url || "" })); setDriveParts([]); }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> رجوع لرابط واحد
                    </button>
                  )}
                </div>
                {driveParts.length === 0 ? (
                  <div className="space-y-1">
                    <Input dir="ltr" className={`text-left ${driveUrlErrors["single"] ? "border-red-500/70" : ""}`} placeholder="https://drive.google.com/file/d/..."
                      value={formData.driveEmbedUrl}
                      onChange={e => { setFormData({ ...formData, driveEmbedUrl: e.target.value }); setDriveUrlErrors({}); }}
                    />
                    {driveUrlErrors["single"] && (
                      <p className="text-xs text-red-400 leading-snug">{driveUrlErrors["single"]}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
                    {driveParts.map((part, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex gap-2 items-center">
                          <Input dir="rtl" className="w-28 shrink-0 text-sm" placeholder={`الجزء ${i + 1}`}
                            value={part.label}
                            onChange={e => setDriveParts(ps => ps.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                          />
                          <Input dir="ltr" className={`flex-1 text-left text-sm ${driveUrlErrors[i] ? "border-red-500/70" : ""}`} placeholder="https://drive.google.com/file/d/..."
                            value={part.url}
                            onChange={e => { setDriveParts(ps => ps.map((p, j) => j === i ? { ...p, url: e.target.value } : p)); setDriveUrlErrors(prev => { const n = { ...prev }; delete n[i]; return n; }); }}
                          />
                          <button type="button"
                            onClick={() => setDriveParts(ps => ps.filter((_, j) => j !== i))}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {driveUrlErrors[i] && (
                          <p className="text-xs text-red-400 leading-snug px-1">{driveUrlErrors[i]}</p>
                        )}
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setDriveParts(ps => [...ps, { label: `الجزء ${ps.length + 1}`, url: "" }])}
                      className="w-full text-sm text-primary hover:text-primary/80 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-primary/30 hover:border-primary/60 transition-colors mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> إضافة جزء جديد
                    </button>
                  </div>
                )}
              </div>

              {/* VIP software link */}
              <div className="space-y-2 col-span-2">
                <Label className="flex items-center gap-1.5">
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-semibold">VIP</span>
                  رابط تحميل البرنامج (للـ VIP فقط)
                </Label>
                <Input dir="ltr" className="text-left" placeholder="https://..."
                  value={formData.softwareLink ?? ""}
                  onChange={e => setFormData({ ...formData, softwareLink: e.target.value || null })}
                />
              </div>

              {/* القسم — مصفَّى لأقسام هذه الدورة فقط */}
              <div className="space-y-2 col-span-2">
                <Label>القسم التابع له <span className="text-destructive">*</span></Label>
                {(categories ?? []).length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-sm text-amber-400">
                    <span>لا توجد أقسام لهذه الدورة —</span>
                    <Link href={`/gab-ctrl-9x/categories?courseId=${courseId}`} className="underline hover:text-amber-300">
                      أضف قسماً الآن
                    </Link>
                  </div>
                ) : (
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={formData.categoryId || ""}
                    onChange={e => setFormData({ ...formData, categoryId: parseInt(e.target.value) })}
                  >
                    <option value="" disabled>اختر قسماً</option>
                    {categories?.map(c => <option key={c.id} value={c.id}>{c.name}{c.isVisible ? "" : " (مخفي)"}</option>)}
                  </select>
                )}
              </div>

              {/* رقم الجزء */}
              <div className="space-y-2">
                <Label>رقم الجزء</Label>
                <Input
                  type="number" min={1} placeholder="1"
                  className="h-10 text-center"
                  value={formData.partNumber ?? ""}
                  onChange={e => setFormData({ ...formData, partNumber: e.target.value ? parseInt(e.target.value) : null })}
                />
              </div>

              {/* Access type + visibility */}
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>مستوى الوصول</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={formData.accessType || "normal"}
                    onChange={e => {
                      const at = e.target.value as "visitor" | "normal" | "vip";
                      setFormData({ ...formData, accessType: at, isVipOnly: at === "vip" });
                    }}
                  >
                    <option value="visitor">زائر (مجاني للجميع)</option>
                    <option value="normal">عادي (مشتركون فقط)</option>
                    <option value="vip">VIP (حسابات VIP فقط)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isVisible}
                    onChange={e => setFormData({ ...formData, isVisible: e.target.checked })}
                    className="rounded bg-black border-white/20 text-primary w-4 h-4" />
                  <span className="text-sm">مرئي للطلاب</span>
                </label>
              </div>
            </div>

            <Button className="w-full mt-4" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending || uploading}>
              {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
