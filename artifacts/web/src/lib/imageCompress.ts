/**
 * Client-side image compression for uploads (thumbnails, covers, tool images).
 *
 * Admins often upload full-resolution screenshots/photos (multi-MB PNGs) that
 * are then served as small card thumbnails. Downscaling + re-encoding to WebP
 * before upload cuts the stored size 10-30x, which is the difference between
 * a card image appearing instantly vs. visibly loading.
 *
 * Safe by design: any failure (or a result that is not actually smaller)
 * falls back to the original file. SVG and GIF are passed through untouched
 * (vector / animation would be destroyed by canvas re-encoding).
 */

const MAX_DIMENSION = 1280;
const WEBP_QUALITY = 0.82;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to decode image"));
    img.src = src;
  });
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob =
      (await canvasToBlob(canvas, "image/webp", WEBP_QUALITY)) ??
      (await canvasToBlob(canvas, "image/jpeg", WEBP_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.${ext}`, { type: blob.type });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
