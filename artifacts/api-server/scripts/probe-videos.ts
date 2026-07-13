// Diagnostic: probe production GCS video objects for moov atom position and
// basic stats. Reads /tmp/prod_videos.json (exported from prod DB), signs
// URLs for a sample of objects, scans top-level MP4 atoms from the first
// bytes, and writes presigned URLs to /tmp/probe_urls.json for ffprobe.
import { readFileSync, writeFileSync } from "node:fs";
import { getSignedVideoURL } from "../src/lib/videoStorage";

type ProdVideo = {
  id: number;
  title: string;
  objectParts: { objectPath: string }[] | null;
};

async function scanAtoms(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Range: "bytes=0-65535" } });
  if (!res.ok && res.status !== 206) return `HTTP ${res.status}`;
  const buf = Buffer.from(await res.arrayBuffer());
  const atoms: string[] = [];
  let off = 0;
  while (off + 8 <= buf.length && atoms.length < 6) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (!/^[a-zA-Z0-9 ]{4}$/.test(type)) break;
    if (size === 1) {
      if (off + 16 > buf.length) { atoms.push(`${type}(64bit)`); break; }
      size = Number(buf.readBigUInt64BE(off + 8));
    }
    atoms.push(`${type}:${size}`);
    if (size <= 0) break;
    off += size;
  }
  return atoms.join(" → ");
}

async function main() {
  const raw = JSON.parse(readFileSync("/tmp/prod_videos.json", "utf8")) as ProdVideo[];
  const flat = raw
    .flatMap((v) =>
      (v.objectParts ?? []).map((p, i) => ({ id: v.id, i, objectPath: p.objectPath })),
    )
    .sort((a, b) => a.id - b.id || a.i - b.i);

  const ids = [...new Set(flat.map((f) => f.id))];
  const sampleIds = new Set([
    ids[0],
    ids[Math.floor(ids.length / 3)],
    ids[Math.floor((2 * ids.length) / 3)],
    ids[ids.length - 1],
    10, // the repaired one users watch
  ]);
  const sample = flat.filter((f) => sampleIds.has(f.id) && f.i === 0);

  const out: { id: number; part: number; bytes: number; url: string }[] = [];
  for (const s of sample) {
    const url = await getSignedVideoURL(s.objectPath);
    const head = await fetch(url, { method: "HEAD" });
    const bytes = Number(head.headers.get("content-length") ?? 0);
    const atoms = await scanAtoms(url);
    const mb = (bytes / 1024 / 1024).toFixed(0);
    console.log(`video ${s.id} part ${s.i} (${mb} MB): ${atoms}`);
    out.push({ id: s.id, part: s.i, bytes, url });
  }
  writeFileSync("/tmp/probe_urls.json", JSON.stringify(out, null, 2));
  console.log(`\nSigned URLs written to /tmp/probe_urls.json (${out.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
