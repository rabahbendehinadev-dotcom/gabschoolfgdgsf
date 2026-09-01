/* ════════════════════════════════════════════════════════════════════════
   Background 720p transcode worker

   Creates a lightweight 720p copy of every Drive-hosted video part and
   stores the copy BACK IN GOOGLE DRIVE (folder "GAB-720P"), then records
   the copy's file id in videos.low_parts. The player streams the 720p
   copy by default (via /stream/:part?q=low) with a toggle for original.

   Design (VPS-only, gated by ENABLE_DRIVE_TRANSCODE=true):
   - single sequential worker; initial delay then rescan every 30 min
   - write-scope probe at start: on 403 the loop STOPS with clear guidance
   - skip parts that are already small (≤720p short side OR <5 Mbps)
   - chunked 64MB download (fresh token per chunk — survives token expiry)
   - ffmpeg via `nice -n 15`, capped threads — never starves live streams
   - Drive resumable upload (64MB PUTs)
   - idempotent across restarts: adopts an existing "video{id}-part{i}.mp4"
     in the Drive folder instead of re-transcoding; temp dir cleaned on boot
   ════════════════════════════════════════════════════════════════════════ */

import { spawn } from "child_process";
import { createWriteStream } from "fs";
import * as fsp from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { db, videosTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  getDriveAccessToken,
  resolveVideoParts,
  extractDriveFileId,
} from "./googleDrive";

const TAG = "[transcode-720p]";
const FOLDER_NAME = "GAB-720P";
const DOWNLOAD_CHUNK = 64 * 1024 * 1024; // 64 MB
const UPLOAD_CHUNK = 64 * 1024 * 1024; // multiple of 256 KB
const RESCAN_MS = 30 * 60_000;
const INITIAL_DELAY_MS = 2 * 60_000;
const MIN_FREE_EXTRA = 8 * 1024 * 1024 * 1024; // src + 8 GB headroom
const SKIP_BITRATE_BPS = 5_000_000; // already light enough
const requestedVideoIds = new Set<number>();
let wakeWorker: (() => void) | null = null;

export type LowPartEntry =
  | { fileId: string; size: number }
  | { skipped: true; reason: string }
  | null;

export function parseLowParts(raw: string | null): LowPartEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LowPartEntry[]) : null;
  } catch {
    return null;
  }
}

/** Wake the production worker after an admin adds or changes a Drive source. */
export function requestDriveTranscode(videoId: number): void {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DRIVE_TRANSCODE !== "true" ||
    !Number.isInteger(videoId) ||
    videoId <= 0
  ) {
    return;
  }
  requestedVideoIds.add(videoId);
  console.log(`${TAG} video ${videoId}: queued after Drive source update`);
  wakeWorker?.();
}

/**
 * Best-effort deletion of stale 720p Drive copies. Called by the admin video
 * update route when the source (driveParts/driveEmbedUrl) changes so the
 * worker can't re-adopt an outdated copy by name on its next pass.
 */
