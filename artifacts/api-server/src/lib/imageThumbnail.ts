/* ════════════════════════════════════════════════════════════════════════
   imageThumbnail.ts — server-side 800×450 WebP thumbnail generator

   Generates a fixed-size thumbnail (800×450, cover crop, WebP q80) from a
   stored image and saves it under /objects/thumbnails/<uuid>.webp.

   Thumbnails are served via GET /api/storage/thumbnails/* which has
   1-year immutable cache headers and skips the community-post DB check,
   making card images load as fast as possible.
   ════════════════════════════════════════════════════════════════════════ */

import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  STORAGE_PROVIDER,
  objectStorageClient,
  parseObjectPath,
} from "./objectStorage";

const TAG = "[img-thumb]";

const THUMB_W = 800;
const THUMB_H = 450;
const THUMB_Q = 80;

function readAll(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function saveThumbnailBuffer(
  svc: ObjectStorageService,
  buf: Buffer,
): Promise<string> {
  const uuid = randomUUID();
  const entityId = `thumbnails/${uuid}.webp`;

  let entityDir = svc.getPrivateObjectDir();
  if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
  const fullPath = `${entityDir}${entityId}`;

  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  if (STORAGE_PROVIDER === "s3") {
    await file.putBuffer(buf, { contentType: "image/webp", metadata: {} });
  } else if (STORAGE_PROVIDER === "local") {
    await file.save(buf);
    try {
      await file.setMetadata({ metadata: {} });
    } catch {
      /* best-effort */
    }
  } else {
    await file.save(buf, {
      resumable: false,
      metadata: { contentType: "image/webp", metadata: {} },
    });
  }

  return `/objects/${entityId}`;
}

/**
 * Generate a 800×450 WebP thumbnail from the stored image at `sourcePath`.
 *
 * @param sourcePath  objectPath of the source image (e.g. /objects/uploads/<uuid>)
 * @returns           objectPath of the new thumbnail, or null if not processable
 */
export async function generateThumbnail(sourcePath: string): Promise<string | null> {
  let sharpMod: typeof import("sharp");
  try {
    sharpMod = await import("sharp");
  } catch {
    console.warn(`${TAG} sharp unavailable — cannot generate thumbnail`);
    return null;
  }

  const svc = new ObjectStorageService();
  let sourceFile: any;
  try {
    sourceFile = await svc.getObjectEntityFile(sourcePath);
  } catch (e) {
    if (e instanceof ObjectNotFoundError) return null;
    throw e;
  }

  let original: Buffer;
  try {
    original = await readAll(sourceFile.createReadStream());
  } catch {
    return null;
  }
  if (original.length === 0) return null;

  let thumbBuf: Buffer;
  try {
    thumbBuf = await sharpMod.default(original, { failOn: "none" })
      .rotate()
      .resize(THUMB_W, THUMB_H, { fit: "cover", position: "centre" })
      .webp({ quality: THUMB_Q })
      .toBuffer();
  } catch {
    return null;
  }

  const thumbPath = await saveThumbnailBuffer(svc, thumbBuf);
  console.log(
    `${TAG} ${sourcePath} → ${thumbPath} (${(thumbBuf.length / 1024).toFixed(0)} KB)`,
  );
  return thumbPath;
}

/**
 * Converts a thumbnail objectPath to the public URL served by the API.
 * e.g. /objects/thumbnails/abc.webp → /api/storage/thumbnails/abc.webp
 */
export function thumbPathToUrl(objectPath: string): string {
  return `/api/storage/thumbnails/${objectPath.replace(/^\/objects\/thumbnails\//, "")}`;
}
