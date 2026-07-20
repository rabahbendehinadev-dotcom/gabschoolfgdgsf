import type { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";

/* ════════════════════════════════════════════════════════════════════════
   Google Drive streaming (server-side OAuth)

   Two auth modes — selected automatically at runtime:

   A) Replit Connector (default on Replit):
      Uses REPLIT_CONNECTORS_HOSTNAME + REPL_IDENTITY / WEB_REPL_RENEWAL
      to obtain the access token via the Replit connectors service.

   B) VPS / Self-hosted (used on Docker / Dokploy):
      Set GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.
      The google-auth-library exchanges the refresh token for a short-lived
      access token and renews it automatically.

   Note: once all videos are migrated to S3/Object Storage, Drive streaming
   is no longer needed and these env vars can be omitted entirely.
   ════════════════════════════════════════════════════════════════════════ */

interface DriveCredentials {
  access_token?: string;
  expires_at?: string;
}

let cached: { token: string; expiresAtMs: number } | null = null;

/* ── Mode A: Replit Connector ─────────────────────────────────────────────── */
async function fetchAccessTokenReplit(): Promise<{
  token: string;
  expiresAtMs: number;
}> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    console.error("[video-stream] TOKEN ERROR: connector env missing", {
      hasHostname: !!hostname,
      hasReplIdentity: !!process.env.REPL_IDENTITY,
      hasWebReplRenewal: !!process.env.WEB_REPL_RENEWAL,
    });
    throw new Error("Google Drive connector is not available in this environment");
  }

  // NOTE: no connector_names filter — in the development environment that
  // filter returns 0 items for a production-scoped connection, so we list all
  // connections and pick the Google Drive one ourselves.
  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[video-stream] TOKEN ERROR: connector lookup failed", {
      status: resp.status,
      body: body.slice(0, 400),
    });
    throw new Error(`Google Drive connector lookup failed (${resp.status})`);
  }

  const data = (await resp.json()) as {
    items?: Array<{
      connector_name?: string;
      settings?: {
        access_token?: string;
        oauth?: { credentials?: DriveCredentials };
      };
    }>;
  };
  const driveItem =
    data.items?.find((item) => item.connector_name === "google-drive") ??
    data.items?.[0];
  const settings = driveItem?.settings;
  const creds = settings?.oauth?.credentials;
  const token = creds?.access_token || settings?.access_token;
  if (!token) {
    console.error(
      "[video-stream] TOKEN ERROR: connector returned no access token",
      { itemCount: data.items?.length ?? 0 },
    );
    throw new Error("Google Drive is not connected");
  }

  const expiresAtMs = creds?.expires_at
    ? new Date(creds.expires_at).getTime()
    : Date.now() + 5 * 60_000;
  return { token, expiresAtMs };
}

/* ── Mode B: VPS — OAuth2 refresh token ──────────────────────────────────── */
async function fetchAccessTokenVps(): Promise<{
  token: string;
  expiresAtMs: number;
}> {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Google Drive VPS auth not configured. " +
        "Set GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.",
    );
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();

  const token = credentials.access_token;
  if (!token) throw new Error("Google OAuth2: refresh returned no access_token");

  return {
    token,
    expiresAtMs: credentials.expiry_date ?? Date.now() + 60 * 60_000,
  };
}

/* ── Router: pick mode automatically ─────────────────────────────────────── */
async function fetchAccessToken(): Promise<{
  token: string;
  expiresAtMs: number;
}> {
  const isReplitEnv = !!(process.env.REPLIT_CONNECTORS_HOSTNAME);
  const hasVpsOAuth = !!(process.env.GOOGLE_DRIVE_REFRESH_TOKEN);

  if (isReplitEnv) {
    return fetchAccessTokenReplit();
  }
  if (hasVpsOAuth) {
    return fetchAccessTokenVps();
  }
  throw new Error(
    "Google Drive is not configured. " +
      "On Replit: connect Google Drive via the Connectors panel. " +
      "On VPS: set GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.",
  );
}

export async function getDriveAccessToken(): Promise<string> {
  // Refresh a minute before expiry to avoid mid-request 401s.
  if (cached && cached.expiresAtMs - 60_000 > Date.now()) return cached.token;
  cached = await fetchAccessToken();
  return cached.token;
}

// Build the ordered list of playable parts for a video. driveParts (when
// present) is a JSON string of [{label,url}]; otherwise we fall back to the
// single driveEmbedUrl. The returned URLs are RAW Drive URLs used ONLY
// server-side to resolve a file id — they are never sent to the browser.
export function resolveVideoParts(video: {
  driveEmbedUrl: string;
  driveParts: string | null;
}): { label: string; url: string }[] {
  if (video.driveParts) {
    try {
      const parsed = JSON.parse(video.driveParts) as Array<{
        label?: string;
        url?: string;
      }>;
      const valid = (Array.isArray(parsed) ? parsed : []).filter(
        (p) => p && typeof p.url === "string" && p.url.length > 0,
      );
      if (valid.length > 0) {
        return valid.map((p, i) => ({
          label: p.label || `الجزء ${i + 1}`,
          url: p.url as string,
        }));
      }
    } catch {
      /* malformed driveParts → fall back to the single embed url */
    }
  }
  if (video.driveEmbedUrl)
    return [{ label: "الفيديو", url: video.driveEmbedUrl }];
  return [];
}

