#!/usr/bin/env tsx
/**
 * export-storage-sdk.ts
 * تحميل كل ملفات Replit Object Storage إلى مجلد محلي.
 *
 * Usage (on Replit shell):
 *   npx tsx artifacts/api-server/scripts/export-storage-sdk.ts [output_dir] [bucket_id]
 *
 * Example:
 *   npx tsx artifacts/api-server/scripts/export-storage-sdk.ts ./storage-export
 */

import { Storage } from "@google-cloud/storage";
import { mkdirSync, createWriteStream } from "fs";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";

const SIDECAR = "http://127.0.0.1:1106";

const outputDir = process.argv[2] ?? "./storage-export";
const bucketId =
  process.argv[3] ?? process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

if (!bucketId) {
  console.error(
    "❌  Bucket ID not found.\n" +
      "    Pass it as argument or set DEFAULT_OBJECT_STORAGE_BUCKET_ID env var.\n" +
      "    Usage: npx tsx export-storage-sdk.ts ./storage-export <BUCKET_ID>",
  );
  process.exit(1);
}

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function main() {
  console.log(`🪣  Bucket : ${bucketId}`);
  console.log(`📁  Output : ${outputDir}\n`);

  const bucket = storage.bucket(bucketId);

  // List all objects
  console.log("🔍  Listing objects…");
  const [files] = await bucket.getFiles();
  console.log(`    Found ${files.length} object(s)\n`);

  if (files.length === 0) {
    console.log("✅  Nothing to export.");
    return;
  }

  let done = 0;
  let failed = 0;

  for (const file of files) {
    const localPath = join(outputDir, file.name);
    mkdirSync(dirname(localPath), { recursive: true });

    try {
      const readStream = file.createReadStream();
      const writeStream = createWriteStream(localPath);
      await pipeline(readStream, writeStream);
      done++;
      const pct = Math.round((done / files.length) * 100);
      process.stdout.write(`\r    [${pct}%] ${done}/${files.length} — ${file.name.slice(-60)}`);
    } catch (err) {
      failed++;
      console.error(
        `\n⚠️   Failed: ${file.name} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\n\n✅  Done: ${done} downloaded, ${failed} failed.`);
  console.log(`📦  Files saved to: ${outputDir}`);

  if (failed === 0) {
    console.log("\n🚀  Next step:");
    console.log(
      "    rsync -avz --progress ./storage-export/ user@your-vps:/app/storage-export/",
    );
  } else {
    console.log(
      `\n⚠️   ${failed} file(s) failed. Check errors above and retry.`,
    );
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
