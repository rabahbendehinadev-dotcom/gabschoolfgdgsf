import { readFileSync } from "node:fs";
import { objectStorageClient, parseObjectPath } from "../src/lib/objectStorage";
import { getDriveAccessToken, extractDriveFileId, resolveVideoParts } from "../src/lib/googleDrive";

interface ProdVideo {
  id: number;
  title: string;
  objectParts: Array<{ label: string; objectPath: string }>;
  driveParts: Array<{ label?: string; url?: string }> | null;
  driveEmbedUrl: string | null;
}

async function driveFileSize(token: string, fileId: string): Promise<number | null> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=size,name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) return null;
  const meta = (await resp.json()) as { size?: string };
  return meta.size ? parseInt(meta.size, 10) : null;
}

async function gcsSize(objectPath: string): Promise<number | null> {
  try {
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const [meta] = await objectStorageClient.bucket(bucketName).file(objectName).getMetadata();
    return meta.size ? parseInt(String(meta.size), 10) : null;
  } catch {
    return null;
  }
}

async function main() {
  const videos: ProdVideo[] = JSON.parse(readFileSync("/tmp/prod_videos.json", "utf8"));
  const token = await getDriveAccessToken();

  let okCount = 0;
  const problems: string[] = [];

  for (const v of videos) {
    const partsList = resolveVideoParts({
      driveEmbedUrl: v.driveEmbedUrl ?? "",
      driveParts: v.driveParts ? JSON.stringify(v.driveParts) : null,
    });

    for (let i = 0; i < v.objectParts.length; i++) {
      const op = v.objectParts[i];
      const gSize = await gcsSize(op.objectPath);
      if (gSize === null) {
        problems.push(`Video ${v.id} part ${i}: GCS OBJECT MISSING (${op.objectPath})`);
        continue;
      }
      const drivePart = partsList[i];
      const fileId = drivePart ? extractDriveFileId(drivePart.url) : null;
      if (!fileId) {
        problems.push(`Video ${v.id} part ${i}: no drive source to compare (gcs=${gSize})`);
        continue;
      }
      const dSize = await driveFileSize(token, fileId);
      if (dSize === null) {
        problems.push(`Video ${v.id} part ${i}: Drive meta fetch failed (gcs=${gSize})`);
        continue;
      }
      if (gSize !== dSize) {
        const pct = ((gSize / dSize) * 100).toFixed(1);
        problems.push(
          `Video ${v.id} "${v.title.slice(0, 40)}" part ${i}: TRUNCATED — GCS ${gSize} vs Drive ${dSize} (${pct}%)`,
        );
      } else {
        okCount++;
      }
    }
  }

  console.log(`\n===== INTEGRITY REPORT =====`);
  console.log(`OK parts: ${okCount}`);
  console.log(`Problems: ${problems.length}`);
  for (const p of problems) console.log("  ✗ " + p);
  process.exit(0);
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