export function deleteLowCopiesBestEffort(raw: string | null): void {
  const entries = parseLowParts(raw);
  if (!entries) return;
  void (async () => {
    for (const e of entries) {
      if (e && "fileId" in e && e.fileId) {
        await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${e.fileId}?supportsAllDrives=true`,
          { method: "DELETE" },
        )
          .then((r) => {
            if (!r.ok && r.status !== 404) {
              console.warn(`${TAG} stale copy ${e.fileId}: delete returned ${r.status}`);
            }
          })
          .catch(() => {});
      }
    }
  })();
}

function tmpRoot(): string {
  // /app/data is the persisted volume on the VPS; fall back to os tmp in dev.
  return process.env.NODE_ENV === "production"
    ? "/app/data/transcode-tmp"
    : join(tmpdir(), "transcode-tmp");
}

/* ── Drive helpers ────────────────────────────────────────────────────── */

async function driveFetch(
  path: string,
  init: RequestInit = {},
): Promise<globalThis.Response> {
  const token = await getDriveAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

/** One tiny upload+delete to prove the token has write scope. */
async function probeWriteAccess(): Promise<
  { ok: true } | { ok: false; status: number; body: string }
> {
  const boundary = "gabProbeBoundary";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: "gab-transcode-probe.txt" }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\nprobe\r\n--${boundary}--`;
  const r = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (r.status === 200 || r.status === 201) {
    const j = (await r.json()) as { id?: string };
    if (j.id) {
      await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${j.id}?supportsAllDrives=true`,
        { method: "DELETE" },
      ).catch(() => {});
    }
    return { ok: true };
  }
  const text = await r.text().catch(() => "");
  return { ok: false, status: r.status, body: text.slice(0, 400) };
}

async function findOrCreateFolder(): Promise<string> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const list = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  const data = (await list.json()) as { files?: Array<{ id: string }> };
  if (data.files?.[0]?.id) return data.files[0].id;

  const create = await driveFetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    },
  );
  if (!create.ok) {
    throw new Error(`create folder failed (${create.status})`);
  }
  const created = (await create.json()) as { id: string };
  return created.id;
}

async function findExistingCopy(
  folderId: string,
  name: string,
): Promise<{ id: string; size: number } | null> {
  const q = encodeURIComponent(
    `name='${name}' and '${folderId}' in parents and trashed=false`,
  );
  const r = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,size)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  const data = (await r.json()) as {
    files?: Array<{ id: string; size?: string }>;
  };
  const f = data.files?.[0];
  if (!f) return null;
  const size = Number(f.size ?? 0);
  if (!size) {
    // zero-byte leftover from a crashed upload — remove and redo
    await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`,
      { method: "DELETE" },
    ).catch(() => {});
    return null;
  }
  return { id: f.id, size };
}

interface SourceMeta {
  size: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

async function getSourceMeta(fileId: string): Promise<SourceMeta | null> {
  const r = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=size,videoMediaMetadata(durationMillis,width,height)&supportsAllDrives=true`,
  );
  if (!r.ok) return null;
  const j = (await r.json()) as {
    size?: string;
    videoMediaMetadata?: {
      durationMillis?: string;
      width?: number;
      height?: number;
    };
  };
  if (!j.size) return null;
  return {
    size: Number(j.size),
    durationMs: j.videoMediaMetadata?.durationMillis
      ? Number(j.videoMediaMetadata.durationMillis)
      : null,
    width: j.videoMediaMetadata?.width ?? null,
    height: j.videoMediaMetadata?.height ?? null,
  };
}

/** Chunked download with a fresh token per chunk (survives 1h token life). */
async function downloadDriveFile(
  fileId: string,
  size: number,
  destPath: string,
): Promise<void> {
  await fsp.rm(destPath, { force: true });
  let offset = 0;
  while (offset < size) {
    const end = Math.min(offset + DOWNLOAD_CHUNK - 1, size - 1);
    const r = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Range: `bytes=${offset}-${end}` } },
    );
    if ((r.status !== 206 && r.status !== 200) || !r.body) {
      throw new Error(`download chunk failed (${r.status}) at ${offset}`);
    }
    await pipeline(
      Readable.fromWeb(r.body as import("stream/web").ReadableStream),
      createWriteStream(destPath, { flags: "a" }),
    );
    offset = end + 1;
  }
  const st = await fsp.stat(destPath);
  if (st.size !== size) {
    throw new Error(`download incomplete: got ${st.size}, expected ${size}`);
  }
}

function runFfmpeg(srcPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-n",
      "15",
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      srcPath,
      "-vf",
      "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)',fps=30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-maxrate",
      "3.5M",
      "-bufsize",
      "7M",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-threads",
      "2",
      outPath,
    ];
    const child = spawn("nice", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Drive resumable upload from a local file. Returns the new file id. */
async function resumableUpload(
  localPath: string,
  name: string,
  folderId: string,
): Promise<{ id: string; size: number }> {
  const st = await fsp.stat(localPath);
  const total = st.size;

  const initResp = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(total),
      },
      body: JSON.stringify({ name, parents: [folderId], mimeType: "video/mp4" }),
    },
  );
  const sessionUri = initResp.headers.get("location");
  if (!initResp.ok || !sessionUri) {
    throw new Error(`resumable init failed (${initResp.status})`);
  }

  const fh = await fsp.open(localPath, "r");
  try {
    let offset = 0;
    while (offset < total) {
      const end = Math.min(offset + UPLOAD_CHUNK, total);
      const len = end - offset;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, offset);
      const put = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          "Content-Length": String(len),
          "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
        },
        body: buf,
      });
      if (put.status === 308) {
        offset = end;
        continue;
      }
      if (put.status === 200 || put.status === 201) {
        const j = (await put.json()) as { id?: string };
        if (!j.id) throw new Error("upload finished but no file id returned");
        return { id: j.id, size: total };
      }
      const text = await put.text().catch(() => "");
      throw new Error(
        `upload chunk failed (${put.status}) at ${offset}: ${text.slice(0, 200)}`,
      );
    }
    throw new Error("upload loop ended without final response");
  } finally {
    await fh.close();
  }
}

async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function freeDiskBytes(dir: string): Promise<number> {
  try {
    const s = await fsp.statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return Number.MAX_SAFE_INTEGER; // if statfs unsupported, don't block
  }
}

/* ── DB update (conditional — only fills a still-empty slot) ─────────── */

async function saveLowPart(
  videoId: number,
  partIndex: number,
  entry: LowPartEntry,
): Promise<void> {
  const [row] = await db
    .select({ lowParts: videosTable.lowParts })
    .from(videosTable)
    .where(eq(videosTable.id, videoId))
    .limit(1);
  const current = parseLowParts(row?.lowParts ?? null) ?? [];
  if (current[partIndex]) return; // already filled (concurrent/previous run)
  const next = [...current];
  while (next.length <= partIndex) next.push(null);
  next[partIndex] = entry;
  await db
    .update(videosTable)
    .set({ lowParts: JSON.stringify(next), lowError: null })
    .where(eq(videosTable.id, videoId));
}

async function saveLowError(videoId: number, message: string): Promise<void> {
  await db
    .update(videosTable)
    .set({ lowError: message.slice(0, 500) })
    .where(eq(videosTable.id, videoId));
}

/* ── Core: process one part ───────────────────────────────────────────── */

async function processPart(
  videoId: number,
  partIndex: number,
  fileId: string,
  folderId: string,
  workDir: string,
): Promise<void> {
  const copyName = `video${videoId}-part${partIndex}.mp4`;

  // Adopt an existing copy (crash between upload and DB write)
  const existing = await findExistingCopy(folderId, copyName);
  if (existing) {
    console.log(`${TAG} video ${videoId} part ${partIndex}: adopting existing Drive copy ${existing.id}`);
    await saveLowPart(videoId, partIndex, {
      fileId: existing.id,
      size: existing.size,
    });
    return;
  }

  const meta = await getSourceMeta(fileId);
  if (!meta) throw new Error("source metadata unavailable (file deleted?)");

  // Already small enough? (short side ≤ 720 or bitrate < 5 Mbps)
  const shortSide =
    meta.width && meta.height ? Math.min(meta.width, meta.height) : null;
  const bitrate =
    meta.durationMs && meta.durationMs > 0
      ? (meta.size * 8) / (meta.durationMs / 1000)
      : null;
  if (
    (shortSide !== null && shortSide <= 720) ||
    (bitrate !== null && bitrate < SKIP_BITRATE_BPS)
  ) {
    const reason = `already light (${shortSide ?? "?"}p, ${bitrate ? Math.round(bitrate / 1e6) : "?"} Mbps)`;
    console.log(`${TAG} video ${videoId} part ${partIndex}: skipped — ${reason}`);
    await saveLowPart(videoId, partIndex, { skipped: true, reason });
    return;
  }

  const free = await freeDiskBytes(workDir);
  if (free < meta.size + MIN_FREE_EXTRA) {
    throw new Error(
      `not enough disk space (need ~${Math.round((meta.size + MIN_FREE_EXTRA) / 1e9)} GB free, have ${Math.round(free / 1e9)} GB)`,
    );
  }

  const srcPath = join(workDir, `src-${videoId}-${partIndex}.mp4`);
  const outPath = join(workDir, `out-${videoId}-${partIndex}.mp4`);
  const gb = (meta.size / 1073741824).toFixed(2);
  try {
    console.log(`${TAG} video ${videoId} part ${partIndex}: downloading ${gb} GB from Drive…`);
    await downloadDriveFile(fileId, meta.size, srcPath);

    console.log(`${TAG} video ${videoId} part ${partIndex}: transcoding to 720p (this can take a while)…`);
    await runFfmpeg(srcPath, outPath);
    const outSt = await fsp.stat(outPath);
    console.log(`${TAG} video ${videoId} part ${partIndex}: transcoded → ${(outSt.size / 1073741824).toFixed(2)} GB, uploading to Drive…`);

    const uploaded = await resumableUpload(outPath, copyName, folderId);
    await saveLowPart(videoId, partIndex, {
      fileId: uploaded.id,
      size: uploaded.size,
    });
    console.log(`${TAG} ✓ video ${videoId} part ${partIndex}: 720p copy ready (${uploaded.id})`);
  } finally {
    await fsp.rm(srcPath, { force: true }).catch(() => {});
    await fsp.rm(outPath, { force: true }).catch(() => {});
  }
}

/* ── Scan pass over all videos ────────────────────────────────────────── */

/**
 * In-memory failure backoff: a part that keeps failing (e.g. corrupt source,
 * quota) is retried with exponential delay (1h → 2h → 4h → 8h → 16h, capped)
 * instead of re-downloading a multi-GB file every 30-minute pass.
 */
const partFailures = new Map<string, { count: number; nextAttemptAt: number }>();
const MAX_BACKOFF_EXP = 5;

function recordPartFailure(key: string): void {
  const count = (partFailures.get(key)?.count ?? 0) + 1;
  const delay = RESCAN_MS * 2 ** Math.min(count, MAX_BACKOFF_EXP);
  partFailures.set(key, { count, nextAttemptAt: Date.now() + delay });
  console.warn(
    `${TAG} ${key}: failure #${count}, next retry in ~${Math.round(delay / 60000)} min`,
  );
}

async function runPass(folderId: string, workDir: string): Promise<{
  processed: number;
  pending: number;
}> {
  let videos = await db
    .select({
      id: videosTable.id,
      title: videosTable.title,
      driveEmbedUrl: videosTable.driveEmbedUrl,
      driveParts: videosTable.driveParts,
      lowParts: videosTable.lowParts,
    })
    .from(videosTable)
    .orderBy(videosTable.id);

  if (requestedVideoIds.size > 0) {
    const requested = new Set(requestedVideoIds);
    requestedVideoIds.clear();
    videos = videos.filter((video) => requested.has(video.id));
  }

  let processed = 0;
  let pending = 0;
  for (const video of videos) {
    const parts = resolveVideoParts({
      driveEmbedUrl: video.driveEmbedUrl,
      driveParts: video.driveParts,
    });
    const low = parseLowParts(video.lowParts) ?? [];
    for (let i = 0; i < parts.length; i++) {
      if (low[i]) continue;
      const fileId = extractDriveFileId(parts[i].url);
      if (!fileId) continue;
      const failKey = `video ${video.id} part ${i}`;
      const fail = partFailures.get(failKey);
      if (fail && Date.now() < fail.nextAttemptAt) {
        pending++; // still in backoff — skip this pass
        continue;
      }
      pending++;
      try {
        await processPart(video.id, i, fileId, folderId, workDir);
        processed++;
        pending--;
        partFailures.delete(failKey);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG} ✗ ${failKey} failed: ${msg}`);
        recordPartFailure(failKey);
        await saveLowError(video.id, msg).catch(() => {});
      }
    }
  }
  return { processed, pending };
}

/* ── Entry point (called from index.ts at boot) ───────────────────────── */

export function startDriveTranscodeWorker(): void {
  void (async () => {
    try {
      const workDir = tmpRoot();
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(workDir, { recursive: true });

      if (!(await hasFfmpeg())) {
        console.error(`${TAG} STOPPED: ffmpeg not found in this image. Rebuild with the updated Dockerfile (apt-get install ffmpeg).`);
        return;
      }

      await new Promise((r) => setTimeout(r, INITIAL_DELAY_MS));

      const probe = await probeWriteAccess();
      if (!probe.ok) {
        console.error(
          `${TAG} STOPPED: Google Drive token has NO WRITE permission (status ${probe.status}).\n` +
            `${TAG} The 720p worker needs a refresh token with the full "https://www.googleapis.com/auth/drive" scope.\n` +
            `${TAG} Re-mint GOOGLE_DRIVE_REFRESH_TOKEN with that scope, update the Dokploy env, redeploy, and this worker will start automatically.\n` +
            `${TAG} صلاحية Google Drive الحالية للقراءة فقط — يجب إنشاء رمز جديد بصلاحية كاملة حتى يستطيع السيرفر رفع نسخ 720p.\n` +
            `${TAG} details: ${probe.body}`,
        );
        return;
      }

      const folderId = await findOrCreateFolder();
      console.log(`${TAG} Worker started. Drive folder "${FOLDER_NAME}" = ${folderId}. Scanning every ${RESCAN_MS / 60000} min.`);

      for (;;) {
        try {
          const { processed, pending } = await runPass(folderId, workDir);
          if (processed > 0 || pending > 0) {
            console.log(`${TAG} Pass complete: ${processed} part(s) done, ${pending} failed/pending (will retry next pass).`);
          } else {
            console.log(`${TAG} Pass complete: all videos have 720p copies. ✓`);
          }
        } catch (err) {
          console.error(`${TAG} Pass error:`, err instanceof Error ? err.message : err);
        }
        if (requestedVideoIds.size > 0) continue;
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, RESCAN_MS)),
          new Promise<void>((resolve) => {
            wakeWorker = resolve;
          }),
        ]);
        wakeWorker = null;
      }
    } catch (err) {
      console.error(`${TAG} Fatal worker error:`, err instanceof Error ? err.message : err);
    }
  })();
}
