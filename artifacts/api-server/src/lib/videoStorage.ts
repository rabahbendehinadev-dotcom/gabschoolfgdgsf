import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { Request, Response } from "express";
import {
  objectStorageClient,
  parseObjectPath,
  signObjectURL,
} from "./objectStorage";
import { getDriveAccessToken } from "./googleDrive";

/* ════════════════════════════════════════════════════════════════════════
   Video bytes in App Storage (GCS) — permanent fix for buffering.

   Migrated videos are copied ONCE into the private App Storage bucket and
   streamed to the browser through THIS server (never via presigned URLs that
   would expose storage.googleapis.com to the network tab). The server proxy
   supports Range requests for native seeking and caps each chunk at 8 MB so
   large open-ended Range requests cannot OOM the process.

   Security model: every byte request is gated by authorizeStreamRequest
   (token + live entitlement re-check). Drive file IDs never reach the client.
   ════════════════════════════════════════════════════════════════════════ */

export interface ObjectPart {
  label: string;
  objectPath: string; // full "/bucket/objectName" path inside App Storage
}

// Parse the videos.object_parts JSON column. Returns null when absent/invalid
// so callers fall back to the Drive proxy path.
export function parseObjectParts(raw: string | null | undefined): ObjectPart[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{ label?: string; objectPath?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = parsed.filter(
      (p) => p && typeof p.objectPath === "string" && p.objectPath.length > 0,
    );
    if (valid.length !== parsed.length) return null;
    return valid.map((p, i) => ({
      label: p.label || `الجزء ${i + 1}`,
      objectPath: p.objectPath as string,
    }));
  } catch {
    return null;
  }
}

export function buildVideoObjectPath(videoId: number, partIndex: number): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const base = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return `${base}/videos/${videoId}/part-${partIndex}.mp4`;
}

/* ── Presigned GET URLs (with a small server-side cache) ──────────────────
   The signed URL itself is the browser's cache key, so if we minted a fresh
   URL on every detail fetch the browser could never reuse already-downloaded
   ranges. We cache each objectPath's signed URL for ~50 minutes (URL lives
   4 hours), so repeat fetches within a session return the SAME URL. */

const SIGNED_URL_TTL_SEC = 4 * 3600; // long lessons must not expire mid-playback
const SIGNED_URL_CACHE_MS = 50 * 60_000;

const signedUrlCache = new Map<string, { url: string; freshUntilMs: number }>();

export async function getSignedVideoURL(objectPath: string): Promise<string> {
  const hit = signedUrlCache.get(objectPath);
  if (hit && hit.freshUntilMs > Date.now()) return hit.url;

  const { bucketName, objectName } = parseObjectPath(objectPath);
  const url = await signObjectURL({
    bucketName,
    objectName,
    method: "GET",
    ttlSec: SIGNED_URL_TTL_SEC,
  });
  signedUrlCache.set(objectPath, { url, freshUntilMs: Date.now() + SIGNED_URL_CACHE_MS });

  // Opportunistic cleanup so the map cannot grow unboundedly.
  if (signedUrlCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of signedUrlCache) {
      if (v.freshUntilMs <= now) signedUrlCache.delete(k);
    }
  }
  return url;
}

/* ── Server-side proxy stream from GCS (replaces direct presigned URLs) ───
   Streams GCS bytes through the server so the browser never sees a
   storage.googleapis.com URL — download-manager extensions cannot intercept
   what they never see. Supports Range requests for seeking. ── */

const GCS_PROXY_CHUNK = 8 * 1024 * 1024; // 8 MB per slice (mirrors Drive cap)

