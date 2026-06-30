import type { Request, Response } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

/* ════════════════════════════════════════════════════════════════════════
   Google Drive streaming (server-side, OAuth via Replit connector)
   - The student's browser NEVER contacts Google: we fetch the private file
     bytes here with our connected account's access token and pipe them to the
     custom <video> player. No Drive iframe, no Google login, no cookies.
   - The connector's access token is fetched at runtime (and refreshed by the
     Replit connectors service); we cache it only until shortly before expiry.
   ════════════════════════════════════════════════════════════════════════ */

interface DriveCredentials {
  access_token?: string;
  expires_at?: string;
}

let cached: { token: string; expiresAtMs: number } | null = null;

async function fetchAccessToken(): Promise<{ token: string; expiresAtMs: number }> {
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

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-drive`,
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
      settings?: { access_token?: string; oauth?: { credentials?: DriveCredentials } };
    }>;
  };
  const settings = data.items?.[0]?.settings;
  const creds = settings?.oauth?.credentials;
  const token = creds?.access_token || settings?.access_token;
  if (!token) {
    console.error("[video-stream] TOKEN ERROR: connector returned no access token", {
      itemCount: data.items?.length ?? 0,
    });
    throw new Error("Google Drive is not connected");
  }

  const expiresAtMs = creds?.expires_at
    ? new Date(creds.expires_at).getTime()
    : Date.now() + 5 * 60_000;
  return { token, expiresAtMs };
}

export async function getDriveAccessToken(): Promise<string> {
  // Refresh a minute before expiry to avoid mid-request 401s.
  if (cached && cached.expiresAtMs - 60_000 > Date.now()) return cached.token;
  cached = await fetchAccessToken();
  return cached.token;
}

// Extract a Drive file id from any stored Drive URL form, e.g.:
//   https://drive.google.com/file/d/FILE_ID/preview
//   https://drive.google.com/open?id=FILE_ID
//   https://drive.google.com/uc?id=FILE_ID&export=download
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const byPath = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (byQuery) return byQuery[1];
  const bare = url.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(bare)) return bare;
  return null;
}

// Pipe a Drive file's bytes to the client, honoring HTTP Range so the native
// <video> element can seek. Mirrors Drive's 200/206 + Content-Range response.
export async function streamDriveFile(
  req: Request,
  res: Response,
  fileId: string,
): Promise<void> {
  const token = await getDriveAccessToken();
  const range = req.headers.range;
  const driveHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) driveHeaders.Range = range;

  const driveResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: driveHeaders },
  );

  if (driveResp.status !== 200 && driveResp.status !== 206) {
    const errBody = await driveResp.text().catch(() => "");
    // Surface the REAL reason: 401/403 = token/permission (Google API error),
    // 404 = file not found / no access under this account's scope, else upstream.
    console.error("[video-stream] DRIVE ERROR: files.get returned non-2xx", {
      fileId,
      driveStatus: driveResp.status,
      range: range ?? null,
      reason:
        driveResp.status === 401
          ? "TOKEN/AUTH"
          : driveResp.status === 403
            ? "PERMISSION/SCOPE"
            : driveResp.status === 404
              ? "FILE NOT FOUND / NOT ACCESSIBLE BY CONNECTED ACCOUNT"
              : "UPSTREAM",
      body: errBody.slice(0, 500),
    });
    res.status(driveResp.status === 404 ? 404 : 502).end();
    return;
  }

  console.info("[video-stream] OK: streaming Drive file", {
    fileId,
    driveStatus: driveResp.status,
    range: range ?? null,
    contentType: driveResp.headers.get("content-type"),
    contentLength: driveResp.headers.get("content-length"),
    contentRange: driveResp.headers.get("content-range"),
  });

  res.status(driveResp.status);
  res.setHeader("Accept-Ranges", "bytes");
  for (const h of ["content-length", "content-range"] as const) {
    const v = driveResp.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  // Drive commonly serves private files as application/octet-stream, which
  // iPhone Safari's <video> refuses to play. Only trust an explicit video/*
  // type; otherwise force video/mp4 so the native player accepts the stream.
  const upstreamType = driveResp.headers.get("content-type");
  res.setHeader(
    "Content-Type",
    upstreamType && upstreamType.startsWith("video/") ? upstreamType : "video/mp4",
  );
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Content-Disposition", "inline");

  if (!driveResp.body) {
    console.error("[video-stream] STREAM ERROR: Drive response had no body", {
      fileId,
      driveStatus: driveResp.status,
    });
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(driveResp.body as NodeWebReadableStream<Uint8Array>);
  // Stop pulling bytes from Drive as soon as the client goes away (seek/close).
  res.on("close", () => nodeStream.destroy());
  nodeStream.on("error", (err: unknown) => {
    console.error("[video-stream] STREAM ERROR: pipe from Drive failed", {
      fileId,
      message: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) res.status(502);
    res.end();
  });
  nodeStream.pipe(res);
}
