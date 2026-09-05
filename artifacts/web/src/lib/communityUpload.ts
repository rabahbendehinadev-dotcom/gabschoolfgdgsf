import { CommunityMediaInput } from "@workspace/api-client-react/src/generated/api.schemas";

// ── Upload helpers ──────────────────────────────────────────────────────────
// Uploads via the authenticated Community proxy, which avoids CORS issues when
// the browser tries to PUT directly to object storage.
// VIP authors upload BOTH the original media and a separately-generated, low-res
// teaser object (blurred image / video thumbnail) so non-VIP viewers never touch
// the original bytes — the teaser is what the server exposes to them.

async function uploadBlob(
  blob: Blob,
  filename: string,
  headers?: HeadersInit,
): Promise<{ objectPath: string; uploadToken: string }> {
  const fd = new FormData();
  fd.append("file", new File([blob], filename, { type: blob.type || "application/octet-stream" }));
  const reqHeaders: Record<string, string> = {};
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => (reqHeaders[k] = v));
    } else if (Array.isArray(headers)) {
      headers.forEach(([k, v]) => (reqHeaders[k] = v));
    } else {
      Object.assign(reqHeaders, headers);
    }
  }
  const cred = localStorage.getItem("device_credential");
  if (cred) reqHeaders["X-Device-Credential"] = cred;

  const res = await fetch("/api/community/uploads/data", {
    method: "POST",
    headers: reqHeaders,
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? `فشل رفع الملف (${res.status})`);
  }
  const result = await res.json() as { objectPath?: string; uploadToken?: string };
  if (!result.objectPath || !result.uploadToken) {
    throw new Error("لم يُرجع الخادم إيصال رفع صالحاً");
  }
  return { objectPath: result.objectPath, uploadToken: result.uploadToken };
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

async function buildImageMedia(
  file: File,
  sortOrder: number,
  headers?: HeadersInit,
): Promise<CommunityMediaInput> {
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

  const [original, preview] = await Promise.all([
    uploadBlob(file, file.name, headers),
    uploadBlob(previewBlob, `preview-${Date.now()}.jpg`, headers),
  ]);

  return {
    mediaType: "image",
    objectPath: original.objectPath,
    uploadToken: original.uploadToken,
    previewObjectPath: preview.objectPath,
    previewUploadToken: preview.uploadToken,
    width,
    height,
    sortOrder,
  };
}

// ── Video: read dimensions/duration + capture a thumbnail frame ─────────────

async function buildVideoMedia(
  file: File,
  sortOrder: number,
  headers?: HeadersInit,
): Promise<CommunityMediaInput> {
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

  const [original, preview] = await Promise.all([
    uploadBlob(file, file.name, headers),
    uploadBlob(thumbBlob, `thumb-${Date.now()}.jpg`, headers),
  ]);

  return {
    mediaType: "video",
    objectPath: original.objectPath,
    uploadToken: original.uploadToken,
    previewObjectPath: preview.objectPath,
    previewUploadToken: preview.uploadToken,
    width,
    height,
    durationSec,
    sortOrder,
  };
}

// ── File: generic upload ──────────────────────────────────────────────────────

async function buildFileMedia(
  file: File,
  sortOrder: number,
  headers?: HeadersInit,
): Promise<CommunityMediaInput> {
  const original = await uploadBlob(file, file.name, headers);

  return {
    mediaType: "file",
    objectPath: original.objectPath,
    uploadToken: original.uploadToken,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    sortOrder,
  };
}

export async function buildMediaInput(
  file: File,
  sortOrder: number,
  headers?: HeadersInit,
): Promise<CommunityMediaInput> {
  if (file.type.startsWith("video/")) return buildVideoMedia(file, sortOrder, headers);
  if (file.type.startsWith("image/")) return buildImageMedia(file, sortOrder, headers);
  return buildFileMedia(file, sortOrder, headers);
}

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024; // 120MB
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
