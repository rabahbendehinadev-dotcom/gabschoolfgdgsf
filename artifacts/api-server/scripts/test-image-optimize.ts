/* اختبار شامل لعامل ضغط الصور: يرفع صورة PNG ضخمة، يسجلها كصورة قسم مؤقت،
   يشغّل دورة الضغط، يتحقق من النتيجة، ثم ينظف كل شيء. */
import sharp from "sharp";
import { db, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { runImageOptimizePass, extractObjectPath } from "../src/lib/imageOptimize";

async function main() {
  // 0. اختبارات استخراج المسار
  const cases: Array<[string | null, string | null]> = [
    ["/api/storage/objects/uploads/abc-123", "/objects/uploads/abc-123"],
    ["/objects/uploads/xyz", "/objects/uploads/xyz"],
    ["https://online.gab-school.com/api/storage/objects/uploads/q1", "/objects/uploads/q1"],
    ["http://localhost:3000/api/storage/objects/uploads/q2", "/objects/uploads/q2"],
    ["https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", null],
    ["", null],
    [null, null],
    ["/objects/", null],
  ];
  for (const [input, expected] of cases) {
    const got = extractObjectPath(input);
    if (got !== expected) throw new Error(`extractObjectPath(${input}) = ${got}, expected ${expected}`);
  }
  console.log("✓ extractObjectPath: all cases pass");

  // 1. توليد صورة كبيرة (2400x1600 PNG بضوضاء — تضغط جيداً إلى WebP)
  const noise = Buffer.alloc(2400 * 1600 * 3);
  for (let i = 0; i < noise.length; i += 3) {
    const v = Math.floor(128 + 100 * Math.sin(i / 5000) + (i % 37));
    noise[i] = v & 255; noise[i + 1] = (v * 2) & 255; noise[i + 2] = (v * 3) & 255;
  }
  const bigPng = await sharp(noise, { raw: { width: 2400, height: 1600, channels: 3 } })
    .png()
    .toBuffer();
  console.log(`✓ generated test PNG: ${(bigPng.length / 1024).toFixed(0)}KB`);

  // 2. رفع عبر presigned URL (نفس مسار الرفع الحقيقي)
  const svc = new ObjectStorageService();
  const uploadURL = await svc.getObjectEntityUploadURL();
  const objectPath = svc.normalizeObjectEntityPath(uploadURL);
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(bigPng),
  });
  if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`);
  console.log(`✓ uploaded to ${objectPath}`);

  // 3. صف قسم مؤقت يشير إليها
  const [row] = await db
    .insert(categoriesTable)
    .values({
      name: "__IMG_OPT_TEST__",
      slug: `img-opt-test-${Date.now()}`,
      imageUrl: `/api/storage${objectPath}`,
      isVisible: false,
    } as typeof categoriesTable.$inferInsert)
    .returning({ id: categoriesTable.id });
  console.log(`✓ temp category #${row.id}`);

  try {
    // 4. دورة الضغط
    await runImageOptimizePass();

    // 5. تحقق
    const file = await svc.getObjectEntityFile(objectPath);
    const [meta] = await file.getMetadata();
    const newSize = Number((meta as any).size || 0);
    const ct = String((meta as any).contentType || "");
    const flag = ((meta as any).metadata ?? {})["gab-optimized"];
    console.log(`  after: size=${(newSize / 1024).toFixed(0)}KB contentType=${ct} flag=${flag}`);
    if (newSize >= bigPng.length) throw new Error("size did not shrink!");
    if (!ct.includes("webp")) throw new Error(`contentType is ${ct}, expected webp`);
    if (flag !== "1") throw new Error("gab-optimized flag not set");

    // الأبعاد يجب أن تكون ≤1280
    const chunks: Buffer[] = [];
    for await (const c of (file as any).createReadStream()) chunks.push(c);
    const outMeta = await sharp(Buffer.concat(chunks)).metadata();
    console.log(`  dims: ${outMeta.width}x${outMeta.height} format=${outMeta.format}`);
    if ((outMeta.width ?? 9999) > 1280 || (outMeta.height ?? 9999) > 1280)
      throw new Error("dimensions not capped at 1280");

    // 6. الدورة الثانية يجب أن تتخطاها (idempotent)
    await runImageOptimizePass();
    const [meta2] = await file.getMetadata();
    if (Number((meta2 as any).size) !== newSize) throw new Error("second pass modified the file!");
    console.log("✓ second pass idempotent (skipped)");

    console.log("\n✅ ALL TESTS PASSED");
  } finally {
    // 7. تنظيف
    await db.delete(categoriesTable).where(eq(categoriesTable.id, row.id));
    try {
      const file = await svc.getObjectEntityFile(objectPath);
      await (file as any).delete();
    } catch { /* ignore */ }
    console.log("✓ cleanup done");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ TEST FAILED:", e);
  process.exit(1);
});
