import {
  objectStorageClient,
  parseObjectPath,
} from "./objectStorage";

/* ════════════════════════════════════════════════════════════════════════
   HLS adaptive streaming for course videos — the fix for stalls + slow
   seeking on low-bandwidth connections.

   The original MP4 sources are huge (up to ~23 Mbps) and non-faststart, so
   students on slow mobile connections stall constantly and every seek costs
   a full moov download. Each video part is transcoded ONCE (offline) into a
   small HLS ladder (1080p/720p/360p, 4s segments) stored additively under
   `.private/hls/{videoId}/part-{i}/{rendition}/` in App Storage. The
   original MP4s are untouched and remain the fallback.

   Playback security: playlists are served from THIS server behind the same
   short-lived stream token + live entitlement re-check. The media playlists
   embed same-origin PROXY URLs for every segment (never storage.googleapis.com
   URLs) so download-manager extensions cannot intercept the segment bytes.
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

export const RENDITION_NAME_RE = /^[0-9]{3,4}p$/;

// Segment filenames must be plain alphanumeric to prevent path traversal.
export const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

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
   listed variant is what native players (iOS Safari) start with, so the
   smallest rendition leads and ABR can upgrade from there. */
export function buildMasterPlaylist(part: HlsPart, token: string): string {
  const sorted = [...part.renditions].sort((a, b) => a.height - b.height);
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
   downloaded from App Storage ONCE and its segment lines are replaced with
   same-origin PROXY URLs that include the caller's stream token. The raw
   skeleton (segment filenames only, no tokens) is cached for 1 hour — the
   rendered text is NOT cached because it contains per-user tokens.

   Each segment request goes through /api/videos/:id/hls/:part/:rendition/
   segment/:filename?token=... which validates the token, re-checks
   entitlement, then proxies the bytes from GCS through the server.
   The browser (and IDM) never sees a storage.googleapis.com URL. */

const SKELETON_CACHE_MS = 60 * 60_000; // 1 hour

interface PlaylistSkeleton {
  lines: string[];
  segmentFiles: string[];
  freshUntilMs: number;
}

const skeletonCache = new Map<string, PlaylistSkeleton>();
const markerCache = new Map<string, {
  part: HlsPart | null;
  freshUntilMs: number;
}>();

async function readHlsMarker(
  videoId: number,
  partIndex: number,
): Promise<HlsPart | null> {
  const cacheKey = `${videoId}/${partIndex}`;
  const cached = markerCache.get(cacheKey);
  if (cached && cached.freshUntilMs > Date.now()) return cached.part;

  const markerPath = `${buildHlsBasePath(videoId, partIndex)}/.complete`;
  const { bucketName, objectName } = parseObjectPath(markerPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  let part: HlsPart | null = null;
  try {
    const [buf] = await file.download();
    const parsed = parseHlsParts(`[${buf.toString("utf8")}]`);
    part = parsed?.[0] ?? null;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 404) throw err;
  }

  markerCache.set(cacheKey, {
    part,
    // Discover newly completed transcodes quickly while caching stable markers.
    freshUntilMs: Date.now() + (part ? 60 * 60_000 : 30_000),
  });
  return part;
}

export async function resolveAvailableHlsParts(
  videoId: number,
  raw: string | null | undefined,
  partCount: number,
): Promise<(HlsPart | null)[] | null> {
  const stored = parseHlsParts(raw);
  const resolved = Array.from(
    { length: partCount },
    (_, index) => stored?.[index] ?? null,
  );

  // HLS is an optional enhancement. VPS/Dokploy deployments use the existing
  // Drive MP4 proxy and do not necessarily configure Replit App Storage.
  // Stored HLS metadata remains usable without probing storage for markers.
  if (!process.env.PRIVATE_OBJECT_DIR) {
    return resolved.some(Boolean) ? resolved : null;
  }

  try {
    await Promise.all(
      resolved.map(async (part, index) => {
        if (!part) resolved[index] = await readHlsMarker(videoId, index);
      }),
    );
  } catch (error) {
    console.warn(
      "[video-hls] Optional HLS detection unavailable; using MP4 fallback",
      error instanceof Error ? error.message : error,
    );
  }
  return resolved.some(Boolean) ? resolved : null;
}

async function getPlaylistSkeleton(
  videoId: number,
  partIndex: number,
  renditionName: string,
): Promise<PlaylistSkeleton | null> {
  const cacheKey = `${videoId}/${partIndex}/${renditionName}`;
  const hit = skeletonCache.get(cacheKey);
  if (hit && hit.freshUntilMs > Date.now()) return hit;

  const basePath = `${buildHlsBasePath(videoId, partIndex)}/${renditionName}`;
  const { bucketName, objectName } = parseObjectPath(`${basePath}/index.m3u8`);
  const file = objectStorageClient.bucket(bucketName).file(objectName);

  let skeletonText: string;
  try {
    const [buf] = await file.download();
    skeletonText = buf.toString("utf-8");
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 404) return null;
    throw err;
  }

  const lines = skeletonText.split("\n");
  const segmentFiles: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith("#")) segmentFiles.push(t);
  }
  // Defense in depth: skeleton must only reference plain sibling filenames.
  if (segmentFiles.some((f) => !SAFE_SEGMENT_RE.test(f))) {
    throw new Error(`HLS skeleton for ${cacheKey} contains unexpected segment URIs`);
  }

  const entry: PlaylistSkeleton = {
    lines,
    segmentFiles,
    freshUntilMs: Date.now() + SKELETON_CACHE_MS,
  };
  skeletonCache.set(cacheKey, entry);

  if (skeletonCache.size > 300) {
    const now = Date.now();
    for (const [k, v] of skeletonCache) {
      if (v.freshUntilMs <= now) skeletonCache.delete(k);
    }
  }
  return entry;
}

