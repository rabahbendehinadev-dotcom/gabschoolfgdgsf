import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import multer from "multer";
import { db, communityPostMediaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { userAuth } from "../middlewares/auth";
import { signCommunityUploadReceipt } from "../lib/communityUploadReceipt";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function isNotCommunityOriginal(objectPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: communityPostMediaTable.id })
    .from(communityPostMediaTable)
    .where(eq(communityPostMediaTable.objectPath, objectPath))
    .limit(1);

  return !row;
}

/* ── Multer upload limits ────────────────────────────────────────────── */
/* Accept any file — type validation happens after parse to avoid multer v2
   fileFilter throwing an unhandled error instead of returning JSON. */
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const communityMemUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024 },
});

function isAllowedCommunityMime(mime: string): boolean {
  return (
    ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(mime) ||
    ["video/mp4", "video/quicktime", "video/webm"].includes(mime) ||
    ["text/plain", "text/csv"].includes(mime) ||
    mime === "application/pdf" ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/octet-stream"
  );
}

function isAllowedPublicUploadMime(mime: string): boolean {
  return (
    ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(mime) ||
    mime === "application/octet-stream"
  );
}

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function hasExpectedSignature(buffer: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47]);
  if (mime === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mime === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mime === "image/avif") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    return buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
      (brand === "avif" || brand === "avis");
  }
  if (mime === "video/mp4" || mime === "video/quicktime") {
    return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (mime === "video/webm") return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  if (mime === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    mime.includes("openxmlformats")
  ) {
    return startsWithBytes(buffer, [0x50, 0x4b]);
  }
  if (mime === "application/msword" || mime === "application/vnd.ms-excel") {
    return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0]);
  }
  return true;
}

function communitySizeLimit(mime: string): number {
  if (mime.startsWith("image/")) return 15 * 1024 * 1024;
  if (mime.startsWith("video/")) return 120 * 1024 * 1024;
  return 50 * 1024 * 1024;
}

