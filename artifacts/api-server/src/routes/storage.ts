import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import multer from "multer";
import { z } from "zod";
import { db, communityPostMediaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/* ── Community-check cache ────────────────────────────────────────────────
   Category / playlist / tool images are never community originals.
   Hitting the DB on every image request adds pointless TTFB overhead.
   Cache "not community" results for 10 minutes; don't cache positives.
   ─────────────────────────────────────────────────────────────────────── */
const communityCache = new Map<string, { expiresAt: number }>();
const COMMUNITY_CACHE_TTL_MS = 10 * 60 * 1_000;

async function isNotCommunityOriginal(objectPath: string): Promise<boolean> {
  const cached = communityCache.get(objectPath);
  if (cached && Date.now() < cached.expiresAt) return true;

  const [row] = await db
    .select({ id: communityPostMediaTable.id })
    .from(communityPostMediaTable)
    .where(eq(communityPostMediaTable.objectPath, objectPath))
    .limit(1);

  if (!row) {
    communityCache.set(objectPath, { expiresAt: Date.now() + COMMUNITY_CACHE_TTL_MS });
    if (communityCache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of communityCache) {
        if (now > v.expiresAt) communityCache.delete(k);
      }
    }
    return true;
  }
  return false;
}

/* ── Multer (memory storage — images only, ≤10 MB) ───────────────────── */
/* Accept any file — type validation happens after parse to avoid multer v2
   fileFilter throwing an unhandled error instead of returning JSON. */
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* ── Routes ─────────────────────────────────────────────────────────────── */

/**
 * POST /storage/uploads/request-url
 *
 * Legacy: kept for backward compatibility.
 * New code should use POST /storage/uploads/data instead.
 */
const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
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
  memUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided (field name: file)" });
      return;
    }
    const { buffer, mimetype } = req.file;
    const effectiveMime = mimetype || "application/octet-stream";
    if (!effectiveMime.startsWith("image/") && effectiveMime !== "application/octet-stream") {
      res.status(400).json({ error: `نوع الملف غير مدعوم: ${effectiveMime}` });
      return;
    }
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      /* Server-side PUT to GCS — no CORS restrictions apply here */
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mimetype },
        body: buffer,
      });
      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => "");
        throw new Error(`Storage PUT failed: ${putRes.status} ${errText}`);
      }

      res.json({ objectPath });
    } catch (err) {
      console.error("[storage] server-side upload error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
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
