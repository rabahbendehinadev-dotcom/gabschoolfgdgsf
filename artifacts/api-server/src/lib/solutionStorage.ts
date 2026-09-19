import { objectStorageClient, ObjectStorageService, parseObjectPath, STORAGE_PROVIDER } from "./objectStorage";
import { Readable } from "node:stream";
export { isProtectedSolutionStoragePath } from "./protectedStoragePaths";

const storage = new ObjectStorageService();
export function solutionFile(objectPath: string) {
  if (!/^\/objects\/solutions\/[0-9a-f-]+\.webp$/.test(objectPath)) throw new Error("Invalid solution image path");
  const full = `${storage.getPrivateObjectDir().replace(/\/$/, "")}/${objectPath.slice("/objects/".length)}`;
  // The only explicit opt-in: callers have already checked draft/member/cover access.
  const { bucketName, objectName } = parseObjectPath(full, { allowSolutions: true });
  return objectStorageClient.bucket(bucketName).file(objectName);
}
export async function saveSolutionImage(id: string, data: Buffer) {
  const objectPath = `/objects/solutions/${id}.webp`;
  const file = solutionFile(objectPath);
  if (STORAGE_PROVIDER === "s3") await file.putBuffer(data, { contentType: "image/webp" });
  else await file.save(data, { resumable: false, contentType: "image/webp", metadata: { contentType: "image/webp" } });
  return objectPath;
}
export async function readSolutionImage(objectPath: string): Promise<Buffer> {
  const stream: Readable = solutionFile(objectPath).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}