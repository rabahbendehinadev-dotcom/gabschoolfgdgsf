/* ════════════════════════════════════════════════════════════════════════
   Offline HLS transcoder for course videos.

   For each video part (source MP4 in App Storage at
   `.private/videos/{id}/part-{i}.mp4`):
     1. skip if `.private/hls/{id}/part-{i}/.complete` exists (idempotent)
     2. download the source MP4 to /tmp
     3. one ffmpeg pass → 720p/480p/360p HLS ladder (4s segments, CRF 23
        with per-rendition maxrate caps, keyframe every 4s, fps ≤ 30)
     4. upload segments + skeleton playlists to
        `.private/hls/{id}/part-{i}/{rendition}/`
     5. write the `.complete` marker (JSON rendition metadata)
     6. optionally PUT the rendition metadata to the admin API so the
        video starts serving HLS (`--api-base` + admin credentials)

   Sources are read from /tmp/prod_videos.json (exported from the prod DB).
   The original MP4s are never touched — they remain the fallback.

   Usage (run from artifacts/api-server):
     npx tsx scripts/transcode-hls.ts --ids 10            # pilot one video
     npx tsx scripts/transcode-hls.ts --all               # everything
     npx tsx scripts/transcode-hls.ts --ids 10 --api-base https://<prod-host> \
         --admin-user <u> --admin-pass <p>                # transcode + flag
     npx tsx scripts/transcode-hls.ts --all --flag-only --api-base ...
         # no transcoding; just re-PUT flags for parts already .complete
   ════════════════════════════════════════════════════════════════════════ */
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { objectStorageClient, parseObjectPath } from "../src/lib/objectStorage";
import type { HlsPart, HlsRendition } from "../src/lib/hlsStorage";

const execFileAsync = promisify(execFile);

