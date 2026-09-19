import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  activityLogsTable,
  adminsTable,
  paymentSubmissionsTable,
  db,
  securityEventsTable,
  solutionImagesTable,
  solutionsTable,
  solutionTaxonomiesTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import sharp from "sharp";
import app from "../src/app";
import { hashPassword } from "../src/lib/auth";
import { solutionFile } from "../src/lib/solutionStorage";

type Json = Record<string, any>;
type Auth = { token: string; deviceCredential?: string };

assert.equal(process.env.NODE_ENV, "development", "Refusing to run outside NODE_ENV=development");
assert.ok(process.env.DATABASE_URL, "Development DATABASE_URL is required");
assert.ok(
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  "The configured OpenAI integration is required for the one real text+vision generation",
);

const runId = `solutions-it-${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `T!${randomUUID()}a9`;
const createdUserIds: number[] = [];
const createdAdminIds: number[] = [];
const createdSolutionIds: number[] = [];
const createdTaxonomyIds: number[] = [];
const createdObjectPaths: string[] = [];
const createdPaymentIds: number[] = [];

const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

function headers(auth?: Auth): Record<string, string> {
  return {
    ...(auth ? { authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.deviceCredential ? { "x-device-credential": auth.deviceCredential } : {}),
  };
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
  const body = type.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  assert.equal(
    response.status,
    expected,
    `${init.method ?? "GET"} ${path}: expected ${expected}, received ${response.status}: ${
      Buffer.isBuffer(body) ? `<${body.length} bytes>` : JSON.stringify(body)
    }`,
  );
  return { response, body };
}

async function json(
  path: string,
  method: string,
  body: unknown,
  auth?: Auth,
  expected = 200,
): Promise<any> {
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

async function userLogin(email: string): Promise<Auth> {
  const result = await json("/auth/login", "POST", { email, password });
  assert.equal(typeof result.token, "string");
  assert.equal(typeof result.deviceCredential, "string");
  return { token: result.token, deviceCredential: result.deviceCredential };
}

const content = (imageId: string) => ({
  introduction: `${runId} member-only introduction`,
  device: "Integration Fixture Router",
  problem: "Amber status indicator after a configuration change.",
  requirements: ["Qualified technician", "Stable power source"],
  beforeStarting: ["Record the existing configuration"],
  steps: [{
    title: "Restore the verified setting",
    text: `${runId} private body instruction`,
    imageIds: [imageId],
  }],
  result: "The status indicator returns to green.",
  warnings: ["Do not interrupt power while settings are being saved."],
  resources: [{
    name: "Fixture support download",
    type: "external",
    url: `https://example.com/${runId}/download`,
    note: "Integration-test link; the backend must not fetch it.",
  }],
});