// Renders the media playlist for one rendition of one part, or null when the
// skeleton object does not exist (caller answers 404).
// token: the stream token from the request — embedded in every segment URL so
// the segment proxy can re-validate entitlement without a separate handshake.
export async function renderMediaPlaylist(
  videoId: number,
  partIndex: number,
  renditionName: string,
  token: string,
): Promise<string | null> {
  if (!RENDITION_NAME_RE.test(renditionName)) return null;

  const skeleton = await getPlaylistSkeleton(videoId, partIndex, renditionName);
  if (!skeleton) return null;

  // Build playlist with same-origin segment proxy URLs — never presigned GCS.
  let segIdx = 0;
  const rendered = skeleton.lines
    .map((line) => {
      const t = line.trim();
      if (t && !t.startsWith("#")) {
        const filename = skeleton.segmentFiles[segIdx++];
        return `/api/videos/${videoId}/hls/${partIndex}/${renditionName}/segment/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
      }
      return line;
    })
    .join("\n");

  return rendered;
}

/* ── Cleanup ──────────────────────────────────────────────────────────────
   Best-effort delete of every HLS object for a video (video deleted or its
   source changed). SAFETY: like deleteVideoObjects, this is a no-op outside
   production — dev shares the production bucket and video ids overlap, so a
   dev-side prefix delete would destroy segments production playback needs. */
export function invalidateRenderedPlaylists(videoId: number): void {
  for (const key of skeletonCache.keys()) {
    if (key.startsWith(`${videoId}/`)) skeletonCache.delete(key);
  }
  for (const key of markerCache.keys()) {
    if (key.startsWith(`${videoId}/`)) markerCache.delete(key);
  }
}

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
    for (const key of skeletonCache.keys()) {
      if (key.startsWith(`${videoId}/`)) skeletonCache.delete(key);
    }
  } catch (err) {
    console.warn("[hls-storage] cleanup failed (non-fatal)", {
      videoId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