/* ── CLI args ── */
const args = process.argv.slice(2);
function argValue(name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const ALL = args.includes("--all");
const FLAG_ONLY = args.includes("--flag-only");
const FORCE = args.includes("--force");
const IDS = (argValue("--ids") ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
const API_BASE = argValue("--api-base"); // e.g. https://xxxx.replit.app
const ADMIN_USER = argValue("--admin-user");
const ADMIN_PASS = argValue("--admin-pass");

if (!ALL && IDS.length === 0) {
  console.error("Specify --ids 1,2,3 or --all");
  process.exit(1);
}

/* ── Ladder definition (target height → encoder caps) ── */
const LADDER = [
  { height: 720, maxrateK: 1600, bufsizeK: 3200, audioK: 96, profile: "high", level: "4.0", codecs: "avc1.640028,mp4a.40.2" },
  { height: 480, maxrateK: 900, bufsizeK: 1800, audioK: 96, profile: "main", level: "3.1", codecs: "avc1.4d401f,mp4a.40.2" },
  { height: 360, maxrateK: 500, bufsizeK: 1000, audioK: 64, profile: "main", level: "3.0", codecs: "avc1.4d401e,mp4a.40.2" },
];
const SEG_SECONDS = 4;

type ProdVideo = {
  id: number;
  title: string;
  objectParts: { label?: string; objectPath: string }[] | null;
};

const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "";
if (!PRIVATE_DIR) { console.error("PRIVATE_OBJECT_DIR not set"); process.exit(1); }
const privateBase = PRIVATE_DIR.endsWith("/") ? PRIVATE_DIR.slice(0, -1) : PRIVATE_DIR;

function hlsPartPath(videoId: number, partIndex: number): string {
  return `${privateBase}/hls/${videoId}/part-${partIndex}`;
}

function gcsFile(path: string) {
  const { bucketName, objectName } = parseObjectPath(path);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

async function objectExists(path: string): Promise<boolean> {
  const [exists] = await gcsFile(path).exists();
  return exists;
}

/* ── ffprobe ── */
interface ProbeInfo { width: number; height: number; durationSec: number; fps: number; hasAudio: boolean }
function probe(localPath: string): ProbeInfo {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json",
    "-show_streams", "-show_format", localPath,
  ], { maxBuffer: 32 * 1024 * 1024 }).toString();
  const data = JSON.parse(out) as {
    streams: Array<{ codec_type: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }>;
    format: { duration?: string };
  };
  const v = data.streams.find((s) => s.codec_type === "video");
  if (!v || !v.width || !v.height) throw new Error("no video stream found");
  const rate = v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate || "30/1";
  const [num, den] = rate.split("/").map(Number);
  const fps = den ? num / den : 30;
  return {
    width: v.width,
    height: v.height,
    durationSec: Number(data.format.duration || 0),
    fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
  };
}

/* ── one ffmpeg pass → all renditions ── */
function transcode(srcPath: string, outDir: string, info: ProbeInfo) {
  // Downscale only (tiny tolerance for e.g. 716px sources); if the source is
  // smaller than every rung, encode a single rung at the source height.
  let rungs = LADDER.filter((l) => info.height >= l.height - 8);
  if (rungs.length === 0) {
    const h = Math.max(144, info.height - (info.height % 2));
    rungs = [{ ...LADDER[LADDER.length - 1], height: h }];
  }

  const fps = Math.min(30, info.fps);
  const gop = Math.round(fps * SEG_SECONDS);

  const split = rungs.map((_, i) => `[vs${i}]`).join("");
  const filters = [
    `[0:v]fps=${fps.toFixed(4)},split=${rungs.length}${split}`,
    ...rungs.map((r, i) => `[vs${i}]scale=-2:${Math.min(r.height, info.height - (info.height % 2))}[vo${i}]`),
  ].join(";");

  const cmd: string[] = ["-y", "-i", srcPath, "-filter_complex", filters];
  rungs.forEach((r, i) => {
    cmd.push("-map", `[vo${i}]`);
    if (info.hasAudio) cmd.push("-map", "0:a:0");
    cmd.push(
      `-c:v:${i}`, "libx264",
      `-preset:v:${i}`, "veryfast",
      `-crf:v:${i}`, "23",
      `-maxrate:v:${i}`, `${r.maxrateK}k`,
      `-bufsize:v:${i}`, `${r.bufsizeK}k`,
      `-profile:v:${i}`, r.profile,
      `-level:v:${i}`, r.level,
    );
    if (info.hasAudio) cmd.push(`-c:a:${i}`, "aac", `-b:a:${i}`, `${r.audioK}k`, `-ac:${i}`, "2");
  });
  cmd.push(
    "-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0",
    "-force_key_frames", `expr:gte(t,n_forced*${SEG_SECONDS})`,
    "-f", "hls",
    "-hls_time", String(SEG_SECONDS),
    "-hls_playlist_type", "vod",
    "-hls_list_size", "0",
    "-hls_segment_filename", join(outDir, "%v", "seg-%05d.ts"),
    "-var_stream_map", rungs.map((r, i) => (info.hasAudio ? `v:${i},a:${i},name:${r.height}p` : `v:${i},name:${r.height}p`)).join(" "),
    join(outDir, "%v", "index.m3u8"),
  );

  execFileSync("ffmpeg", cmd, { stdio: ["ignore", "ignore", "inherit"] });
  return rungs;
}

/* ── upload a local directory tree to GCS ── */
async function uploadDir(localDir: string, gcsBase: string): Promise<number> {
  const files: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, relPath);
      else files.push(relPath);
    }
  };
  walk(localDir, "");

  let done = 0;
  const CONCURRENCY = 12;
  let next = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (next < files.length) {
      const rel = files[next++];
      const contentType = rel.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : rel.endsWith(".ts") ? "video/mp2t" : "application/octet-stream";
      const dest = parseObjectPath(`${gcsBase}/${rel}`);
      for (let attempt = 1; ; attempt++) {
        try {
          await objectStorageClient.bucket(dest.bucketName).upload(join(localDir, rel), {
            destination: dest.objectName,
            metadata: { contentType },
            resumable: false,
          });
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      done++;
      if (done % 200 === 0) console.log(`    uploaded ${done}/${files.length}`);
    }
  });
  await Promise.all(workers);
  return files.length;
}

/* ── admin API flag ── */
let adminToken: string | null = null;
async function apiLogin(): Promise<string> {
  if (adminToken) return adminToken;
  const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`admin login failed: HTTP ${res.status}`);
  const data = (await res.json()) as { token: string };
  adminToken = data.token;
  return adminToken;
}

