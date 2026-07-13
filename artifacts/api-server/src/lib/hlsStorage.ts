import {
  objectStorageClient,
  parseObjectPath,
  signObjectURL,
} from "./objectStorage";

/* ════════════════════════════════════════════════════════════════════════
   HLS adaptive streaming for course videos — the fix for stalls + slow
   seeking on low-bandwidth connections.

   The original MP4 sources are huge (up to ~23 Mbps) and non-faststart, so
   students on slow mobile connections stall constantly and every seek costs
   a full moov download. Each video part is transcoded ONCE (offline) into a
   small HLS ladder (720p/480p/360p, 4s segments) stored additively under
   `.private/hls/{videoId}/part-{i}/{rendition}/` in App Storage. The
   original MP4s are untouched and remain the fallback.

   Playback security mirrors the MP4 path: playlists are served from THIS
   server behind the same short-lived stream token + live entitlement
   re-check, and the media playlists embed short-lived presigned GCS segment
   URLs. Raw object paths never reach the client.

   The `videos.hls_parts` column stores only lightweight rendition metadata
   (name/resolution/bandwidth/codecs per part). The per-segment detail lives
   in the skeleton playlists ffmpeg wrote next to the segments
   (`index.m3u8`), which this module downloads, rewrites with presigned
   segment URLs, and caches in memory.
   ════════════════════════════════════════════════════════════════════════ */

export interface HlsRendition {
  name: string; // e.g. "480p" — also the folder + playlist name
  width: number;
  height: number;
  bandwidth: number; // peak bits/sec for EXT-X-STREAM-INF
  codecs?: string; // RFC 6381, e.g. 'avc1.64001f,mp4a.40.2'
}

export interface HlsPart {
  renditions: HlsRendition[];
}

const RENDITION_NAME_RE = /^[0-9]{3,4}p$/;

// Parse the videos.hls_parts JSON column. Returns null when absent/invalid
// so callers fall back to plain MP4 playback.
export function parseHlsParts(raw: string | null | undefined): (HlsPart | null)[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{
      renditions?: Array<{
        name?: string;
        width?: number;
        height?: number;
        bandwidth?: number;
        codecs?: string;
      }>;
    } | null>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    let hasAny = false;
    const result = parsed.map((p): HlsPart | null => {
      if (!p || !Array.isArray(p.renditions) || p.renditions.length === 0) return null;
      const renditions: HlsRendition[] = [];
      for (const r of p.renditions) {
        if (
          !r ||
          typeof r.name !== "string" ||
          !RENDITION_NAME_RE.test(r.name) ||
          typeof r.width !== "number" ||
          typeof r.height !== "number" ||
          typeof r.bandwidth !== "number"
        ) {
          return null; // one malformed rendition invalidates the whole part
        }
        renditions.push({
          name: r.name,
          width: Math.round(r.width),
          height: Math.round(r.height),
          bandwidth: Math.round(r.bandwidth),
          codecs: typeof r.codecs === "string" ? r.codecs : undefined,
        });
      }
      hasAny = true;
      return { renditions };
    });
    return hasAny ? result : null;
  } catch {
    return null;
  }
}

// Validate an incoming hls_parts payload (admin flag endpoint). Returns the
// normalized JSON string to store, or null when the shape is unacceptable.
export function normalizeHlsPartsInput(input: unknown): string | null {
  const raw = JSON.stringify(input);
  if (!raw || raw.length > 100_000) return null;
  const parsed = parseHlsParts(raw);
  if (!parsed) return null;
  return JSON.stringify(parsed);
}

export function buildHlsBasePath(videoId: number, partIndex: number): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const base = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return `${base}/hls/${videoId}/part-${partIndex}`;
}

/* ── Master playlist ──────────────────────────────────────────────────────
   Variant URIs are RELATIVE ("480p.m3u8?token=...") so they resolve against
   this same API route prefix — same-origin, token still enforced. The first
   listed variant is what native players (iOS Safari) start with, so 480p
   leads: fast startup on slow connections, ABR upgrades from there. */