async function storeBufferedUpload(
  req: Request,
  res: Response,
  communityUserId?: number,
): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: "No file provided (field name must be 'file')" });
    return;
  }
  const { buffer, mimetype } = req.file;
  const effectiveMime = mimetype || "application/octet-stream";
  try {
    const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": effectiveMime },
      body: buffer,
    });
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => "");
      throw new Error(`Storage PUT failed: ${putRes.status} ${errText}`);
    }
    const uploadToken =
      communityUserId === undefined
        ? undefined
        : signCommunityUploadReceipt({
            objectPath,
            userId: communityUserId,
            contentType: effectiveMime,
            sizeBytes: buffer.byteLength,
          });
    res.json({ objectPath, publicUrl: `/api/storage${objectPath}`, uploadToken });
  } catch (err) {
    console.error("[upload] failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
}

/* ── Routes ─────────────────────────────────────────────────────────────── */

/**
 * POST /storage/uploads/request-url
 *
 * Legacy: kept for backward compatibility.
 * New code should use POST /storage/uploads/data instead.
 */
router.post("/storage/uploads/request-url", (_req: Request, res: Response) => {
  res.status(410).json({
    error: "Direct upload URLs are no longer available; use /storage/uploads/data",
  });
});

/**
 * POST /storage/uploads/data
 *
 * Server-side upload proxy — accepts multipart/form-data with a `file` field.
 * The server uploads the file to object storage, returning { objectPath }.
 *
 * Why: Direct browser-to-GCS PUT requires CORS on the GCS bucket for every
 * production domain. Proxying through our server avoids this entirely and
 * also means the GCS URL never reaches the browser.
 *
 * Intentionally unauthenticated: regular users upload payment proofs, too.
 */
router.post(
  "/storage/uploads/data",
  (req, res, next) => {
    console.log("[upload:debug] ← request received", {
      method: req.method,
      url: req.originalUrl,
      contentType: req.headers["content-type"],
      contentLength: req.headers["content-length"],
    });
    next();
  },
  memUpload.single("file"),
  async (req: Request, res: Response) => {
    console.log("[upload:debug] multer done", {
      hasFile: !!req.file,
      fieldname: req.file?.fieldname,
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
    });

    if (!req.file) {
      console.error("[upload:debug] req.file is undefined — multer did not find field 'file'");
      res.status(400).json({ error: "No file provided (field name must be 'file')" });
      return;
    }
    const { buffer, mimetype } = req.file;
    const effectiveMime = mimetype || "application/octet-stream";
    if (!isAllowedPublicUploadMime(effectiveMime)) {
      console.error("[upload:debug] rejected MIME:", effectiveMime);
      res.status(400).json({ error: `نوع الملف غير مدعوم: ${effectiveMime}` });
      return;
    }
    if (
      effectiveMime !== "application/octet-stream" &&
      !hasExpectedSignature(buffer, effectiveMime)
    ) {
      res.status(400).json({ error: "محتوى الملف لا يطابق نوعه" });
      return;
    }
    try {
      console.log("[upload:debug] calling getObjectEntityUploadURL …");
      const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
      console.log("[upload:debug] uploadURL ok, objectPath:", objectPath);

      console.log("[upload:debug] PUT to storage, size:", buffer.byteLength, "mime:", effectiveMime);
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": effectiveMime },
        body: buffer,
      });
      console.log("[upload:debug] storage PUT status:", putRes.status);
      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => "");
        throw new Error(`Storage PUT failed: ${putRes.status} ${errText}`);
      }

      console.log("[upload:debug] ✓ success:", objectPath);
      res.json({
        objectPath,
        publicUrl: `/api/storage${objectPath}`,
      });
    } catch (err) {
      console.error("[upload:debug] ✗ error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  },
);

/**
 * Authenticated Community upload path. Kept separate from the intentionally
 * public small-upload route so large videos/files cannot be submitted anonymously.
 */
router.post(
  "/community/uploads/data",
  userAuth,
  communityMemUpload.single("file"),
  async (req: Request, res: Response) => {
    const effectiveMime = req.file?.mimetype || "application/octet-stream";
    if (!isAllowedCommunityMime(effectiveMime)) {
      res.status(400).json({ error: `نوع الملف غير مدعوم: ${effectiveMime}` });
      return;
    }
    if (!req.file || req.file.size > communitySizeLimit(effectiveMime)) {
      res.status(413).json({ error: "حجم الملف يتجاوز الحد المسموح لهذا النوع" });
      return;
    }
    if (!hasExpectedSignature(req.file.buffer, effectiveMime)) {
      res.status(400).json({ error: "محتوى الملف لا يطابق نوعه" });
      return;
    }
    await storeBufferedUpload(req, res, req.user!.id);
  },
);

/**
 * GET /storage/public-objects/*filePath
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * Unconditionally public — no auth or ACL checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Error serving public object:", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/thumbnails/*path
 *
 * Serve pre-generated 800×450 WebP card thumbnails.
 * No community-check DB query — these are never community originals.
 * 1-year immutable cache so browsers don't re-fetch them.
 */
router.get("/storage/thumbnails/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/thumbnails/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile, 60 * 60 * 24 * 365, true);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Thumbnail not found" });
      return;
    }
    console.error("Error serving thumbnail:", error);
    res.status(500).json({ error: "Failed to serve thumbnail" });
  }
});

/**
 * GET /storage/objects/*path
 *
 * Serve private object entities from PRIVATE_OBJECT_DIR.
 * Community-post originals are blocked here (gate them via /community/media).
 * 30-day immutable cache for upload objects (content-addressed by UUID).
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const notCommunity = await isNotCommunityOriginal(objectPath);
    if (!notCommunity) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile, 60 * 60 * 24 * 30, true);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("X-Content-Type-Options", "nosniff");
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      res.setHeader("Content-Disposition", "attachment");
    }
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    console.error("Error serving object:", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