// Extract a Drive file id from any stored Drive URL form, e.g.:
//   https://drive.google.com/file/d/FILE_ID/preview
//   https://drive.google.com/open?id=FILE_ID
//   https://drive.google.com/uc?id=FILE_ID&export=download
//   https://drive.google.com/drive/folders/FOLDER_ID  ← folder (migration will fail)
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  // /file/d/ID or bare /d/ID
  const byPath = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  // ?id=ID or &id=ID
  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (byQuery) return byQuery[1];
  // /folders/ID — we extract the id so the caller can give a folder-specific error
  const byFolders = url.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (byFolders) return byFolders[1];
  // bare 20+ char alphanumeric id
  const bare = url.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(bare)) return bare;
  return null;
}

/** Returns true when the URL is a Google Drive folder link (not a video file). */
export function isFolderDriveUrl(url: string): boolean {
  return Boolean(url && url.match(/\/folders\/[a-zA-Z0-9_-]{10,}/));
}

// ─── Pre-fetch cache ─────────────────────────────────────────────────────────
const MAX_CHUNK_MOBILE = 8 * 1024 * 1024;
const MAX_CHUNK_DESKTOP = 32 * 1024 * 1024;
const MAX_PREFETCH_ENTRIES = 8;
const PREFETCH_TTL_MS = 3 * 60_000;

function isMobileUA(ua: string | undefined): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
}

interface PrefetchEntry {
  promise: Promise<PrefetchResult | null>;
  born: number;
  timer: ReturnType<typeof setTimeout>;
}
interface PrefetchResult {
  status: number;
  data: Buffer;
  contentRange: string | null;
  contentLength: string | null;
  contentType: string | null;
}

const prefetchMap = new Map<string, PrefetchEntry>();

function prefetchKey(fileId: string, start: number) {
  return `${fileId}:${start}`;
}

function evictPrefetchEntry(key: string) {
  const e = prefetchMap.get(key);
  if (e) {
    clearTimeout(e.timer);
    prefetchMap.delete(key);
  }
}

async function fetchDriveRange(
  token: string,
  fileId: string,
  driveRange: string,
): Promise<PrefetchResult | null> {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}`, Range: driveRange } },
    );
    if (resp.status !== 200 && resp.status !== 206) return null;
    const data = Buffer.from(await resp.arrayBuffer());
    const upstreamType = resp.headers.get("content-type");
    return {
      status: resp.status,
      data,
      contentRange: resp.headers.get("content-range"),
      contentLength: String(data.byteLength),
      contentType:
        upstreamType && upstreamType.startsWith("video/")
          ? upstreamType
          : "video/mp4",
    };
  } catch {
    return null;
  }
}

function schedulePrefetch(
  token: string,
  fileId: string,
  nextStart: number,
  chunkSize: number,
): void {
  if (prefetchMap.size >= MAX_PREFETCH_ENTRIES) return;
  const key = prefetchKey(fileId, nextStart);
  if (prefetchMap.has(key)) return;

  const nextEnd = nextStart + chunkSize - 1;
  const driveRange = `bytes=${nextStart}-${nextEnd}`;
  const promise = fetchDriveRange(token, fileId, driveRange);
  const timer = setTimeout(() => prefetchMap.delete(key), PREFETCH_TTL_MS);
  prefetchMap.set(key, { promise, born: Date.now(), timer });
}

export async function streamDriveFile(
  req: Request,
  res: Response,
  fileId: string,
): Promise<void> {
  const token = await getDriveAccessToken();

  const clientRange = req.headers.range;
  const match = clientRange
    ? /^bytes=(\d*)-(\d*)$/.exec(clientRange.trim())
    : null;

  const isSuffix = !!(match && match[1] === "" && match[2] !== "");

  let start = 0;
  let driveRange: string;

  const ua = req.headers["user-agent"];
  const chunkSize = isMobileUA(ua) ? MAX_CHUNK_MOBILE : MAX_CHUNK_DESKTOP;

  if (isSuffix) {
    driveRange = `bytes=-${match![2]}`;
  } else {
    start = match && match[1] ? parseInt(match[1], 10) : 0;
    if (Number.isNaN(start) || start < 0) start = 0;
    let requestedEnd = match && match[2] ? parseInt(match[2], 10) : null;
    if (
      requestedEnd !== null &&
      (Number.isNaN(requestedEnd) || requestedEnd < start)
    ) {
      requestedEnd = null;
    }
    const cappedEnd = start + chunkSize - 1;
    const end =
      requestedEnd === null ? cappedEnd : Math.min(requestedEnd, cappedEnd);
    driveRange = `bytes=${start}-${end}`;
  }

  const key = isSuffix ? null : prefetchKey(fileId, start);
  const cachedEntry = key ? prefetchMap.get(key) : null;
  let result: PrefetchResult | null = null;

  if (cachedEntry) {
    evictPrefetchEntry(key!);
    result = await cachedEntry.promise;
  }

  if (!result) {
    result = await fetchDriveRange(token, fileId, driveRange);
  }

  if (!result) {
    console.error("[video-stream] DRIVE ERROR: files.get returned non-2xx", {
      fileId,
      clientRange: clientRange ?? null,
      driveRange,
    });
    res.status(502).end();
    return;
  }

  if (!isSuffix) {
    const nextStart = start + chunkSize;
    getDriveAccessToken()
      .then((tok) => schedulePrefetch(tok, fileId, nextStart, chunkSize))
      .catch(() => {});
  }

  console.info("[video-stream] OK: streaming Drive file", {
    fileId,
    driveStatus: result.status,
    clientRange: clientRange ?? null,
    driveRange,
    cached: !!cachedEntry,
    bytes: result.data.byteLength,
  });

  res.status(result.status);
  res.setHeader("Accept-Ranges", "bytes");
  if (result.contentRange) res.setHeader("Content-Range", result.contentRange);
  res.setHeader("Content-Length", result.contentLength!);
  res.setHeader("Content-Type", result.contentType!);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Disposition", "inline");
  res.end(result.data);
}
