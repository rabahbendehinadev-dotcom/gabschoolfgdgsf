import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCommunityPost,
  getGetCommunityFeedQueryKey,
  getGetCommunitySummaryQueryKey,
} from "@workspace/api-client-react/src/generated/api";
import {
  CommunityMediaInput,
  CreateCommunityPostInputPostType,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
} from "@/components/ui";
import { buildMediaInput, MAX_IMAGE_BYTES } from "@/lib/communityUpload";
import { ImagePlus, X, Loader2, Crown, Send } from "lucide-react";

type Picked = { file: File; url: string };

const MAX_IMAGES = 6;

export function CreatePostDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const createPost = useCreateCommunityPost({ request: getAuthHeaders() });

  const reset = () => {
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    setContent("");
    setPicked([]);
    setSubmitting(false);
  };

  const close = (v: boolean) => {
    if (submitting) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const tooBig = images.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      toast({ title: "حجم إحدى الصور كبير جداً (الحد 15MB)", variant: "destructive" });
      return;
    }
    const merged = [...picked, ...images.map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
    if (merged.length > MAX_IMAGES) {
      toast({ title: `الحد الأقصى ${MAX_IMAGES} صور` });
    }
    setPicked(merged.slice(0, MAX_IMAGES));
  };

  const removeAt = (idx: number) => {
    setPicked((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  const canSubmit = (content.trim().length > 0 || picked.length > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const media: CommunityMediaInput[] = [];
      for (let i = 0; i < picked.length; i++) {
        media.push(await buildMediaInput(picked[i].file, i));
      }

      let postType: CreateCommunityPostInputPostType = "text";
      if (picked.length > 0) {
        postType = picked.length > 1 ? "gallery" : "image";
      }

      await createPost.mutateAsync({
        data: {
          content: content.trim() || null,
          postType,
          media: media.length ? media : undefined,
        },
      });

      queryClient.invalidateQueries({ queryKey: getGetCommunityFeedQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCommunitySummaryQueryKey() });
      toast({ title: "تم نشر منشورك بنجاح" });
      reset();
      onOpenChange(false);
    } catch {
      toast({ title: "تعذّر نشر المنشور، حاول مجدداً", variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-orange-500" />
            مشاركة جديدة
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-base font-bold text-white">
            {user?.username?.trim().charAt(0) || "؟"}
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="شارك خبرتك، سؤالاً، أو إنجازاً مع Community GAB…"
            className="flex-1 resize-none rounded-2xl border-border text-[15px]"
            autoFocus
          />
        </div>

        {/* Previews */}
        {picked.length > 0 && (
          <div
            className={`grid gap-2 ${picked.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}
          >
            {picked.map((p, idx) => (
              <div
                key={p.url}
                className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
              >
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  disabled={submitting}
                  className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
                  aria-label="إزالة"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Attach controls */}
        <div className="flex items-center gap-2">
          <label
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            <ImagePlus className="h-4 w-4 text-emerald-600" />
            صور
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={submitting}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="rounded-xl bg-orange-500/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <Crown className="ml-1 inline h-3.5 w-3.5 text-orange-500" />
          الوسائط التي تنشرها ستكون حصرية لأعضاء VIP — يرى بقية الأعضاء معاينة فقط.
        </div>

        <Button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-full py-6 text-base shadow-md shadow-primary/25"
        >
          {submitting ? (
            <>
              <Loader2 className="ml-2 h-5 w-5 animate-spin" />
              جارٍ النشر…
            </>
          ) : (
            <>
              <Send className="ml-2 h-5 w-5" />
              نشر
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
