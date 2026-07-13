import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, CheckCircle } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

async function requestPresignedUrl(
  file: File,
): Promise<{ uploadUrl: string; objectPath: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("تعذّر الحصول على رابط الرفع");
  const data = await res.json();
  // Storage route returns uploadURL (capital), normalize to uploadUrl
  return { uploadUrl: data.uploadURL ?? data.uploadUrl, objectPath: data.objectPath };
}

async function uploadToGcs(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("فشل رفع الصورة");
}

async function saveAvatar(token: string, objectPath: string): Promise<void> {
  const res = await fetch("/api/users/me/avatar", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ objectPath }),
  });
  if (!res.ok) throw new Error("تعذّر حفظ الصورة الشخصية");
}

export function ProfilePictureModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { user, token, updateUser } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setDone(false);
    setUploading(false);
  };

  const close = (v: boolean) => {
    if (uploading) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({ title: "يرجى اختيار صورة (JPEG, PNG…)", variant: "destructive" });
      return;
    }
    if (f.size > MAX_BYTES) {
      toast({ title: "الصورة كبيرة جداً (الحد 5 MB)", variant: "destructive" });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    setFile(f);
    setDone(false);
  };

  const handleSave = async () => {
    if (!file || !token) return;
    setUploading(true);
    try {
      const { uploadUrl, objectPath } = await requestPresignedUrl(file);
      await uploadToGcs(uploadUrl, file);
      await saveAvatar(token, objectPath);

      const updatedUser = {
        ...user!,
        profileImageUrl: `/api/users/${user!.id}/avatar?t=${Date.now()}`,
      };
      updateUser(updatedUser);
      setDone(true);
      toast({ title: "تم حفظ الصورة الشخصية بنجاح ✓" });
      setTimeout(() => {
        close(false);
        onSaved?.();
      }, 1000);
    } catch (err: unknown) {
      toast({
        title: "تعذّر رفع الصورة",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-lg font-extrabold">الصورة الشخصية</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          <p className="text-center text-sm text-muted-foreground leading-relaxed">
            يجب إضافة صورة شخصية قبل النشر أو التعليق في المجتمع.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-dashed border-primary/40 bg-muted transition-opacity hover:opacity-85"
          >
            {preview ? (
              <img src={preview} alt="معاينة" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
                <Camera className="h-8 w-8 text-muted-foreground/60" />
                <span className="text-[11px] text-muted-foreground">اختر صورة</span>
              </div>
            )}
            {done && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex w-full gap-2.5">
            <Button
              variant="outline"
              className="flex-1 rounded-2xl"
              onClick={() => close(false)}
              disabled={uploading}
            >
              لاحقاً
            </Button>
            <Button
              className="flex-1 rounded-2xl"
              onClick={handleSave}
              disabled={!file || uploading || done}
            >
              {uploading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارٍ الرفع…
                </>
              ) : (
                "حفظ الصورة"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