async function cleanup() {
  if (createdPaymentIds.length) {
    await db.delete(paymentSubmissionsTable).where(inArray(paymentSubmissionsTable.id, createdPaymentIds));
  }
  for (const objectPath of createdObjectPaths) {
    try {
      await solutionFile(objectPath).delete();
    } catch {
      // Cleanup remains best-effort if a provider already removed an object.
    }
  }
  if (createdSolutionIds.length) {
    await db.delete(solutionsTable).where(inArray(solutionsTable.id, createdSolutionIds));
  }
  if (createdTaxonomyIds.length) {
    await db.delete(solutionTaxonomiesTable).where(inArray(solutionTaxonomiesTable.id, createdTaxonomyIds));
  }
  if (createdUserIds.length || createdAdminIds.length) {
    const predicates = [
      ...(createdUserIds.length ? [inArray(activityLogsTable.userId, createdUserIds)] : []),
      ...(createdAdminIds.length ? [inArray(activityLogsTable.adminId, createdAdminIds)] : []),
    ];
    if (predicates.length) await db.delete(activityLogsTable).where(or(...predicates));
  }
  if (createdUserIds.length) {
    await db.delete(securityEventsTable).where(inArray(securityEventsTable.userId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdAdminIds.length) {
    await db.delete(adminsTable).where(inArray(adminsTable.id, createdAdminIds));
  }
}

try {
  const passwordHash = await hashPassword(password);
  const adminFixtures = await db.insert(adminsTable).values([
    {
      username: `${runId}-solutions`,
      email: `${runId}-solutions@example.invalid`,
      displayName: runId,
      passwordHash,
      role: "support",
      permissions: JSON.stringify(["manage_solutions"]),
    },
    {
      username: `${runId}-other`,
      email: `${runId}-other@example.invalid`,
      displayName: runId,
      passwordHash,
      role: "support",
      permissions: JSON.stringify(["manage_users"]),
    },
  ]).returning();
  createdAdminIds.push(...adminFixtures.map(row => row.id));

  const users = await db.insert(usersTable).values([
    {
      username: `${runId}-member`,
      email: `${runId}-member@example.invalid`,
      passwordHash,
      accountType: "normal",
      subscriptionType: "monthly",
      subscriptionExpiresAt: new Date(Date.now() + 86_400_000),
    },
    {
      username: `${runId}-expired`,
      email: `${runId}-expired@example.invalid`,
      passwordHash,
      accountType: "normal",
      subscriptionType: "monthly",
      subscriptionExpiresAt: new Date(Date.now() - 86_400_000),
    },
    {
      username: `${runId}-standard`,
      email: `${runId}-standard@example.invalid`,
      passwordHash,
      accountType: "normal",
      subscriptionType: "demo",
      subscriptionExpiresAt: new Date(Date.now() + 86_400_000),
    },
  ]).returning();
  createdUserIds.push(...users.map(row => row.id));

  const solutionAdmin = await adminLogin(adminFixtures[0].email!);
  const otherSupport = await adminLogin(adminFixtures[1].email!);
  const member = await userLogin(users[0].email);
  const expired = await userLogin(users[1].email);
  const standard = await userLogin(users[2].email);

  await request("/admin/solutions", { auth: solutionAdmin });
  await request("/admin/solutions", { auth: otherSupport, expected: 403 });

  const category = await json("/admin/solutions/taxonomies", "POST", {
    kind: "category", name: `${runId} category`,
  }, solutionAdmin, 201);
  createdTaxonomyIds.push(category.id);
  const subcategory = await json("/admin/solutions/taxonomies", "POST", {
    kind: "subcategory", name: `${runId} subcategory`, parentId: category.id,
  }, solutionAdmin, 201);
  createdTaxonomyIds.push(subcategory.id);
  const patchedTaxonomy = await json(`/admin/solutions/taxonomies/${subcategory.id}`, "PATCH", {
    kind: "subcategory", name: `${runId} subcategory updated`, parentId: category.id,
  }, solutionAdmin);
  assert.match(patchedTaxonomy.name, /updated$/);
  const publicTaxonomies = (await request("/solutions/taxonomies")).body;
  assert.ok(publicTaxonomies.taxonomies.some((row: Json) => row.id === subcategory.id));
  await request(`/admin/solutions/taxonomies/${category.id}`, {
    method: "DELETE", auth: solutionAdmin, expected: 409,
  });

  const retryDraft = await json("/admin/solutions", "POST", {
    rawInput: "", slug: `${runId}-retry`,
  }, solutionAdmin, 201);
  createdSolutionIds.push(retryDraft.id);
  const failedGeneration = await json(
    `/admin/solutions/${retryDraft.id}/generate`,
    "POST",
    { rawInput: "" },
    solutionAdmin,
    502,
  );
  assert.equal(failedGeneration.draftId, retryDraft.id);
  const persistedFailure = (await request(`/admin/solutions/${retryDraft.id}`, { auth: solutionAdmin })).body;
  assert.equal(persistedFailure.rawInput, "");
  assert.match(persistedFailure.generationError, /notes or screenshots/i);

  const rawNotes = [
    `${runId} privileged raw technician notes.`,
    `Required fixture identifier: retain "${runId}" in the generated title and slug.`,
    "Device: Integration Fixture Router, model IT-100.",
    "Observed problem: the status indicator is amber after changing a setting.",
    "Verified recovery: record the existing configuration, restore the prior setting, save, then confirm the indicator is green.",
    "The attached benign screenshot shows a synthetic settings panel with an amber status tile.",
    "Do not invent additional steps, credentials, URLs, or claims.",
  ].join("\n");
  const draft = await json("/admin/solutions", "POST", {
    rawInput: rawNotes,
    slug: `${runId}-main`,
    brand: runId,
  }, solutionAdmin, 201);
  createdSolutionIds.push(draft.id);
  assert.equal(draft.rawInput, rawNotes);

  const png = await sharp({
    create: { width: 720, height: 420, channels: 3, background: "#f5f7fa" },
  }).composite([{
    input: Buffer.from(
      `<svg width="720" height="420"><rect x="50" y="50" width="620" height="320" rx="20" fill="#fff" stroke="#ccd3db"/><text x="90" y="125" font-family="sans-serif" font-size="30" fill="#243447">Synthetic Settings</text><rect x="90" y="175" width="540" height="100" rx="12" fill="#fff2cc"/><text x="120" y="235" font-family="sans-serif" font-size="26" fill="#7a5700">Status: Amber</text><text x="90" y="330" font-family="sans-serif" font-size="18" fill="#64748b">${runId}</text></svg>`,
    ),
  }]).png().toBuffer();
  const form = new FormData();
  form.append("images", new Blob([png], { type: "image/png" }), `${runId}-screenshot.png`);
  const upload = (await request(`/admin/solutions/${draft.id}/images`, {
    method: "POST", auth: solutionAdmin, expected: 201, body: form,
  })).body;
  assert.equal(upload.images.length, 1);
  const imageId = upload.images[0].id as string;
  assert.equal(upload.images[0].width, 720);
  assert.equal(upload.images[0].height, 420);
  const [storedImage] = await db.select().from(solutionImagesTable).where(eq(solutionImagesTable.id, imageId));
  assert.ok(storedImage);
  createdObjectPaths.push(storedImage.objectPath);
  await request(`/admin/solutions/images/${imageId}`, { auth: solutionAdmin });
  // Cross-feature namespace isolation: reject both new references AND already
  // persisted malicious references. This image is still a private draft here.
  const paymentBody = { customerName: runId, planType: "monthly", planPrice: "1", paymentMethod: "test" };
  for (const objectPath of [
    storedImage.objectPath,
    storedImage.objectPath.replace("/solutions/", "/%73olutions/"),
    storedImage.objectPath.replace("/solutions/", "/%2573olutions/"),
    `/objects/uploads/../solutions/${imageId}.webp`,
    `/objects/uploads/%252e%252e/solutions/${imageId}.webp`,
    `/objects/uploads\\..\\solutions\\${imageId}.webp`,
  ]) {
    await json("/payments/submit", "POST", { ...paymentBody, proofObjectPath: objectPath }, undefined, 400);
    await json("/users/me/avatar", "PATCH", { objectPath }, member, 400);
    const [proof] = await db.insert(paymentSubmissionsTable).values({ ...paymentBody, proofObjectPath: objectPath }).returning();
    createdPaymentIds.push(proof.id);
    await request(`/payments/proof/${proof.id}`, { expected: 404 });
    await db.update(usersTable).set({ profileImage: objectPath }).where(eq(usersTable.id, users[0].id));
    await request(`/users/${users[0].id}/avatar`, { expected: 404 });
  }
  await db.update(usersTable).set({ profileImage: null }).where(eq(usersTable.id, users[0].id));
  // Unrelated payment submissions still work.
  const normalPayment = await json("/payments/submit", "POST", { ...paymentBody, proofObjectPath: null }, undefined, 201);
  createdPaymentIds.push(normalPayment.id);

  const generated = await json(`/admin/solutions/${draft.id}/generate`, "POST", {
    rawInput: rawNotes,
  }, solutionAdmin);
  assert.equal(generated.rawInput, rawNotes);
  assert.deepEqual(generated.imageIds, [imageId]);
  assert.equal(generated.generationError, null);
  assert.ok(
    generated.content.introduction || generated.content.problem || generated.content.steps.length,
    "AI generation returned no substantive structured content",
  );

  const slug = `${runId}-published`;
  const title = `${runId} Router Recovery`;
  const deterministicDraft = await json(`/admin/solutions/${draft.id}`, "PATCH", {
    slug,
    title,
    excerpt: `${runId} public teaser without private instructions`,
    brand: runId,
    model: "IT-100",
    category: category.name,
    subcategory: patchedTaxonomy.name,
    tool: `${runId}-tool`,
    tags: [runId],
    keywords: [runId, "router", "solutions-it-1789854289472-157b859d"],
    rawInput: rawNotes,
    imageIds: [imageId],
    coverImageId: null,
    reviewFlags: ["Fixture requires explicit technical review"],
    content: content(imageId),
  }, solutionAdmin);
  assert.equal(deterministicDraft.coverImageId, null);

  const reviewRequired = await json(
    `/admin/solutions/${draft.id}/publish`, "POST", {}, solutionAdmin, 409,
  );
  assert.equal(reviewRequired.code, "REVIEW_REQUIRED");
  const published = await json(
    `/admin/solutions/${draft.id}/publish`, "POST", { reviewed: true }, solutionAdmin,
  );
  assert.equal(published.status, "published");

  const freeTextCategory = `${runId} AI free-text category`;
  const duplicate = await json("/admin/solutions", "POST", {
    slug: `${runId}-duplicate`,
    title,
    excerpt: `${runId} duplicate teaser`,
    brand: runId,
    model: "IT-100",
    category: freeTextCategory,
    tool: `${runId}-tool`,
    content: { ...content(imageId), steps: [] },
  }, solutionAdmin, 201);
  createdSolutionIds.push(duplicate.id);
  const beforeFreeTextPublication = (await request("/solutions/taxonomies")).body;
  assert.ok(!beforeFreeTextPublication.categories.includes(freeTextCategory), "Draft-only free-text metadata must stay private");
  // Regression: DB-default timestamps have microseconds that a JS Date loses.
  // Publishing this unchanged row must succeed after the duplicate override.
  await db.update(solutionsTable).set({
    updatedAt: sql`timestamp '2026-01-02 03:04:05.123456'`,
  }).where(eq(solutionsTable.id, duplicate.id));
  const [microsecondRow] = await db.select({
    precise: sql<string>`updated_at::text`,
    version: sql<string>`xmin::text`,
  }).from(solutionsTable).where(eq(solutionsTable.id, duplicate.id));
  assert.ok(microsecondRow.precise.endsWith(".123456"), "Fixture must retain PostgreSQL microseconds");
  // A distinct committed write with the SAME timestamp still invalidates CAS.
  await db.update(solutionsTable).set({ title }).where(eq(solutionsTable.id, duplicate.id));
  const staleWrite = await db.update(solutionsTable).set({ title: "must never overwrite" })
    .where(and(eq(solutionsTable.id, duplicate.id), sql`xmin::text = ${microsecondRow.version}`))
    .returning({ id: solutionsTable.id });
  assert.equal(staleWrite.length, 0, "Stale row versions must not overwrite newer edits even when timestamps match");
  const duplicateWarning = await json(
    `/admin/solutions/${duplicate.id}/publish`, "POST", { reviewed: true }, solutionAdmin, 409,
  );
  assert.equal(duplicateWarning.code, "POSSIBLE_DUPLICATES");
  assert.ok(duplicateWarning.duplicates.some((row: Json) => row.id === draft.id));
  const duplicatePublished = await json(
    `/admin/solutions/${duplicate.id}/publish`,
    "POST",
    { reviewed: true, overrideDuplicate: true },
    solutionAdmin,
  );
  assert.equal(duplicatePublished.status, "published");
  const discoveryOptions = (await request("/solutions/taxonomies")).body;
  assert.ok(discoveryOptions.brands.includes(runId), "Published free-text brand must be discoverable without a manual taxonomy");
  assert.ok(discoveryOptions.categories.includes(freeTextCategory), "Published AI/free-text category must be discoverable");
  assert.ok(discoveryOptions.categories.includes(category.name), "Manual taxonomy options remain available");
  assert.equal(discoveryOptions.brands.filter((name: string) => name === runId).length, 1, "Repeated published metadata is deduplicated");
  assert.ok(!discoveryOptions.taxonomies.some((row: Json) => row.name === runId || row.name === freeTextCategory), "Supplemental options must never synthesize CRUD IDs");
  const freeTextResults = (await request(`/solutions?category=${encodeURIComponent(freeTextCategory)}`)).body;
  assert.ok(freeTextResults.solutions.some((row: Json) => row.id === duplicate.id), "Supplemental filter values must work with listing filters");

  const visitorList = (await request(`/solutions?search=${encodeURIComponent(runId)}&brand=${encodeURIComponent(runId)}`)).body;
  assert.ok(visitorList.solutions.some((row: Json) => row.id === draft.id));
  assert.equal(
    visitorList.solutions.find((row: Json) => row.id === draft.id)?.coverUrl,
    `/api/solutions/${slug}/cover`,
    "A published solution without a manual cover must expose its first screenshot only through the cover route",
  );
  const modelTokenRegression = (await request("/solutions?search=solutions-it-1789854289472-157b859d")).body;
  assert.ok(modelTokenRegression.solutions.some((row: Json) => row.id === draft.id), "Hyphenated numeric model IDs must use consistent PostgreSQL tokenization");
  const visitorSerialized = JSON.stringify(visitorList);
  assert.ok(!visitorSerialized.includes(rawNotes));
  assert.ok(!visitorSerialized.includes(`${runId} private body instruction`));
  assert.ok(!visitorSerialized.includes("/download"));
  assert.ok(!visitorSerialized.includes("/objects/solutions/"));

  const visitorDetail = (await request(`/solutions/${slug}`)).body;
  assert.equal(visitorDetail.entitled, false);
  assert.equal(visitorDetail.solution.content, undefined);
  assert.ok(!JSON.stringify(visitorDetail).includes(rawNotes));
  assert.ok(!JSON.stringify(visitorDetail).includes("/download"));

  const memberDetail = (await request(`/solutions/${slug}`, { auth: member })).body;
  assert.equal(memberDetail.entitled, true);
  assert.equal(memberDetail.solution.content.introduction, `${runId} member-only introduction`);
  assert.equal(memberDetail.solution.content.resources[0].url, `https://example.com/${runId}/download`);
  assert.equal(memberDetail.solution.images[0].id, imageId);

  await request(`/solutions/images/${imageId}`, { auth: member });
  await request(`/solutions/images/${imageId}`, { expected: 403 });
  await request(`/solutions/images/${imageId}`, { auth: expired, expected: 403 });
  await request(`/solutions/images/${imageId}`, { auth: standard, expected: 403 });
  await request(`/solutions/${slug}/cover`);

  const objectSuffix = storedImage.objectPath.replace(/^\/objects\//, "");
  await request(`/storage/objects/${objectSuffix}`, { expected: 404 });
  await request(`/storage/objects/%73olutions/${imageId}.webp`, { expected: 404 });
  await request(`/storage/objects/x/%252e%252e/solutions/${imageId}.webp`, { expected: 404 });

  await json(`/admin/solutions/${draft.id}/unpublish`, "POST", {}, solutionAdmin);
  await request(`/solutions/${slug}`, { expected: 404 });
  const afterUnpublish = (await request(`/solutions?search=${encodeURIComponent(slug)}`)).body;
  assert.ok(!afterUnpublish.solutions.some((row: Json) => row.id === draft.id));
  await json(`/admin/solutions/${duplicate.id}/unpublish`, "POST", {}, solutionAdmin);
  const afterFreeTextUnpublish = (await request("/solutions/taxonomies")).body;
  assert.ok(!afterFreeTextUnpublish.brands.includes(runId));
  assert.ok(!afterFreeTextUnpublish.categories.includes(freeTextCategory));

  await request(`/admin/solutions/taxonomies/${subcategory.id}`, {
    method: "DELETE", auth: solutionAdmin,
  });
  createdTaxonomyIds.splice(createdTaxonomyIds.indexOf(subcategory.id), 1);
  await request(`/admin/solutions/taxonomies/${category.id}`, {
    method: "DELETE", auth: solutionAdmin,
  });
  createdTaxonomyIds.splice(createdTaxonomyIds.indexOf(category.id), 1);

  console.log(`PASS ${runId}: Solutions API lifecycle, entitlement, ACL, taxonomy, duplicate, AI, and cleanup checks`);
} finally {
  await cleanup();
  await new Promise<void>(resolve => server.close(() => resolve()));
}