async function putHlsParts(videoId: number, parts: (HlsPart | null)[]): Promise<void> {
  const token = await apiLogin();
  const res = await fetch(`${API_BASE}/api/admin/videos/${videoId}/hls-parts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hlsParts: parts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT hls-parts ${videoId} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

/* ── per-part pipeline ── */
async function processPart(videoId: number, partIndex: number, sourcePath: string): Promise<HlsPart | null> {
  const base = hlsPartPath(videoId, partIndex);
  const markerPath = `${base}/.complete`;

  if (!FORCE && (await objectExists(markerPath))) {
    const [buf] = await gcsFile(markerPath).download();
    try {
      const saved = JSON.parse(buf.toString("utf8")) as HlsPart;
      if (saved?.renditions?.length) {
        console.log(`  part ${partIndex}: already complete (${saved.renditions.map((r) => r.name).join(",")})`);
        return saved;
      }
    } catch { /* corrupt marker → redo */ }
  }
  if (FLAG_ONLY) {
    console.log(`  part ${partIndex}: no .complete marker — skipped (flag-only mode)`);
    return null;
  }

  const work = `/tmp/hls-work/${videoId}-${partIndex}`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "out"), { recursive: true });
  const srcLocal = join(work, "src.mp4");

  console.log(`  part ${partIndex}: downloading source…`);
  await gcsFile(sourcePath).download({ destination: srcLocal });
  const bytes = statSync(srcLocal).size;

  const info = probe(srcLocal);
  console.log(`  part ${partIndex}: ${info.width}x${info.height} ${info.fps.toFixed(1)}fps ${(info.durationSec / 60).toFixed(1)}min ${(bytes / 1024 / 1024).toFixed(0)}MB audio=${info.hasAudio}`);

  const t0 = Date.now();
  const rungs = transcode(srcLocal, join(work, "out"), info);
  console.log(`  part ${partIndex}: transcoded ${rungs.map((r) => `${r.height}p`).join(",")} in ${((Date.now() - t0) / 60000).toFixed(1)}min`);

  // BANDWIDTH must be a peak figure: video maxrate + audio + container overhead.
  const renditions: HlsRendition[] = rungs.map((r) => {
    const h = Math.min(r.height, info.height - (info.height % 2));
    const w = Math.round((h * info.width) / info.height / 2) * 2;
    return {
      name: `${r.height}p`,
      width: w,
      height: h,
      bandwidth: Math.round((r.maxrateK + r.audioK) * 1000 * 1.15),
      codecs: r.codecs,
    };
  });

  const count = await uploadDir(join(work, "out"), base);
  console.log(`  part ${partIndex}: uploaded ${count} objects`);

  const part: HlsPart = { renditions };
  writeFileSync(join(work, "complete.json"), JSON.stringify(part));
  await objectStorageClient.bucket(parseObjectPath(markerPath).bucketName).upload(join(work, "complete.json"), {
    destination: parseObjectPath(markerPath).objectName,
    metadata: { contentType: "application/json" },
    resumable: false,
  });

  rmSync(work, { recursive: true, force: true });
  return part;
}

async function main() {
  const videos = (JSON.parse(readFileSync("/tmp/prod_videos.json", "utf8")) as ProdVideo[])
    .filter((v) => v.objectParts?.length)
    .filter((v) => ALL || IDS.includes(v.id))
    .sort((a, b) => a.id - b.id);

  if (videos.length === 0) { console.error("No matching videos with objectParts"); process.exit(1); }
  console.log(`Processing ${videos.length} video(s)…`);

  const failed: number[] = [];
  for (const v of videos) {
    console.log(`\nvideo ${v.id}: ${v.title.slice(0, 60)}`);
    try {
      const parts: (HlsPart | null)[] = [];
      for (let i = 0; i < v.objectParts!.length; i++) {
        parts.push(await processPart(v.id, i, v.objectParts![i].objectPath));
      }
      if (API_BASE && ADMIN_USER && ADMIN_PASS) {
        if (parts.every((p) => p === null)) {
          console.log("  no completed parts — flag not sent");
        } else {
          await putHlsParts(v.id, parts);
          console.log("  ✓ hls-parts flag set via API");
        }
      } else {
        console.log("  (no --api-base/credentials — flag NOT set)");
      }
    } catch (err) {
      console.error(`  ✗ video ${v.id} FAILED:`, err instanceof Error ? err.message : err);
      failed.push(v.id);
    }
  }

  console.log(`\nDone. ${videos.length - failed.length}/${videos.length} succeeded.`);
  if (failed.length) { console.log(`Failed ids: ${failed.join(",")}`); process.exit(2); }
}

main().catch((e) => { console.error(e); process.exit(1); });