export function buildMasterPlaylist(part: HlsPart, token: string): string {
  const order = (r: HlsRendition) => (r.height === 480 ? 0 : r.height > 480 ? 1 : 2);
  const sorted = [...part.renditions].sort((a, b) => order(a) - order(b) || b.height - a.height);
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const r of sorted) {
    const attrs = [
      `BANDWIDTH=${r.bandwidth}`,
      `RESOLUTION=${r.width}x${r.height}`,
      ...(r.codecs ? [`CODECS="${r.codecs}"`] : []),
    ];
    lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`);
    lines.push(`${r.name}.m3u8?token=${encodeURIComponent(token)}`);
  }
  return lines.join("\n") + "\n";
}

/* ── Media playlists ──────────────────────────────────────────────────────
   The skeleton `index.m3u8` ffmpeg produced (relative segment filenames) is
   downloaded from App Storage and each segment line is replaced with a
   presigned GCS URL. Rendered playlists are cached ~50 minutes while the
   embedded URLs live 4 hours, so a playlist handed out at any moment keeps
   working for 3h+ of continuous playback — and repeat requests return
   byte-identical playlists (stable URLs = browser/hls.js cache friendly). */

const SEGMENT_URL_TTL_SEC = 4 * 3600;
const RENDERED_PLAYLIST_CACHE_MS = 50 * 60_000;
const SIGN_CONCURRENCY = 16;

const renderedPlaylistCache = new Map<string, { text: string; freshUntilMs: number }>();

/* Drop cached rendered playlists for a video — called when its hlsParts flag
   changes (set/clear/re-transcode) so stale segment lists are never served. */
export function invalidateRenderedPlaylists(videoId: number): void {
  for (const key of renderedPlaylistCache.keys()) {
    if (key.startsWith(`${videoId}/`)) renderedPlaylistCache.delete(key);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Renders the media playlist for one rendition of one part, or null when the
// skeleton object does not exist (caller answers 404).
export async function renderMediaPlaylist(
  videoId: number,
  partIndex: number,
  renditionName: string,
): Promise<string | null> {
  if (!RENDITION_NAME_RE.test(renditionName)) return null;

  const cacheKey = `${videoId}/${partIndex}/${renditionName}`;
  const hit = renderedPlaylistCache.get(cacheKey);
  if (hit && hit.freshUntilMs > Date.now()) return hit.text;

  const basePath = `${buildHlsBasePath(videoId, partIndex)}/${renditionName}`;
  const { bucketName, objectName } = parseObjectPath(`${basePath}/index.m3u8`);
  const file = objectStorageClient.bucket(bucketName).file(objectName);

  let skeleton: string;
  try {
    const [buf] = await file.download();
    skeleton = buf.toString("utf-8");
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 404) return null;
    throw err;
  }

  const lines = skeleton.split("\n");
  // Segment lines are the non-empty lines that do not start with '#'.
  const segmentFiles: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith("#")) segmentFiles.push(t);
  }
  // Defense in depth: skeleton must only reference plain sibling filenames.
  const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
  if (segmentFiles.some((f) => !SAFE_SEGMENT_RE.test(f))) {
    throw new Error(`HLS skeleton for ${cacheKey} contains unexpected segment URIs`);
  }

  const signedUrls = await mapWithConcurrency(segmentFiles, SIGN_CONCURRENCY, async (f) => {
    const seg = parseObjectPath(`${basePath}/${f}`);
    return signObjectURL({
      bucketName: seg.bucketName,
      objectName: seg.objectName,
      method: "GET",
      ttlSec: SEGMENT_URL_TTL_SEC,
    });
  });

  let segIdx = 0;
  const rendered = lines
    .map((line) => {
      const t = line.trim();
      if (t && !t.startsWith("#")) return signedUrls[segIdx++];
      return line;
    })
    .join("\n");

  renderedPlaylistCache.set(cacheKey, {
    text: rendered,
    freshUntilMs: Date.now() + RENDERED_PLAYLIST_CACHE_MS,
  });
  if (renderedPlaylistCache.size > 300) {
    const now = Date.now();
    for (const [k, v] of renderedPlaylistCache) {
      if (v.freshUntilMs <= now) renderedPlaylistCache.delete(k);
    }
  }
  return rendered;
}

/* ── Cleanup ──────────────────────────────────────────────────────────────
   Best-effort delete of every HLS object for a video (video deleted or its
   source changed). SAFETY: like deleteVideoObjects, this is a no-op outside
   production — dev shares the production bucket and video ids overlap, so a
   dev-side prefix delete would destroy segments production playback needs. */
export async function deleteHlsObjects(videoId: number): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[hls-storage] deleteHlsObjects skipped in dev (shared bucket protection) — video ${videoId} HLS objects left in place.`,
    );
    return;
  }
  try {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) return;
    const base = dir.endsWith("/") ? dir.slice(0, -1) : dir;
    const { bucketName, objectName } = parseObjectPath(`${base}/hls/${videoId}`);
    await objectStorageClient
      .bucket(bucketName)
      .deleteFiles({ prefix: `${objectName}/`, force: true });
    for (const key of renderedPlaylistCache.keys()) {
      if (key.startsWith(`${videoId}/`)) renderedPlaylistCache.delete(key);
    }
  } catch (err) {
    console.warn("[hls-storage] cleanup failed (non-fatal)", {
      videoId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
