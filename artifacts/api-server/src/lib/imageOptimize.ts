/* ════════════════════════════════════════════════════════════════════════
   Background image optimizer worker

   Old thumbnails/covers were uploaded at full size (multi-MB PNGs) before
   client-side compression existed, making first paint painfully slow for
   visitors. This worker recompresses every stored image referenced by the
   DB (videos.thumbnail_url, categories.image_url, playlists.image_url,
   tools.image_url) IN PLACE: max 1280px, WebP q82.

   Design:
   - object paths are immutable UUIDs → overwriting in place keeps every
     stored URL working; browsers/SW that cached the old bytes are fine.
   - idempotent: optimized objects are tagged with metadata gab:optimized=1
     so later passes only do a cheap metadata HEAD per image.
   - skips SVG/GIF (animation/vector), already-small files, non-images and
     cases where WebP wouldn't save at least ~10%.
   - preserves existing custom metadata (custom:aclPolicy) on overwrite.
   - sequential with small pauses — never competes with live traffic.
   ════════════════════════════════════════════════════════════════════════ */

import { Readable } from "stream";
import { db, videosTable, categoriesTable, playlistsTable, toolsTable } from "@workspace/db";
import { isNull, or } from "drizzle-orm";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  STORAGE_PROVIDER,
} from "./objectStorage";
import { generateThumbnail, thumbPathToUrl } from "./imageThumbnail";

const TAG = "[img-optimize]";
const MAX_DIM = 800;
const WEBP_QUALITY = 82;
const MIN_SIZE_BYTES = 80 * 1024; // below this, not worth touching
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // above this it's not a thumbnail — don't buffer into RAM
const MIN_GAIN_RATIO = 0.9; // new bytes must be < 90% of original
const INITIAL_DELAY_MS = 90_000;
const RESCAN_MS = 6 * 60 * 60_000; // 6h — catches images uploaded without client compression
const PAUSE_BETWEEN_MS = 300;

const OPTIMIZED_FLAG = "gab-optimized";

let started = false;

/** يستخرج مسار /objects/... من أي صيغة مخزنة (نسبي، /api/storage/...، أو URL كامل) */
export function extractObjectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.trim();
  if (!p) return null;
  try {
    const u = new URL(p);
    p = u.pathname;
  } catch {
    /* already a relative path */
  }
  const idx = p.indexOf("/objects/");
  if (idx === -1) return null;
  const objectPath = p.slice(idx);
  return objectPath.length > "/objects/".length ? objectPath : null;
}

async function collectImagePaths(): Promise<string[]> {
  const raws: (string | null)[] = [];

  const vids = await db.select({ u: videosTable.thumbnailUrl }).from(videosTable);
  raws.push(...vids.map((r) => r.u));

  const cats = await db.select({ u: categoriesTable.imageUrl }).from(categoriesTable);
  raws.push(...cats.map((r) => r.u));

  const pls = await db.select({ u: playlistsTable.imageUrl }).from(playlistsTable);
  raws.push(...pls.map((r) => r.u));

  const tools = await db.select({ u: toolsTable.imageUrl }).from(toolsTable);
  raws.push(...tools.map((r) => r.u));

  const unique = new Set<string>();
  for (const raw of raws) {
    const p = extractObjectPath(raw);
    if (p) unique.add(p);
  }
  return Array.from(unique);
}

