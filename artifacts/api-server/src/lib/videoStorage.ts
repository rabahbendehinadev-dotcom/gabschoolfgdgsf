import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import {
  objectStorageClient,
  parseObjectPath,
  signObjectURL,
} from "./objectStorage";
import { getDriveAccessToken } from "./googleDrive";

/* ════════════════════════════════════════════════════════════════════════
   Video bytes in App Storage (GCS) — the permanent fix for buffering.

   Instead of proxying every byte range from Google Drive through this server
   (double hop + per-chunk TTFB + shared autoscale egress), migrated videos are
   copied ONCE into the private App Storage bucket and played back via
   short-lived presigned GET URLs. The browser then streams DIRECTLY from
   storage.googleapis.com with native Range support — zero server involvement
   per byte, no proxy truncation, no chunk capping.

   Security model: presigned URLs expire (~4h) and are only issued after the
   exact same entitlement check that gates the Drive proxy. Drive file ids
   still never reach the client.
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
