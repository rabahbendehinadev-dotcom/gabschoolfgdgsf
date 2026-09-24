import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { inArray } from "drizzle-orm";
import {
  activityLogsTable, categoriesTable, db, playlistsTable, securityEventsTable,
  userCoursesTable, usersTable, videosTable, visitLogsTable,
} from "@workspace/db";
import { hashPassword } from "../src/lib/auth";

assert.equal(process.env.NODE_ENV, "development", "Only run against the development database");
assert.ok(process.env.DATABASE_URL, "Development database required");

const api = "http://127.0.0.1:80/api";
const site = "http://127.0.0.1:80";
const slug = `catalog-it-${randomUUID()}`;
const password = `Test!${randomUUID()}a9`;
const ids = { users: [] as number[], courses: [] as number[], categories: [] as number[], videos: [] as number[] };

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${api}${path}`, init);
  return { status: response.status, body: await response.json() };
}

async function login(email: string) {
  const response = await json("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as { token: string; deviceCredential: string; user: object };
}

async function cleanup() {
  if (ids.users.length) {
    await db.delete(activityLogsTable).where(inArray(activityLogsTable.userId, ids.users));
    await db.delete(visitLogsTable).where(inArray(visitLogsTable.userId, ids.users));
    await db.delete(securityEventsTable).where(inArray(securityEventsTable.userId, ids.users));
    await db.delete(userCoursesTable).where(inArray(userCoursesTable.userId, ids.users));
    await db.delete(usersTable).where(inArray(usersTable.id, ids.users));
  }
  if (ids.videos.length) await db.delete(videosTable).where(inArray(videosTable.id, ids.videos));
  if (ids.categories.length) await db.delete(categoriesTable).where(inArray(categoriesTable.id, ids.categories));
  if (ids.courses.length) await db.delete(playlistsTable).where(inArray(playlistsTable.id, ids.courses));
}

async function run() {
  const [course] = await db.insert(playlistsTable).values({ title: `${slug} course`, description: "Public course" }).returning({ id: playlistsTable.id });
  ids.courses.push(course.id);
  const [other] = await db.insert(playlistsTable).values({ title: `${slug} other`, description: "Other course" }).returning({ id: playlistsTable.id });
  ids.courses.push(other.id);
  const [category] = await db.insert(categoriesTable).values({ name: `${slug} section`, slug, linkedPlaylistId: course.id }).returning({ id: categoriesTable.id });
  ids.categories.push(category.id);
  const [hiddenCategory] = await db.insert(categoriesTable).values({ name: "Hidden section", slug: `${slug}-hidden`, linkedPlaylistId: course.id, isVisible: false }).returning({ id: categoriesTable.id });
  ids.categories.push(hiddenCategory.id);
  const videos = await db.insert(videosTable).values([
    { title: `${slug} protected`, description: "Public description", thumbnailUrl: "/test-thumb.png", driveEmbedUrl: "", categoryId: category.id, accessType: "normal", partNumber: 1 },
    { title: `${slug} free`, description: "Free", thumbnailUrl: "/test-thumb.png", driveEmbedUrl: "", categoryId: category.id, accessType: "visitor", partNumber: 2 },
    { title: `${slug} hidden`, description: "Hidden", thumbnailUrl: "/test-thumb.png", driveEmbedUrl: "", categoryId: hiddenCategory.id, accessType: "normal" },
    { title: `${slug} foreign`, description: "Foreign", thumbnailUrl: "/test-thumb.png", driveEmbedUrl: "", categoryId: category.id, playlistId: other.id, accessType: "normal" },
  ]).returning({ id: videosTable.id });
  ids.videos.push(...videos.map(v => v.id));
  const [guestUser, paidUser] = await db.insert(usersTable).values([
    { username: `${slug}-demo`, email: `${slug}-demo@example.invalid`, passwordHash: await hashPassword(password), phone: "+33600000001", locale: "fr" },
    { username: `${slug}-paid`, email: `${slug}-paid@example.invalid`, passwordHash: await hashPassword(password), phone: "+33600000002", locale: "fr", accountType: "vip", subscriptionType: "lifetime" },
  ]).returning({ id: usersTable.id });
  ids.users.push(guestUser.id, paidUser.id);
  await db.insert(userCoursesTable).values({ userId: paidUser.id, playlistId: course.id, status: "active", grantSource: "test" });

  const demo = await login(`${slug}-demo@example.invalid`);
  const paid = await login(`${slug}-paid@example.invalid`);
  const states = [
    { label: "guest", auth: undefined, locked: true },
    { label: "non-subscriber", auth: demo, locked: true },
    { label: "entitled", auth: paid, locked: false },
  ];
  for (const state of states) {
    const headers = state.auth
      ? { authorization: `Bearer ${state.auth.token}`, "X-Device-Credential": state.auth.deviceCredential }
      : {};
    const detail = await json(`/playlists/${course.id}`, { headers });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.locked, state.locked, state.label);
    assert.deepEqual(detail.body.sections[0].videos.map((v: { id: number }) => v.id), [videos[0].id, videos[1].id]);
    const overview = await json("/playlists", { headers });
    assert.deepEqual(
      overview.body.find((p: { id: number }) => p.id === course.id).videos.map((v: { id: number }) => v.id),
      [videos[0].id, videos[1].id],
    );
    const list = await json(`/videos?playlistId=${course.id}&categoryId=${category.id}`, { headers });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map((v: { id: number }) => v.id), [videos[0].id, videos[1].id]);
    for (const data of [detail.body, list.body]) {
      const serialized = JSON.stringify(data);
      assert.ok(!/driveEmbedUrl|driveParts|objectParts|hlsParts|r2ObjectKey|streamParts|softwareLink|storageProvider/.test(serialized), state.label);
    }
    const video = await json(`/videos/${videos[0].id}`, { headers });
    assert.equal(video.status, state.locked ? 403 : 200, state.label);
    if (state.locked) assert.ok(!/streamParts|driveParts|r2ObjectKey|softwareLink/.test(JSON.stringify(video.body)));
    console.log(`API ${state.label}: visible safe catalog; protected detail ${video.status}`);
  }
  assert.equal((await json(`/videos?playlistId=${other.id}&categoryId=${category.id}`)).status, 403);
  assert.equal((await json(`/playlists/${course.id + 999999}`)).status, 404);

  const browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const state of states) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      if (state.auth) {
        await context.addInitScript(({ token, user, deviceCredential }) => {
          localStorage.setItem("token", token);
          localStorage.setItem("user", JSON.stringify(user));
          localStorage.setItem("device_credential", deviceCredential);
        }, state.auth);
      }
      const page = await context.newPage();
      await page.goto(`${site}/courses/${course.id}`);
      // The unrelated mandatory push-permission overlay can cover the course on test devices.
      await page.getByText(`${slug} section`).first().evaluate((element: HTMLElement) => element.click());
      await page.getByText(`${slug} protected`).first().waitFor({ timeout: 20000 });
      assert.equal(await page.getByText(`${slug} free`).count(), 1);
      assert.equal(await page.getByText(`${slug} hidden`).count(), 0);
      assert.equal(await page.getByText(`${slug} foreign`).count(), 0);
      const row = page.getByText(`${slug} protected`).locator("xpath=ancestor::a");
      assert.equal(await row.locator("svg.lucide-lock").count() > 0, state.locked, state.label);
      assert.equal(await row.locator("img").count(), 1, `${state.label} mobile thumbnail`);
      if (state.locked) {
        await row.evaluate((element: HTMLElement) => element.click());
        await page.getByText(`${slug} protected`).first().waitFor({ timeout: 20000 });
        const cta = page.locator(`a[href="${state.auth ? "/subscribe" : "/login"}"]`);
        assert.ok(await cta.count() > 0, `${state.label} CTA`);
      }
      await page.goto(`${site}/videos?courseId=${course.id}&categoryId=${category.id}`);
      await page.getByText(`${slug} protected`).first().waitFor({ timeout: 20000 });
      assert.equal(await page.getByText(`${slug} foreign`).count(), 0);
      assert.equal(await page.getByText("Aucune leçon dans cette catégorie").count(), 0);
      await context.close();
      console.log(`Mobile ${state.label}: course detail and category lesson catalog verified`);
    }
  } finally {
    await browser.close();
  }
}

run().then(async () => {
  await cleanup();
  console.log("Course catalog integration passed; fixture removed");
}).catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exitCode = 1;
});