/**
 * Isolated HTTP regression harness: real videos router, HLS resolver and signer;
 * in-memory authorization/DB fixtures. Never connects to or changes a database.
 * --real-r2 --browser adds read-only delivery/browser controls for 64, 11, 115.
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import express from "express";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { chromium } from "playwright";

const realR2 = process.argv.includes("--real-r2");
const objectSizes = new Map<number, number>();
const fixture = {
  markerCalls: 0,
  markerMode: "hang",
  courseAllowed: true,
  expiry: null as Date | null,
  rows: new Map<number, any>(),
};
(globalThis as any).__playbackFixture = fixture;
const user = { id: 100, username: "isolated-test", isActive: true, accountType: "vip" };
for (const id of [64, 11, 115, 901, 902, 903, 904]) {
  fixture.rows.set(id, {
    id, title: `Lesson ${id}`, description: "", thumbnailUrl: null,
    categoryId: 1, categoryName: "Course", categoryLinkedPlaylistId: 5,
    playlistId: 5, partNumber: id, isVisible: true, isVipOnly: false,
    accessType: id === 64 ? "visitor" : "normal", softwareLink: null,
    driveEmbedUrl: "https://drive.google.com/file/d/fixture-drive-file-id/view",
    driveParts: null, objectParts: null, lowParts: null, hlsParts: null,
    storageProvider: id === 11 || id === 115 ? "r2" : "drive",
    r2ObjectKey: id === 11 || id === 115 ? `videos/5/${id}/fixture.mp4` : null,
    createdAt: new Date("2026-01-01"),
  });
}
if (realR2) {
  const client = new S3Client({
    endpoint: process.env.R2_ENDPOINT, region: process.env.R2_REGION || "auto",
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  const objects = (await client.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME, Prefix: "videos/", MaxKeys: 1000,
  }))).Contents!;
  objectSizes.set(64, objects.find(o => o.Key === "videos/pilot/video-64-faststart.mp4")!.Size!);
  for (const id of [11, 115]) {
    const object = objects.find(o => o.Key?.startsWith(`videos/5/${id}/`))!;
    fixture.rows.get(id).r2ObjectKey = object.Key;
    objectSizes.set(id, object.Size!);
  }
}
const dbStub = `
const f = globalThis.__playbackFixture;
export const videosTable = { name: "videos", id: "id" };
export const categoriesTable = { name: "categories" };
export const playlistsTable = { name: "playlists", id: "id" };
export const usersTable = {}, visitLogsTable = {}, activityLogsTable = {};
export const db = {
  select(shape) {
    let table, filter;
    const q = {
      from(t) { table = t; return q; }, leftJoin() { return q; },
      where(v) { filter = v; return q; }, limit() { return q; }, orderBy() { return q; },
      then(ok, no) {
        const rows = table === playlistsTable ? [{id:5,title:"Course",description:""}]
          : filter?.key === "id" ? [f.rows.get(filter.value)].filter(Boolean) : [...f.rows.values()];
        const projected = shape ? rows.map(row => Object.fromEntries(Object.keys(shape).map(k=>[k,row[k]]))) : rows;
        return Promise.resolve(projected).then(ok, no);
      }
    }; return q;
  },
  insert() { return {values() { return Promise.resolve(); }} }
};`;
const stubs: Record<string, string> = {
  "@workspace/db": dbStub,
  "drizzle-orm": `export const eq=(key,value)=>({key,value}); export const and=(...x)=>x; export const or=and,asc=and,isNull=and,inArray=and; export function sql(){return {}}`,
  "../middlewares/auth": `export async function optionalUserAuth(req,res,next) {
    if(req.headers.authorization === "Bearer fixture-entitled") {
      req.user=${JSON.stringify(user)};req.securityDeviceId=42;req.securitySessionId="fixture-session";
    } next();
  }`,
  "../lib/courseEntitlement": `const f=globalThis.__playbackFixture;
    export async function getCanonicalUserEntitlement(){return {paid:true,period:{end:f.expiry}}}
    export async function getCourseEntitlement(){return {allowed:f.courseAllowed,expiresAt:f.expiry}}
    export async function hasCourseEntitlement(){return f.courseAllowed}
    export async function getAccessibleCourseIds(){return new Set([5])}`,
  "../lib/deviceSecurity": `export async function validateSecuritySession(){return true}`,
  "../lib/googleDrive": `export const extractDriveFileId=url=>url? "fixture-drive-file-id":null;
    export const resolveVideoParts=()=>[{label:"Part 1",url:"https://drive.google.com/file/d/fixture-drive-file-id/view"}];
    export async function getDriveFileMetadata(){};export async function streamDriveFile(){}`,
  "../lib/videoStorage": `export const parseObjectParts=()=>null;export async function streamGcsObjectToResponse(){}`,
  "../lib/driveTranscode": `export const parseLowParts=()=>null`,
  "./objectStorage": `const f=globalThis.__playbackFixture;
    export const parseObjectPath=path=>({bucketName:"fixture",objectName:path});
    export const objectStorageClient={bucket(){return {file(){return {download(){
      f.markerCalls++;
      if(f.markerMode==="reject") return Promise.reject(Object.assign(new Error("unavailable"),{code:503}));
      if(f.markerMode==="missing") return Promise.reject(Object.assign(new Error("not found"),{code:404}));
      return new Promise(()=>{});
    }}}}}};`,
};
if (!realR2) {
  stubs["../lib/r2Video"] = `export async function getPresignedR2VideoUrl(key,ttl=14400){
    return "https://fixture.r2.cloudflarestorage.com/video.mp4?X-Amz-Expires="+ttl
  };export async function getR2VideoMetadata(){};export async function streamR2Video(){}`;
}
const bundled = await build({
  entryPoints: ["src/routes/videos.ts"], absWorkingDir: process.cwd(),
  platform: "node", format: "cjs", bundle: true, packages: "external", write: false,
  plugins: [{
    name: "isolated-read-only-fixtures",
    setup(b) {
      b.onResolve({ filter: /.*/ }, args => args.path in stubs
        ? { path: args.path, namespace: "fixture" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
    },
  }],
});
const require = createRequire(import.meta.url);
const module: { exports: any } = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(require, module, module.exports);
const app = express();
app.use("/api", module.exports.default);
app.get("/", (_req, res) => res.send("<!doctype html><title>Isolated playback test</title>"));
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
// Storage is a mock; this process-local setting cannot affect any deployment.
process.env.PRIVATE_OBJECT_DIR ||= "/fixture/private";