function readAll(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/** يعيد كتابة الملف في نفس المسار مع الحفاظ على الميتاداتا المخصّصة */
async function overwriteObject(
  file: any,
  buf: Buffer,
  contentType: string,
  customMeta: Record<string, string>,
): Promise<void> {
  if (STORAGE_PROVIDER === "local") {
    await file.save(buf);
    await file.setMetadata({ metadata: customMeta });
    return;
  }

  if (STORAGE_PROVIDER === "s3") {
    // putBuffer ينتظر اكتمال الرفع فعلياً — createWriteStream يُنهي "finish"
    // قبل وصول البايتات إلى MinIO فيخفي أخطاء الرفع
    await file.putBuffer(buf, { contentType, metadata: customMeta });
    return;
  }

  // GCS (Replit sidecar)
  await file.save(buf, {
    resumable: false,
    metadata: { contentType, metadata: customMeta },
  });
}

type Outcome = "optimized" | "skipped" | "failed";

async function optimizeOne(
  svc: ObjectStorageService,
  sharp: typeof import("sharp"),
  objectPath: string,
): Promise<Outcome> {
  let file: any;
  try {
    file = await svc.getObjectEntityFile(objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return "skipped"; // dangling reference
    throw err;
  }

  const [meta] = await file.getMetadata();
  const size = Number((meta as any)?.size || 0);
  const contentType = String((meta as any)?.contentType || "");
  const customMeta: Record<string, string> = {
    ...(((meta as any)?.metadata as Record<string, string>) ?? {}),
  };

  if (customMeta[OPTIMIZED_FLAG] === "1") return "skipped";
  if (/svg|gif/i.test(contentType)) return "skipped";
  // ملف معروف النوع وليس صورة (فيديو/PDF...) — لا نحمّله في الذاكرة أصلاً
  if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream")
    return "skipped";
  if (size > 0 && size < MIN_SIZE_BYTES) return "skipped";
  if (size > MAX_SIZE_BYTES) return "skipped"; // حماية الذاكرة — ليس ملف صورة مصغّرة

  const original = await readAll(file.createReadStream());
  if (original.length < MIN_SIZE_BYTES || original.length > MAX_SIZE_BYTES) return "skipped";

  let optimized: Buffer;
  try {
    const img = sharp.default(original, { failOn: "none" });
    const info = await img.metadata();
    // ملفات ليست صوراً (PDF مثلاً) أو صيغ متحركة — لا نلمسها
    if (!info.format || info.format === "gif" || info.format === "svg") return "skipped";
    if ((info.pages ?? 1) > 1) return "skipped"; // متحرك
    optimized = await sharp
      .default(original, { failOn: "none" })
      .rotate()
      .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return "skipped"; // ليست صورة قابلة للمعالجة
  }

  const flaggedMeta = { ...customMeta, [OPTIMIZED_FLAG]: "1" };

  if (optimized.length >= original.length * MIN_GAIN_RATIO) {
    // لا مكسب حقيقي — نعلّمها فقط حتى لا نعيد تنزيلها في كل دورة
    try {
      await file.setMetadata({ metadata: flaggedMeta });
    } catch {
      /* best-effort */
    }
    return "skipped";
  }

  await overwriteObject(file, optimized, "image/webp", flaggedMeta);
  console.log(
    `${TAG} ${objectPath}: ${(original.length / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB webp`,
  );
  return "optimized";
}

export async function runImageOptimizePass(): Promise<void> {
  let sharpMod: typeof import("sharp");
  try {
    sharpMod = await import("sharp");
  } catch (err) {
    console.error(`${TAG} sharp unavailable — worker disabled:`, err);
    throw err;
  }

  const svc = new ObjectStorageService();
  const paths = await collectImagePaths();
  if (paths.length === 0) {
    console.log(`${TAG} no stored images referenced by DB — nothing to do.`);
    return;
  }

  console.log(`${TAG} pass started: ${paths.length} stored image(s) to check.`);
  let optimized = 0;
  let failed = 0;

  for (const p of paths) {
    try {
      const outcome = await optimizeOne(svc, sharpMod, p);
      if (outcome === "optimized") optimized++;
    } catch (err) {
      failed++;
      console.warn(`${TAG} ${p}: failed —`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
  }

  console.log(
    `${TAG} pass complete: ${optimized} optimized, ${paths.length - optimized - failed} skipped, ${failed} failed.`,
  );

  // ── Retroactive thumbnail generation ──────────────────────────────────
  // For every category/playlist that has an imageUrl but no thumbnailUrl yet,
  // generate an 800×450 WebP thumbnail and store the URL in the DB.
  await runThumbnailBackfillPass();
}

async function runThumbnailBackfillPass(): Promise<void> {
  const TAG2 = "[thumb-backfill]";

  // Fetch categories without thumbnail
  const catsNeedingThumb = await db
    .select({ id: categoriesTable.id, imageUrl: categoriesTable.imageUrl })
    .from(categoriesTable)
    .where(isNull((categoriesTable as any).thumbnailUrl));

  const plsNeedingThumb = await db
    .select({ id: playlistsTable.id, imageUrl: playlistsTable.imageUrl })
    .from(playlistsTable)
    .where(isNull((playlistsTable as any).thumbnailUrl));

  const catCandidates = catsNeedingThumb.filter(r => !!r.imageUrl);
  const plsCandidates = plsNeedingThumb.filter(r => !!r.imageUrl);

  if (catCandidates.length + plsCandidates.length === 0) {
    console.log(`${TAG2} all records already have thumbnails.`);
    return;
  }

  console.log(`${TAG2} generating thumbnails for ${catCandidates.length} categories + ${plsCandidates.length} playlists.`);

  for (const cat of catCandidates) {
    const sourcePath = extractObjectPath(cat.imageUrl);
    if (!sourcePath) continue;
    try {
      const thumbPath = await generateThumbnail(sourcePath);
      if (thumbPath) {
        const thumbUrl = thumbPathToUrl(thumbPath);
        await db.update(categoriesTable)
          .set({ thumbnailUrl: thumbUrl } as any)
          .where(eq(categoriesTable.id, cat.id));
        console.log(`${TAG2} category ${cat.id} → ${thumbUrl}`);
      }
    } catch (err) {
      console.warn(`${TAG2} category ${cat.id} failed:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
  }

  for (const pl of plsCandidates) {
    const sourcePath = extractObjectPath(pl.imageUrl);
    if (!sourcePath) continue;
    try {
      const thumbPath = await generateThumbnail(sourcePath);
      if (thumbPath) {
        const thumbUrl = thumbPathToUrl(thumbPath);
        await db.update(playlistsTable)
          .set({ thumbnailUrl: thumbUrl } as any)
          .where(eq(playlistsTable.id, pl.id));
        console.log(`${TAG2} playlist ${pl.id} → ${thumbUrl}`);
      }
    } catch (err) {
      console.warn(`${TAG2} playlist ${pl.id} failed:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
  }

  console.log(`${TAG2} done.`);
}

export function startImageOptimizeWorker(): void {
  if (started) return;
  started = true;

  console.log(`${TAG} worker scheduled (first pass in ${INITIAL_DELAY_MS / 1000}s, rescan every ${RESCAN_MS / 3_600_000}h).`);

  const loop = async () => {
    try {
      await runImageOptimizePass();
    } catch (err) {
      console.error(`${TAG} pass aborted:`, err instanceof Error ? err.message : err);
      return; // sharp missing or fatal — don't reschedule
    }
    setTimeout(loop, RESCAN_MS);
  };

  setTimeout(loop, INITIAL_DELAY_MS);
}
