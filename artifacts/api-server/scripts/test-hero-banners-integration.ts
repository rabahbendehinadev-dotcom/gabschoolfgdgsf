import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  activityLogsTable,
  adminSessionsTable,
  adminsTable,
  db,
  heroBannerCleanupQueueTable,
  heroBannersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { hashPassword } from "../src/lib/auth";
import { bannerFile, deleteBannerImage, readBannerImage } from "../src/lib/bannerStorage";

type Json = Record<string, any>;
type Auth = { token: string };

assert.equal(process.env.NODE_ENV, "development", "Refusing to run outside NODE_ENV=development");
assert.ok(process.env.DATABASE_URL, "Development DATABASE_URL is required");

const runId = `hero-banners-it-${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `T!${randomUUID()}a9`;
const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:80/api").replace(/\/$/, "");
const createdAdminIds: number[] = [];
const createdBannerIds: number[] = [];
const createdObjectPaths = new Set<string>();

function headers(auth?: Auth): Record<string, string> {
  return auth ? { authorization: `Bearer ${auth.token}` } : {};
}

async function request(
  path: string,
  options: RequestInit & { expected?: number; auth?: Auth } = {},
): Promise<{ response: Response; body: any }> {
  const { expected = 200, auth, ...init } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers(auth), ...(init.headers as Record<string, string> | undefined) },
  });
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  assert.equal(
    response.status,
    expected,
    `${init.method ?? "GET"} ${path}: expected ${expected}, received ${response.status}: ${
      Buffer.isBuffer(body) ? `<${body.length} bytes>` : JSON.stringify(body)
    }`,
  );
  return { response, body };
}

async function json(path: string, method: string, body: unknown, auth?: Auth, expected = 200): Promise<any> {
  return (await request(path, {
    method,
    auth,
    expected,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })).body;
}

async function adminLogin(email: string): Promise<Auth> {
  const result = await json("/auth/admin-login", "POST", { email, password });
  assert.equal(typeof result.token, "string");
  return { token: result.token };
}

async function imageFixture(color: string, width = 640, height = 360): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

async function upload(auth: Auth, id: number, variant: "desktop" | "mobile", data: Buffer, name: string, type = "image/png") {
  const form = new FormData();
  form.append("image", new Blob([data], { type }), name);
  const result = (await request(`/admin/hero-banners/${id}/images/${variant}`, {
    method: "POST",
    auth,
    expected: 200,
    body: form,
  })).body;
  const [row] = await db.select().from(heroBannersTable).where(eq(heroBannersTable.id, id));
  assert.ok(row);
  const objectPath = variant === "desktop" ? row.desktopImagePath : row.mobileImagePath;
  assert.ok(objectPath, `Uploaded ${variant} object path was not persisted`);
  createdObjectPaths.add(objectPath);
  const stored = await readBannerImage(objectPath);
  assert.ok(stored.data.length > 0, `Stored ${variant} image could not be read through the storage adapter`);
  return result;
}

async function cleanup() {
  const rows = createdBannerIds.length
    ? await db.select().from(heroBannersTable).where(inArray(heroBannersTable.id, createdBannerIds))
    : [];
  for (const row of rows) {
    if (row.desktopImagePath) createdObjectPaths.add(row.desktopImagePath);
    if (row.mobileImagePath) createdObjectPaths.add(row.mobileImagePath);
  }

  if (createdBannerIds.length) {
    await db.delete(heroBannersTable).where(inArray(heroBannersTable.id, createdBannerIds));
  }
  for (const objectPath of createdObjectPaths) {
    try { await deleteBannerImage(objectPath); } catch { /* best-effort provider cleanup */ }
  }
  if (createdAdminIds.length) {
    await db.delete(activityLogsTable).where(inArray(activityLogsTable.adminId, createdAdminIds));
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminId, createdAdminIds));
    await db.delete(adminsTable).where(inArray(adminsTable.id, createdAdminIds));
  }
}

try {
  const passwordHash = await hashPassword(password);
  const admins = await db.insert(adminsTable).values([
    {
      username: `${runId}-content`,
      email: `${runId}-content@example.invalid`,
      displayName: runId,
      passwordHash,
      role: "support",
      permissions: JSON.stringify(["manage_content"]),
    },
    {
      username: `${runId}-support`,
      email: `${runId}-support@example.invalid`,
      displayName: runId,
      passwordHash,
      role: "support",
      permissions: JSON.stringify(["manage_users"]),
    },
  ]).returning();
  createdAdminIds.push(...admins.map(admin => admin.id));

  const contentAdmin = await adminLogin(admins[0].email!);
  const unrelatedSupport = await adminLogin(admins[1].email!);

  await request("/admin/hero-banners", { auth: contentAdmin });
  await request("/admin/hero-banners", { auth: unrelatedSupport, expected: 403 });
  await request("/admin/hero-banners", { expected: 401 });

  const first = await json("/admin/hero-banners", "POST", { title: `${runId} first` }, contentAdmin, 201);
  const second = await json("/admin/hero-banners", "POST", { title: `${runId} second`, isActive: true }, contentAdmin, 201);
  createdBannerIds.push(first.id, second.id);
  assert.notEqual(first.id, second.id);
  const extraBanners = [];
  for (let i = 0; i < 5; i++) {
    const banner = await json("/admin/hero-banners", "POST", { title: `${runId} extra-${i}` }, contentAdmin, 201);
    extraBanners.push(banner);
    createdBannerIds.push(banner.id);
  }

  await upload(contentAdmin, first.id, "desktop", await imageFixture("#f97316"), `${runId}-desktop.png`);
  await upload(contentAdmin, first.id, "mobile", await imageFixture("#fb923c", 360, 640), `${runId}-mobile.png`);
  await upload(contentAdmin, second.id, "desktop", await imageFixture("#14b8a6"), `${runId}-second.png`);

  const [beforeReplacement] = await db.select().from(heroBannersTable).where(eq(heroBannersTable.id, first.id));
  assert.ok(beforeReplacement?.desktopImagePath);
  await upload(contentAdmin, first.id, "desktop", await imageFixture("#ea580c"), `${runId}-replacement.png`);
  const [afterReplacement] = await db.select().from(heroBannersTable).where(eq(heroBannersTable.id, first.id));
  assert.ok(afterReplacement?.desktopImagePath);
  assert.notEqual(afterReplacement.desktopImagePath, beforeReplacement.desktopImagePath);
  assert.equal((await bannerFile(beforeReplacement.desktopImagePath).exists())[0], false, "Replaced object should be removed");
  assert.equal((await db.select().from(heroBannerCleanupQueueTable)).length, 0, "Successful cleanup should drain its queue row");
  await Promise.all([
    upload(contentAdmin, first.id, "mobile", await imageFixture("#c2410c", 360, 640), `${runId}-concurrent-a.png`),
    upload(contentAdmin, first.id, "mobile", await imageFixture("#7c2d12", 360, 640), `${runId}-concurrent-b.png`),
  ]);
  const [afterConcurrentReplacement] = await db.select().from(heroBannersTable).where(eq(heroBannersTable.id, first.id));
  assert.ok(afterConcurrentReplacement?.mobileImagePath);
  assert.ok((await readBannerImage(afterConcurrentReplacement.mobileImagePath)).data.length > 0);
  assert.equal((await db.select().from(heroBannerCleanupQueueTable)).length, 0, "Concurrent cleanup should drain its queue rows");

  // Regression: sparse sort_order values must still reorder under the unique
  // index, even when the current maximum is much larger than row count.
  await request(`/admin/hero-banners/${extraBanners[1].id}`, { method: "DELETE", auth: contentAdmin, expected: 204 });
  await request(`/admin/hero-banners/${extraBanners[3].id}`, { method: "DELETE", auth: contentAdmin, expected: 204 });
  const sparseIds = [first.id, second.id, extraBanners[0].id, extraBanners[2].id, extraBanners[4].id];
  await json("/admin/hero-banners/reorder", "PUT", { ids: sparseIds }, contentAdmin);
  const compacted = await request("/admin/hero-banners", { auth: contentAdmin });
  assert.deepEqual(compacted.body.map((banner: Json) => banner.id), sparseIds);
  assert.deepEqual(compacted.body.map((banner: Json) => banner.sortOrder), [0, 1, 2, 3, 4]);

  const oversized = new FormData();
  oversized.append("image", new Blob([randomBytes(8 * 1024 * 1024 + 1)], { type: "image/png" }), `${runId}-oversized.png`);
  await request(`/admin/hero-banners/${first.id}/images/desktop`, {
    method: "POST", auth: contentAdmin, expected: 413, body: oversized,
  });

  const invalid = new FormData();
  invalid.append("image", new Blob([Buffer.from("not-an-image")], { type: "image/png" }), `${runId}-invalid.png`);
  await request(`/admin/hero-banners/${first.id}/images/desktop`, {
    method: "POST", auth: contentAdmin, expected: 400, body: invalid,
  });

  await json(`/admin/hero-banners/${first.id}`, "PATCH", { isActive: true }, contentAdmin);
  const activeBeforeReorder = (await request("/hero-banners")).body;
  assert.deepEqual(activeBeforeReorder.map((banner: Json) => banner.id), [first.id, second.id]);
  assert.match(activeBeforeReorder[0].desktopImageUrl, new RegExp(`/api/hero-banners/${first.id}/images/desktop`));
  assert.match(activeBeforeReorder[0].mobileImageUrl, new RegExp(`/api/hero-banners/${first.id}/images/mobile`));
  assert.equal(activeBeforeReorder[1].mobileImageUrl, null);

  const desktopUrl = new URL(activeBeforeReorder[0].desktopImageUrl, baseUrl);
  const mobileUrl = new URL(activeBeforeReorder[0].mobileImageUrl, baseUrl);
  const apiRelative = (url: URL) => `${url.pathname.replace(/^\/api/, "")}${url.search}`;
  await request(apiRelative(desktopUrl));
  await request(apiRelative(mobileUrl));
  await request(`/admin/hero-banners/${first.id}/images/desktop`, { auth: unrelatedSupport, expected: 403 });

  await json("/admin/hero-banners/reorder", "PUT", { ids: [first.id, first.id] }, contentAdmin, 400);
  await json("/admin/hero-banners/reorder", "PUT", { ids: sparseIds }, contentAdmin);
  const reordered = (await request("/hero-banners")).body;
  assert.deepEqual(reordered.map((banner: Json) => banner.id), [first.id, second.id]);
  await json(`/admin/hero-banners/${first.id}`, "PATCH", { title: `${runId} edited`, isActive: false }, contentAdmin);
  const activeAfterToggle = (await request("/hero-banners")).body;
  assert.deepEqual(activeAfterToggle.map((banner: Json) => banner.id), [second.id]);
  const secondDesktopUrl = new URL(activeAfterToggle[0].desktopImageUrl, baseUrl);
  await request(apiRelative(desktopUrl), { expected: 404 });

  await request(`/admin/hero-banners/${second.id}`, { method: "DELETE", auth: contentAdmin, expected: 204 });
  assert.deepEqual((await request("/hero-banners")).body, []);
  await request(apiRelative(secondDesktopUrl), { expected: 404 });
  assert.equal((await db.select().from(heroBannerCleanupQueueTable)).length, 0, "Deleted image cleanup should drain its queue row");
  await request("/admin/hero-banners", { auth: contentAdmin });

  console.log(`PASS ${runId}: Hero banner authorization, CRUD, image validation/serving, active filtering, reorder, toggle, delete, and cleanup checks`);
} finally {
  await cleanup();
}