async function detail(id: number, authorized = true, timeout = 3500) {
  const start = performance.now();
  const res = await fetch(`${base}/api/videos/${id}`, {
    headers: authorized ? { authorization: "Bearer fixture-entitled" } : {},
    signal: AbortSignal.timeout(timeout),
  });
  return { status: res.status, body: await res.json(), ms: Math.round(performance.now() - start) };
}
try {
  {
    for (const id of [64, 11, 115]) {
      const calls = fixture.markerCalls;
      const result = await detail(id, id !== 64);
      assert.equal(result.status, 200);
      assert.ok(result.ms < 1000, `R2 ${id} must not wait on hanging storage`);
      assert.equal(fixture.markerCalls, calls);
      assert.equal(result.body.streamParts.length, 1);
      const url = new URL(result.body.streamParts[0].url);
      assert.ok(url.hostname.endsWith(".r2.cloudflarestorage.com"));
      assert.equal(url.searchParams.get("X-Amz-Expires"), "14400");
      assert.equal(result.body.streamParts[0].hlsUrl, undefined);
      assert.ok(!/r2ObjectKey|driveEmbedUrl|objectParts/.test(JSON.stringify(result.body)));
      console.log(`AFTER lesson ${id}: HTTP 200 ${result.ms}ms; direct R2; no HLS discovery`);
      if (realR2) {
        const size = objectSizes.get(id)!;
        for (const start of [0, Math.floor(size / 2), size - 1048576]) {
          const range = `bytes=${start}-${start + 1048575}`;
          const r = await fetch(url, { headers: { range }, signal: AbortSignal.timeout(15000) });
          assert.equal(r.status, 206);
          assert.equal((await r.arrayBuffer()).byteLength, 1048576);
          assert.equal(r.headers.get("content-range"), `bytes ${start}-${start + 1048575}/${size}`);
          console.log(`RANGE lesson ${id}: ${range}, 206, 1048576 bytes`);
        }
      }
    }
    // Still requires existing course entitlement; no URL leaks on denial.
    for (const id of [11, 115]) {
      const denied = await detail(id, false);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.streamParts, undefined);
    }
    fixture.courseAllowed = false;
    assert.equal((await detail(11)).status, 403);
    fixture.courseAllowed = true;
    fixture.expiry = new Date(Date.now() + 120_000);
    const short = await detail(11);
    const ttl = Number(new URL(short.body.streamParts[0].url).searchParams.get("X-Amz-Expires"));
    assert.ok(ttl > 0 && ttl <= 120);
    fixture.expiry = null;
    fixture.rows.get(115).isVisible = false;
    assert.equal((await detail(115)).status, 404);
    fixture.rows.get(115).isVisible = true;
    // Legacy discovery can hang, fail, or find no marker without trapping HTTP.
    for (const [id, mode] of [[901, "hang"], [902, "reject"], [903, "missing"]] as const) {
      fixture.markerMode = mode;
      const result = await detail(id);
      assert.equal(result.status, 200);
      assert.ok(result.ms < 2500);
      assert.ok(result.body.streamParts[0].url.startsWith(`/api/videos/${id}/stream/0?token=`));
      assert.equal(result.body.streamParts[0].hlsUrl, undefined);
      console.log(`LEGACY ${mode}: HTTP 200 ${result.ms}ms, existing authorized MP4 fallback`);
      if (mode === "hang") {
        const calls = fixture.markerCalls;
        const retry = await detail(id);
        assert.equal(retry.status, 200);
        assert.ok(retry.ms < 1000);
        assert.equal(fixture.markerCalls, calls);
        console.log("LEGACY timeout retry: immediate fallback, no duplicate storage read");
      }
    }
    fixture.markerMode = "hang";
    fixture.rows.get(904).hlsParts = JSON.stringify([{renditions:[{name:"480p",width:854,height:480,bandwidth:500000}]}]);
    const calls = fixture.markerCalls;
    const existing = await detail(904);
    assert.equal(existing.status, 200);
    assert.ok(existing.body.streamParts[0].hlsUrl.includes("/hls/"));
    assert.equal(fixture.markerCalls, calls);
    console.log("LEGACY stored metadata: unchanged; no discovery required");
    if (realR2 && process.argv.includes("--browser")) {
      const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        await page.goto(base);
        for (const id of [64, 11, 115]) {
          const mediaRequests: string[] = [];
          const listener = (r: any) => { if (r.resourceType() === "media") mediaRequests.push(new URL(r.url()).hostname); };
          page.on("request", listener);
          const result = await page.evaluate(async id => {
            const started = performance.now();
            const r = await fetch(`/api/videos/${id}`, { headers: { authorization: "Bearer fixture-entitled" } });
            const data = await r.json();
            const apiMs = Math.round(performance.now() - started);
            const video = document.createElement("video");
            video.muted = true; video.playsInline = true; video.preload = "auto";
            document.body.append(video);
            video.src = data.streamParts[0].url;
            const media = await new Promise<{ readyState: number; error: number | null }>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("metadata timeout")), 20000);
              video.addEventListener("loadedmetadata", () => {
                clearTimeout(timer); resolve({ readyState: video.readyState, error: video.error?.code ?? null });
              }, { once: true });
              video.addEventListener("error", () => {
                clearTimeout(timer); reject(new Error(`media error ${video.error?.code}`));
              }, { once: true });
            });
            video.removeAttribute("src"); video.load(); video.remove();
            return { apiStatus: r.status, apiMs, ...media };
          }, id);
          page.off("request", listener);
          assert.equal(result.apiStatus, 200); assert.equal(result.error, null);
          assert.ok(mediaRequests.length > 0);
          assert.ok(mediaRequests.every(host => host.endsWith(".r2.cloudflarestorage.com")));
          console.log(`BROWSER lesson ${id}: ${JSON.stringify(result)}; ALL media requests directly to R2`);
        }
      } finally { await browser.close(); }
    }
    console.log("Playback regression passed; no database or R2 mutations");
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}