export async function streamGcsObjectToResponse(
  objectPath: string,
  req: Request,
  res: Response,
): Promise<void> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);

  const [metadata] = await file.getMetadata();
  const totalSize = Number(metadata.size ?? 0);
  const contentType =
    typeof metadata.contentType === "string" && metadata.contentType.startsWith("video/")
      ? metadata.contentType
      : "video/mp4";

  const rangeHeader = req.headers.range;
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

  let start = 0;
  let end = totalSize - 1;
  let isRange = false;

  if (match && totalSize > 0) {
    isRange = true;
    if (match[1] === "" && match[2]) {
      // Suffix range e.g. bytes=-1024
      start = Math.max(0, totalSize - parseInt(match[2], 10));
      end = totalSize - 1;
    } else {
      start = match[1] ? parseInt(match[1], 10) : 0;
      end = match[2] ? Math.min(parseInt(match[2], 10), totalSize - 1) : totalSize - 1;
      // Cap chunk size so large open-ended requests (bytes=0-) don't OOM the server
      if (end - start + 1 > GCS_PROXY_CHUNK) end = start + GCS_PROXY_CHUNK - 1;
    }
  }

  const chunkSize = totalSize > 0 ? end - start + 1 : 0;

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", "inline");
  // no-store: tokens are per-user; nothing should be cached by proxies or the browser
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Suppress server identity
  res.removeHeader("X-Powered-By");
  res.setHeader("Vary", "Range");

  if (isRange && totalSize > 0) {
    // Range responses: report exact slice boundaries so the browser can seek.
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    if (chunkSize > 0) res.setHeader("Content-Length", String(chunkSize));
    res.status(206);
  } else {
    // Full-file responses: must include Accept-Ranges + Content-Length so the
    // browser does NOT open a simultaneous byte-range request on the same
    // stream. Without these headers the browser issues a full 200 request AND
    // a range request concurrently; both responses interleave in the decoder,
    // causing H.264 frame corruption / visual artifacts.
    res.setHeader("Accept-Ranges", "bytes");
    if (totalSize > 0) res.setHeader("Content-Length", String(totalSize));
    res.status(200);
  }

  const readOpts = totalSize > 0 ? { start, end } : {};
  const readStream = file.createReadStream(readOpts);
  try {
    await pipeline(readStream, res);
  } catch {
    // Client disconnected mid-stream — not a server error
    if (!res.headersSent) res.status(500).end();
  }
}

/* ── One-time Drive → App Storage copy (admin-triggered, synchronous) ───── */

export interface CopyResult {
  objectPath: string;
  bytes: number;
}

export async function copyDriveFileToStorage(
  driveFileId: string,
  destObjectPath: string,
): Promise<CopyResult> {
  const token = await getDriveAccessToken();

  const driveResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (driveResp.status !== 200 || !driveResp.body) {
    const errBody = await driveResp.text().catch(() => "");
    throw new Error(
      `Drive fetch failed (${driveResp.status}): ${errBody.slice(0, 300)}`,
    );
  }

  const upstreamType = driveResp.headers.get("content-type");
  // iPhone Safari refuses application/octet-stream — force video/mp4 unless
  // Drive reports an explicit video/* type.
  const contentType =
    upstreamType && upstreamType.startsWith("video/") ? upstreamType : "video/mp4";

  const { bucketName, objectName } = parseObjectPath(destObjectPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);

  let bytes = 0;
  const source = Readable.fromWeb(driveResp.body as NodeWebReadableStream<Uint8Array>);
  source.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
  });

  await pipeline(
    source,
    file.createWriteStream({
      contentType,
      metadata: { cacheControl: "private, max-age=3600" },
    }),
  );

  return { objectPath: destObjectPath, bytes };
}

// Best-effort delete of migrated objects (used when a video is deleted or its
// source URLs change). Failures are logged, never thrown.
// SAFETY: no-op outside production. Dev shares the production bucket and its
// video ids overlap production's — a dev-side delete at the deterministic
// path videos/{id}/part-{i}.mp4 destroys objects production playback needs
// (this exact bug wiped videos 10-12 in production).
export async function deleteVideoObjects(parts: ObjectPart[]): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[video-storage] deleteVideoObjects skipped in dev (shared bucket protection) — ${parts.length} object(s) left in place.`,
    );
    return;
  }
  for (const p of parts) {
    try {
      const { bucketName, objectName } = parseObjectPath(p.objectPath);
      await objectStorageClient.bucket(bucketName).file(objectName).delete();
      signedUrlCache.delete(p.objectPath);
    } catch (err) {
      console.warn("[video-storage] cleanup failed (non-fatal)", {
        objectPath: p.objectPath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
