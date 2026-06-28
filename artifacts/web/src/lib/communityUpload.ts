import { CommunityMediaInput } from "@workspace/api-client-react/src/generated/api.schemas";

// ── Upload helpers ──────────────────────────────────────────────────────────
// Reuses the platform's presigned-upload endpoint (POST request-url → PUT file).
// VIP authors upload BOTH the original media and a separately-generated, low-res
// teaser object (blurred image / video thumbnail) so non-VIP viewers never touch
// the original bytes — the teaser is what the server exposes to them.

async function requestUploadUrl(file: {
  name: string;
  size: number;
  contentType: string;
}): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(file),
  });
  if (!res.ok) throw new Error("تعذّر تجهيز رفع الملف");
  return res.json();
}

async function putToStorage(uploadURL: string, body: Blob, contentType: string): Promise<void> {
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body,
  });
  if (!res.ok) throw new Error("فشل رفع الملف");
}

async function uploadBlob(blob: Blob, filename: string): Promise<string> {
  const contentType = blob.type || "application/octet-stream";
  const { uploadURL, objectPath } = await requestUploadUrl({
    name: filename,
    size: blob.size,
    contentType,
  });
  await putToStorage(uploadURL, blob, contentType);
  return objectPath;
}

// ── Canvas helpers ──────────────────────────────────────────────────────────

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("تعذّر إنشاء المعاينة"))),
      type,
      quality,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
    img.src = src;
  });
}

function scaledSize(w: number, h: number, maxDim: number): { w: number; h: number } {
  const scale = Math.min(1, maxDim / Math.max(w || 1, h || 1));
  return {
    w: Math.max(1, Math.round((w || 1) * scale)),
    h: Math.max(1, Math.round((h || 1) * scale)),
  };
}

// ── Image: read dimensions + build blurred low-res teaser ───────────────────

async function buildImageMedia(file: File, sortOrder: number): Promise<CommunityMediaInput> {
  const url = URL.createObjectURL(file);
  let width = 0;
  let height = 0;
  let previewBlob: Blob;
  try {
    const img = await loadImage(url);
    width = img.naturalWidth;
    height = img.naturalHeight;
    const { w, h } = scaledSize(width, height, 600);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء المعاينة");
    // Heavy blur + slight overscan so the teaser leaks no readable detail.
    ctx.filter = "blur(14px)";
    ctx.drawImage(img, -16, -16, w + 32, h + 32);
    previewBlob = await canvasToBlob(canvas, "image/jpeg", 0.5);
  } finally {
    URL.revokeObjectURL(url);
  }

  const [objectPath, previewObjectPath] = await Promise.all([
    uploadBlob(file, file.name),
    uploadBlob(previewBlob, `preview-${Date.now()}.jpg`),
  ]);

  return { mediaType: "image", objectPath, previewObjectPath, width, height, sortOrder };
}

// ── Video: read dimensions/duration + capture a thumbnail frame ─────────────

async function buildVideoMedia(file: File, sortOrder: number): Promise<CommunityMediaInput> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  let width = 0;
  let height = 0;
  let durationSec = 0;
  let thumbBlob: Blob;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("تعذّر قراءة الفيديو"));
    });
    width = video.videoWidth || 0;
    height = video.videoHeight || 0;
    durationSec = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;

    const target = Math.min(Math.max((video.duration || 1) * 0.1, 0.1), video.duration || 0.1);
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.onseeked = done;
      video.onerror = done;
      try {
        video.currentTime = target;
      } catch {
        resolve();
      }
    });

    const { w, h } = scaledSize(width || 1280, height || 720, 720);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء المعاينة");
    ctx.drawImage(video, 0, 0, w, h);
    thumbBlob = await canvasToBlob(canvas, "image/jpeg", 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }

  const [objectPath, previewObjectPath] = await Promise.all([
    uploadBlob(file, file.name),
    uploadBlob(thumbBlob, `thumb-${Date.now()}.jpg`),
  ]);

  return {
    mediaType: "video",
    objectPath,
    previewObjectPath,
    width,
    height,
    durationSec,
    sortOrder,
  };
}

export async function buildMediaInput(file: File, sortOrder: number): Promise<CommunityMediaInput> {
  if (file.type.startsWith("video/")) return buildVideoMedia(file, sortOrder);
  return buildImageMedia(file, sortOrder);
}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024; // 120MB
