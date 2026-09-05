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
import { compressImageForUpload } from "@/lib/imageCompress";
import { Card, Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Upload, ImageIcon, X, Loader2, Layers, GripVertical, Save, Zap, GraduationCap, ArrowRight, Video, CloudUpload, CheckCircle2, AlertCircle, RotateCcw, HardDrive } from "lucide-react";

interface DrivePart { label: string; url: string; }
type VideoSource = "drive" | "r2";
type R2UploadState = {
  status: "idle" | "uploading" | "completed" | "failed";
  file: File | null;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  progress: number;
  receipt: string | null;
  commitReceipt: string | null;
  objectKey: string | null;
  error: string | null;
};

const EMPTY_R2_UPLOAD: R2UploadState = {
  status: "idle",
  file: null,
  fileName: "",
  fileSize: 0,
  uploadedBytes: 0,
  progress: 0,
  receipt: null,
  commitReceipt: null,
  objectKey: null,
  error: null,
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power >= 3 ? 2 : 1)} ${units[power]}`;
}

function validateDriveUrl(url: string): string | null {
  if (!url || !url.trim()) return null;
  if (!url.includes("drive.google.com") && !url.includes("docs.google.com")) {
    return "Le lien doit être un lien Google Drive valide";
  }
  if (/\/folders\/[a-zA-Z0-9_-]{10,}/.test(url)) {
    return "C'est un lien de dossier, pas un fichier vidéo. Ouvrez le dossier, choisissez la vidéo et copiez son lien direct (file/d/...)";
  }
  const hasId =
    /\/d\/[a-zA-Z0-9_-]{10,}/.test(url) ||
    /[?&]id=[a-zA-Z0-9_-]{10,}/.test(url);
  if (!hasId) return "Format de lien Google Drive non reconnu";
  return null;
}

/* ── Course picker (when /videos without courseId) ── */
function CoursePickerScreen({ playlists }: { playlists: { id: number; title: string; description?: string | null; imageUrl?: string | null; videos?: unknown[] }[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Video className="w-7 h-7 text-primary" />
          Gestion des vidéos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Choisissez un cours pour gérer ses vidéos</p>
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
                <span>{pl.videos?.length ?? 0} leçon(s)</span>
              </div>
              <Link href={`/bendehinaonline97/videos?courseId=${pl.id}`}>
                <Button className="w-full gap-2">
                  <Video className="w-4 h-4" />
                  Gérer les vidéos du cours
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
              <p className="text-muted-foreground text-sm">Aucun cours. Créez d'abord un cours depuis la gestion des cours.</p>
              <Link href="/bendehinaonline97/courses">
                <Button variant="outline" className="mt-4">Aller à la gestion des cours</Button>
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
          title="Glisser pour réordonner"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="aspect-video relative bg-black">
          {video.thumbnailUrl
            ? <img src={video.thumbnailUrl} className="w-full h-full object-cover opacity-80" alt={video.title} />
            : <div className="w-full h-full flex items-center justify-center text-foreground/20"><ImageIcon className="w-12 h-12" /></div>
          }
          {!video.isVisible && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center font-bold text-destructive backdrop-blur-sm">Masqué</div>
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
            {video.accessType === "visitor" && <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">Gratuit</Badge>}
            {video.migratedAt && (
              <Badge variant="outline" className="text-xs border-blue-400/40 text-blue-400">
                <Zap className="w-3 h-3 mr-0.5" /> Rapide
              </Badge>
            )}
            {video.storageProvider === "r2" && (
              <Badge variant="outline" className="text-xs border-green-500/40 text-green-500">
                <CloudUpload className="w-3 h-3 mr-0.5" /> R2 direct
              </Badge>
            )}
          </div>
          <h3 className="font-bold line-clamp-1 mb-1">{video.title}</h3>
          <div className="mt-auto pt-4 flex gap-2 border-t border-white/5">
            <Button variant="secondary" className="flex-1 text-xs" onClick={() => onEdit(video)}>
              <Edit className="w-3 h-3 mr-1" /> Modifier
            </Button>
            {!video.migratedAt && video.storageProvider !== "r2" && (
              <Button
                variant="outline"
                size="icon"
                className="border-blue-400/40 text-blue-400 hover:bg-blue-400/10"
                title="Activer la lecture rapide"
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
          toast({ title: "✅ Ordre sauvegardé", className: "bg-green-600 text-white border-none" });
          setHasOrderChanges(false);
          refetch();
        },
        onError: () => toast({ variant: "destructive", title: "Erreur lors de la sauvegarde de l'ordre" }),
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

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [driveParts, setDriveParts] = useState<DrivePart[]>([]);
  const [driveUrlErrors, setDriveUrlErrors] = useState<Partial<Record<number | "single", string>>>({});
  const [videoSource, setVideoSource] = useState<VideoSource>("drive");
  const [r2Upload, setR2Upload] = useState<R2UploadState>(EMPTY_R2_UPLOAD);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadXhrs = useRef<Set<XMLHttpRequest>>(new Set());

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
      const source: VideoSource = video.storageProvider === "r2" ? "r2" : "drive";
      setVideoSource(source);
      setR2Upload(source === "r2" && video.r2ObjectKey
        ? {
            ...EMPTY_R2_UPLOAD,
            status: "completed",
            fileName: video.r2ObjectKey.split("/").pop() || "Vidéo R2",
            objectKey: video.r2ObjectKey,
            commitReceipt: null,
            progress: 100,
          }
        : EMPTY_R2_UPLOAD);
    } else {
      setEditingId(null);
      setFormData(defaultForm());
      setDriveParts([]);
      setPreviewUrl("");
      setVideoSource("drive");
      setR2Upload(EMPTY_R2_UPLOAD);
    }
    setDriveUrlErrors({});
    setIsOpen(true);
  };

  const adminJsonRequest = async <T,>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...(getAdminAuthHeaders()?.headers ?? {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(detail.message || detail.error || `HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  };

  const uploadPartDirectly = (
    url: string,
    blob: Blob,
    onProgress: (loaded: number) => void,
  ): Promise<string> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeUploadXhrs.current.add(xhr);
    xhr.open("PUT", url);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onerror = () => reject(new Error("Connexion interrompue pendant l'upload"));
    xhr.onabort = () => reject(new Error("Upload annulé"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`R2 a refusé une partie (HTTP ${xhr.status})`));
        return;
      }
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        reject(new Error("R2 n'a pas retourné l'ETag requis"));
        return;
      }
      resolve(etag);
    };
    xhr.onloadend = () => activeUploadXhrs.current.delete(xhr);
    xhr.send(blob);
  });

  const uploadVideoToR2 = async (file: File) => {
    if (!courseId) return;
    if (!/\.(mp4|mov)$/i.test(file.name)) {
      toast({ variant: "destructive", title: "Format non pris en charge", description: "Choisissez un fichier MP4 ou MOV." });
      return;
    }
    let receipt: string | null = null;
    if (r2Upload.commitReceipt) {
      void adminJsonRequest("/api/admin/r2/uploads/discard", {
        commitReceipt: r2Upload.commitReceipt,
      }).catch(() => undefined);
    }
    setVideoSource("r2");
    setR2Upload({
      status: "uploading",
      file,
      fileName: file.name,
      fileSize: file.size,
      uploadedBytes: 0,
      progress: 0,
      receipt: null,
      commitReceipt: null,
      objectKey: null,
      error: null,
    });
    try {
      const initiated = await adminJsonRequest<{
        receipt: string;
        objectKey: string;
        partSize: number;
        totalParts: number;
      }>("/api/admin/r2/uploads/initiate", {
        courseId,
        videoId: editingId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "application/octet-stream",
      });
      receipt = initiated.receipt;
      setR2Upload(prev => ({ ...prev, receipt, objectKey: initiated.objectKey }));

      const partProgress = new Array<number>(initiated.totalParts).fill(0);
      const completedParts: { partNumber: number; etag: string }[] = new Array(initiated.totalParts);
      let nextPartIndex = 0;
      const updateProgress = (partIndex: number, loaded: number) => {
        partProgress[partIndex] = loaded;
        const uploadedBytes = partProgress.reduce((sum, value) => sum + value, 0);
        setR2Upload(prev => ({
          ...prev,
          uploadedBytes,
          progress: Math.min(99, Math.round((uploadedBytes / file.size) * 100)),
        }));
      };
      const worker = async () => {
        while (true) {
          const partIndex = nextPartIndex++;
          if (partIndex >= initiated.totalParts) return;
          const partNumber = partIndex + 1;
          const start = partIndex * initiated.partSize;
          const end = Math.min(file.size, start + initiated.partSize);
          const signed = await adminJsonRequest<{ url: string }>("/api/admin/r2/uploads/part", {
            receipt: initiated.receipt,
            partNumber,
          });
          const blob = file.slice(start, end, file.type || "application/octet-stream");
          const etag = await uploadPartDirectly(signed.url, blob, loaded => updateProgress(partIndex, loaded));
          updateProgress(partIndex, end - start);
          completedParts[partIndex] = { partNumber, etag };
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, initiated.totalParts) }, () => worker()));
      const completed = await adminJsonRequest<{
        objectKey: string;
        fileSize: number;
        contentType: string;
        commitReceipt: string;
      }>("/api/admin/r2/uploads/complete", {
        receipt: initiated.receipt,
        parts: completedParts,
      });
      setR2Upload(prev => ({
        ...prev,
        status: "completed",
        uploadedBytes: completed.fileSize,
        progress: 100,
        receipt: null,
        commitReceipt: completed.commitReceipt,
        objectKey: completed.objectKey,
        error: null,
      }));
      toast({ title: "Vidéo envoyée vers R2", description: `${file.name} — ${formatBytes(file.size)}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (receipt) {
        void adminJsonRequest("/api/admin/r2/uploads/abort", { receipt }).catch(() => undefined);
      }
      setR2Upload(prev => ({ ...prev, status: "failed", receipt: null, error: message }));
      toast({ variant: "destructive", title: "Échec de l'upload vidéo", description: message });
    } finally {
      activeUploadXhrs.current.clear();
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  };

  const cancelR2Upload = () => {
    activeUploadXhrs.current.forEach(xhr => xhr.abort());
    if (r2Upload.receipt) {
      void adminJsonRequest("/api/admin/r2/uploads/abort", { receipt: r2Upload.receipt }).catch(() => undefined);
    }
    setR2Upload(prev => ({ ...prev, status: "failed", receipt: null, error: "Upload annulé" }));
  };

  const discardCompletedR2Upload = () => {
    if (!r2Upload.commitReceipt) return;
    void adminJsonRequest("/api/admin/r2/uploads/discard", {
      commitReceipt: r2Upload.commitReceipt,
    }).catch(() => undefined);
  };

  const selectDriveSource = () => {
    if (r2Upload.status === "uploading") return;
    discardCompletedR2Upload();
    setR2Upload(EMPTY_R2_UPLOAD);
    setVideoSource("drive");
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (r2Upload.status === "uploading") cancelR2Upload();
      else discardCompletedR2Upload();
    }
    setIsOpen(open);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    if (!original) return;
    const localPreview = URL.createObjectURL(original);
    setPreviewUrl(localPreview);
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
      const serveUrl = `/api/storage${objectPath}`;
      setFormData(prev => ({ ...prev, thumbnailUrl: serveUrl }));
      setPreviewUrl(serveUrl);
      toast({ title: "Image téléversée avec succès" });
    } catch (err) {
      console.error("[upload] video thumbnail failed:", err);
      toast({ variant: "destructive", title: "Échec de l'upload", description: err instanceof Error ? err.message : String(err) });
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
      toast({ variant: "destructive", title: "Veuillez choisir la formation liée à la vidéo" });
      return;
    }
    if (!formData.categoryId) {
      toast({ variant: "destructive", title: "Veuillez choisir une catégorie" });
      return;
    }
    if (videoSource === "r2") {
      if (r2Upload.status !== "completed" || !r2Upload.objectKey) {
        toast({ variant: "destructive", title: "Upload vidéo incomplet", description: "Attendez la fin de l'upload R2 avant d'enregistrer." });
        return;
      }
    } else {
      const newErrors: Partial<Record<number | "single", string>> = {};
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
        toast({ variant: "destructive", title: "Lien Google Drive invalide", description: Object.values(newErrors)[0] });
        return;
      }
    }
    setDriveUrlErrors({});
    const drivePartsJson = driveParts.length > 0 ? JSON.stringify(driveParts) : null;
    const firstPartUrl = driveParts.length > 0 ? driveParts[0].url : formData.driveEmbedUrl;
    const finalForm = {
      ...formData,
      driveParts: drivePartsJson,
      driveEmbedUrl: firstPartUrl || formData.driveEmbedUrl,
      storageProvider: videoSource,
      r2ObjectKey: videoSource === "r2" ? r2Upload.objectKey : null,
      r2UploadReceipt: videoSource === "r2" ? r2Upload.commitReceipt : null,
    };
    const action = editingId
      ? updateMut.mutateAsync({ id: editingId, data: finalForm })
      : createMut.mutateAsync({ data: finalForm });
    action.then(() => {
      toast({ title: "Sauvegardé avec succès" });
      setR2Upload(prev => ({ ...prev, commitReceipt: null }));
      setIsOpen(false);
      refetch();
    }).catch(() => toast({ variant: "destructive", title: "Une erreur est survenue" }));
  };

  const handleDelete = (id: number) => {
    if (!confirm("Supprimer cette vidéo ?")) return;
    deleteMut.mutate({ id }, { onSuccess: () => { toast({ title: "Supprimé" }); refetch(); } });
  };

  const handleBulkMigrate = async () => {
    const unmigrated = (videos || []).filter(v => !v.migratedAt && v.storageProvider !== "r2");
    if (unmigrated.length === 0) { toast({ title: "Toutes les vidéos sont déjà migrées ✓" }); return; }
    if (!confirm(`Migrer ${unmigrated.length} vidéo(s) vers le stockage cloud ?\n\nLes copies seront faites une par une. Ne fermez pas la page.`)) return;
    setBulkMigrating(true);
    setBulkProgress({ done: 0, total: unmigrated.length });
    let done = 0;
    for (const v of unmigrated) {
      try {
        await migrateMut.mutateAsync({ id: v.id });
        done++;
        setBulkProgress({ done, total: unmigrated.length });
      } catch { /* continue */ }
    }
    setBulkMigrating(false);
    setBulkProgress(null);
    toast({ title: `⚡ ${done}/${unmigrated.length} vidéo(s) migrées avec succès`, className: "bg-green-600 text-white border-none" });
    refetch();
  };

  const handleMigrate = (video: AdminVideo) => {
    if (!confirm(`Activer la lecture rapide pour "${video.title}" ?\n\nLa vidéo sera copiée vers le stockage cloud.`)) return;
    setMigratingId(video.id);
    migrateMut.mutate(
      { id: video.id },
      {
        onSuccess: (data) => {
          const mb = Math.round(data.totalBytes / (1024 * 1024));
          toast({ title: `⚡ Lecture rapide activée (${data.parts} fichier(s) — ${mb} MB)`, className: "bg-green-600 text-white border-none" });
          refetch();
        },
        onError: (err: unknown) => {
          type MigrateErrData = {
            message?: string;
            isRateLimit?: boolean;
            driveStatus?: number | null;
            failedPart?: number;
            totalParts?: number;
          };
          const data = (err as { data?: MigrateErrData } | null)?.data;
          const serverMsg: string =
            data?.message ?? (err instanceof Error ? err.message : "") ?? "Erreur inconnue";
          const isRateLimit = data?.isRateLimit === true;
          const driveStatus = data?.driveStatus ?? null;
          const failedPart = data?.failedPart;
          const totalParts = data?.totalParts;

          const isAccessDenied = driveStatus === 403 && !isRateLimit;
          const isNotFound = driveStatus === 404;
          const isBadUrl = driveStatus === 400;

          const partInfo = failedPart && totalParts
            ? `(Partie ${failedPart} sur ${totalParts})`
            : "";

          const title = isRateLimit
            ? `⏱ Limite de requêtes Google Drive dépassée ${partInfo}`
            : isAccessDenied
              ? `🔒 Drive a refusé l'accès ${partInfo}`
              : isNotFound
                ? `❌ Fichier Drive introuvable ${partInfo}`
                : isBadUrl
                  ? `⚠️ Lien Drive invalide ${partInfo}`
                  : `❌ Échec de la migration ${partInfo}`;

          toast({
            variant: "destructive",
            title,
            description: serverMsg.split("\n")[0].slice(0, 200),
            duration: isRateLimit ? 12_000 : 10_000,
          });

          console.error("[migrate] error detail:", {
            driveStatus,
            isRateLimit,
            failedPart,
            totalParts,
            message: serverMsg,
          });
        },
        onSettled: () => setMigratingId(null),
      }
    );
  };

  if (!courseId) {
    return <CoursePickerScreen playlists={(playlists ?? []) as { id: number; title: string; description?: string | null; imageUrl?: string | null; videos?: unknown[] }[]} />;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/bendehinaonline97/videos" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <Video className="w-3.5 h-3.5" />
          Vidéos
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium flex items-center gap-1">
          <GraduationCap className="w-3.5 h-3.5 text-primary" />
          {currentCourse?.title ?? `Cours #${courseId}`}
        </span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{currentCourse?.title ?? `Cours #${courseId}`}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {videos?.length ?? 0} vidéo(s) — Glissez les cartes pour changer l'ordre d'affichage
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
            onClick={handleBulkMigrate}
            disabled={bulkMigrating}
          >
            {bulkMigrating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "..."}</>
              : <><Zap className="w-4 h-4" /> Tout migrer</>
            }
          </Button>
          <Button onClick={() => handleOpen()}>
            <Plus className="w-4 h-4 mr-2" /> Ajouter une vidéo
          </Button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground/70">Filtrer par catégorie :</span>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">Toutes les catégories</option>
          {categories?.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.isVisible ? "" : " (masqué)"}</option>
          ))}
        </select>
        {categoryFilter !== "all" && (
          <span className="text-xs text-muted-foreground">Glissez pour ordonner les leçons — {orderedVideos.length} leçon(s)</span>
        )}
        {(categories ?? []).length === 0 && (
          <span className="text-xs text-blue-500 flex items-center gap-1">
            Aucune catégorie pour ce cours —
            <Link href={`/bendehinaonline97/categories?courseId=${courseId}`} className="underline hover:text-blue-400">
              Ajouter une catégorie
            </Link>
          </span>
        )}
      </div>

      {/* Save order bar */}
      {hasOrderChanges && (
        <div className="flex items-center justify-between gap-4 bg-primary/10 border border-primary/30 rounded-xl px-5 py-3">
          <p className="text-sm font-medium text-primary">
            🔀 Ordre modifié — sauvegardez pour l'appliquer sur le site
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelOrder} disabled={reorderMut.isPending}>Annuler</Button>
            <Button size="sm" onClick={handleSaveOrder} disabled={reorderMut.isPending} className="gap-2">
              {reorderMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Sauvegarder l'ordre
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
          <p>Aucune vidéo dans ce cours</p>
          <Button className="mt-4" onClick={() => handleOpen()}>
            <Plus className="w-4 h-4 mr-2" /> Ajouter la première vidéo
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la vidéo" : "Ajouter une nouvelle vidéo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">

            {/* Linked course — locked to current */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/20">
              <GraduationCap className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-muted-foreground block leading-none mb-0.5">Formation liée</span>
                <span className="text-sm font-semibold">{currentCourse?.title ?? `Cours #${courseId}`}</span>
              </div>
              <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">Fixé</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Titre</Label>
                <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Description</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* Thumbnail */}
              <div className="space-y-3 col-span-2">
                <Label>Image de couverture (Thumbnail)</Label>
                <div className="flex gap-2">
                  <Input
                    dir="ltr" className="text-left text-sm"
                    placeholder="Coller un lien direct (https://...) ou uploader ci-dessous"
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
                      src={previewUrl} alt="aperçu"
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
                  {uploading ? "Téléversement..." : "Ou uploader depuis votre appareil (PNG, JPG, WEBP — 5 Mo)"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>

              {/* Video source */}
              <div className="space-y-2 col-span-2">
                <Label>Source de la vidéo</Label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1.5">
                  <button
                    type="button"
                    onClick={selectDriveSource}
                    disabled={r2Upload.status === "uploading"}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      videoSource === "drive"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    } disabled:opacity-50`}
                  >
                    <HardDrive className="h-4 w-4" />
                    Google Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoSource("r2")}
                    disabled={r2Upload.status === "uploading"}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      videoSource === "r2"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    } disabled:opacity-50`}
                  >
                    <CloudUpload className="h-4 w-4" />
                    Upload direct R2
                  </button>
                </div>
              </div>

              {videoSource === "r2" ? (
                <div className="space-y-3 col-span-2 rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div>
                    <Label className="flex items-center gap-2">
                      <CloudUpload className="h-4 w-4 text-primary" />
                      Fichier vidéo privé
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      MP4 ou MOV — upload multipart direct vers R2, sans passage par le serveur.
                    </p>
                  </div>

                  {r2Upload.status === "idle" && (
                    <button
                      type="button"
                      onClick={() => videoFileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                    >
                      <CloudUpload className="h-8 w-8" />
                      <span className="font-medium">Sélectionner une vidéo depuis l'ordinateur</span>
                      <span className="text-xs">100 MB, 500 MB, 1 GB, 2 GB, 5 GB et plus</span>
                    </button>
                  )}

                  {r2Upload.status !== "idle" && (
                    <div className="space-y-3 rounded-xl border border-border bg-background/70 p-4">
                      <div className="flex items-start gap-3">
                        {r2Upload.status === "uploading" && <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />}
                        {r2Upload.status === "completed" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />}
                        {r2Upload.status === "failed" && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{r2Upload.fileName || "Vidéo R2 existante"}</p>
                          <p className="text-xs text-muted-foreground">
                            {r2Upload.fileSize > 0 ? formatBytes(r2Upload.fileSize) : "Fichier déjà stocké dans R2"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            r2Upload.status === "completed"
                              ? "border-green-500/40 text-green-500"
                              : r2Upload.status === "failed"
                                ? "border-destructive/40 text-destructive"
                                : "border-primary/40 text-primary"
                          }
                        >
                          {r2Upload.status === "uploading" ? "Upload..." : r2Upload.status === "completed" ? "Terminé" : "Échec"}
                        </Badge>
                      </div>

                      {r2Upload.status === "uploading" && (
                        <>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-200"
                              style={{ width: `${r2Upload.progress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatBytes(r2Upload.uploadedBytes)} / {formatBytes(r2Upload.fileSize)}</span>
                            <span className="font-semibold text-primary">{r2Upload.progress}%</span>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={cancelR2Upload} className="w-full">
                            Annuler l'upload
                          </Button>
                        </>
                      )}

                      {r2Upload.status === "completed" && (
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => videoFileInputRef.current?.click()} className="flex-1">
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            Remplacer le fichier
                          </Button>
                        </div>
                      )}

                      {r2Upload.status === "failed" && (
                        <>
                          <p className="text-xs text-destructive">{r2Upload.error}</p>
                          <div className="flex gap-2">
                            {r2Upload.file && (
                              <Button type="button" variant="outline" size="sm" onClick={() => void uploadVideoToR2(r2Upload.file!)} className="flex-1">
                                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                Réessayer
                              </Button>
                            )}
                            <Button type="button" variant="outline" size="sm" onClick={() => videoFileInputRef.current?.click()} className="flex-1">
                              Choisir un autre fichier
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept=".mp4,.mov,video/mp4,video/quicktime"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) void uploadVideoToR2(file);
                    }}
                  />
                </div>
              ) : (
              /* Drive parts / URL */
              <div className="space-y-2 col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    {driveParts.length > 0 ? `Liens des parties (${driveParts.length} partie(s))` : "Lien d'intégration Google Drive (Embed URL)"}
                  </Label>
                  {driveParts.length === 0 ? (
                    <button type="button"
                      onClick={() => setDriveParts([{ label: "Partie 1", url: formData.driveEmbedUrl }])}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Ajouter des parties multiples
                    </button>
                  ) : (
                    <button type="button"
                      onClick={() => { setFormData(p => ({ ...p, driveEmbedUrl: driveParts[0]?.url || "" })); setDriveParts([]); }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Retour à un lien unique
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
                          <Input dir="ltr" className="w-28 shrink-0 text-sm" placeholder={`Partie ${i + 1}`}
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
                      onClick={() => setDriveParts(ps => [...ps, { label: `Partie ${ps.length + 1}`, url: "" }])}
                      className="w-full text-sm text-primary hover:text-primary/80 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-primary/30 hover:border-primary/60 transition-colors mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Ajouter une partie
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* VIP software link */}
              <div className="space-y-2 col-span-2">
                <Label className="flex items-center gap-1.5">
                  <span className="text-xs bg-indigo-500/15 text-indigo-500 px-1.5 py-0.5 rounded font-semibold">VIP</span>
                  Lien de téléchargement du logiciel (VIP uniquement)
                </Label>
                <Input dir="ltr" className="text-left" placeholder="https://..."
                  value={formData.softwareLink ?? ""}
                  onChange={e => setFormData({ ...formData, softwareLink: e.target.value || null })}
                />
              </div>

              {/* Category — filtered to this course */}
              <div className="space-y-2 col-span-2">
                <Label>Catégorie liée <span className="text-destructive">*</span></Label>
                {(categories ?? []).length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-600">
                    <span>Aucune catégorie pour ce cours —</span>
                    <Link href={`/bendehinaonline97/categories?courseId=${courseId}`} className="underline hover:text-blue-500">
                      Ajouter une catégorie
                    </Link>
                  </div>
                ) : (
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={formData.categoryId || ""}
                    onChange={e => setFormData({ ...formData, categoryId: parseInt(e.target.value) })}
                  >
                    <option value="" disabled>Choisir une catégorie</option>
                    {categories?.map(c => <option key={c.id} value={c.id}>{c.name}{c.isVisible ? "" : " (masqué)"}</option>)}
                  </select>
                )}
              </div>

              {/* Part number */}
              <div className="space-y-2">
                <Label>Numéro de partie</Label>
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
                  <Label>Niveau d'accès</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
                    value={formData.accessType || "normal"}
                    onChange={e => {
                      const at = e.target.value as "visitor" | "normal" | "vip";
                      setFormData({ ...formData, accessType: at, isVipOnly: at === "vip" });
                    }}
                  >
                    <option value="visitor">Visiteur (gratuit pour tous)</option>
                    <option value="normal">Standard (abonnés seulement)</option>
                    <option value="vip">VIP (comptes VIP uniquement)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isVisible}
                    onChange={e => setFormData({ ...formData, isVisible: e.target.checked })}
                    className="rounded bg-black border-white/20 text-primary w-4 h-4" />
                  <span className="text-sm">Visible pour les élèves</span>
                </label>
              </div>
            </div>

            <Button className="w-full mt-4" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending || uploading || r2Upload.status === "uploading"}>
              {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
