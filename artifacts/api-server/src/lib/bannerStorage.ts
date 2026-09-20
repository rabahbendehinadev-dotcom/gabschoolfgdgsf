import { randomUUID } from "node:crypto";
import { objectStorageClient, parseObjectPath, STORAGE_PROVIDER, ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();
const BANNER_PATH = /^\/objects\/banners\/([0-9a-f-]+)\/(desktop|mobile)-([0-9a-f-]+)\.webp$/;

export function bannerFile(objectPath: string) {
  if (!BANNER_PATH.test(objectPath)) throw new Error("Invalid banner image path");
  const full = `${storage.getPrivateObjectDir().replace(/\/$/, "")}/${objectPath.slice("/objects/".length)}`;
  const { bucketName, objectName } = parseObjectPath(full);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export async function saveBannerImage(id: number, variant: "desktop" | "mobile", data: Buffer): Promise<string> {
  const objectPath = `/objects/banners/${id}/${variant}-${randomUUID()}.webp`;
  const file = bannerFile(objectPath);
  if (STORAGE_PROVIDER === "s3") await file.putBuffer(data, { contentType: "image/webp" });
  else await file.save(data, { resumable: false, contentType: "image/webp", metadata: { contentType: "image/webp" } });
  return objectPath;
}

export async function readBannerImage(objectPath: string): Promise<{ data: Buffer; contentType: string }> {
  // Resolve and download through the shared adapter. This is important for
  // Replit GCS, S3, and local storage: provider File implementations do not
  // all expose identical stream/error semantics.
  const file = await storage.getObjectEntityFile(objectPath);
  const response = await storage.downloadObject(file, 300);
  return {
    data: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "image/webp",
  };
}

export async function deleteBannerImage(objectPath: string | null | undefined): Promise<void> {
  if (!objectPath) return;
  const file = bannerFile(objectPath);
  await file.delete({ ignoreNotFound: true });
}