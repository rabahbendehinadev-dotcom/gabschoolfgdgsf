import test from "node:test";
import assert from "node:assert/strict";
import { isSolutionsEntitled, solutionCard, solutionInputSchema, solutionContentSchema, emptySolutionContent, assertSolutionImageRefs, aiSolutionSchema, normalizeAiSolutionResources } from "./solutions";
import { canAccessAdminApi, hasAdminPermission } from "./adminSecurity";
import { isProtectedSolutionStoragePath } from "./solutionStorage";
import { ObjectStorageService, ObjectNotFoundError, parseObjectPath, signObjectURL } from "./objectStorage";

test("solutions entitlement reuses subscription rules WITHOUT community administrator bypass", () => {
  const demo = { accountType: "normal", subscriptionType: "demo", isActive: true, subscriptionExpiresAt: null, communityRole: "admin" };
  assert.equal(isSolutionsEntitled(demo), false);
  assert.equal(isSolutionsEntitled({ ...demo, accountType: "vip" }), true);
  assert.equal(isSolutionsEntitled({ ...demo, subscriptionType: "monthly" }), true);
  assert.equal(isSolutionsEntitled({ ...demo, subscriptionType: "monthly", subscriptionExpiresAt: "2000-01-01" }), false);
  assert.equal(isSolutionsEntitled({ ...demo, accountType: "vip", subscriptionExpiresAt: "2000-01-01" }), false);
  assert.equal(isSolutionsEntitled({ ...demo, accountType: "vip", isActive: false }), false);
  assert.equal(isSolutionsEntitled(undefined), false);
});
test("public projection has no protected content, downloads, storage refs, or raw notes", () => {
  const row = { id: 1, slug: "test", title: "Phone", excerpt: "Repair available", brand: "Brand", model: "Model", category: "Repair", subcategory: "", tool: "Tool", tags: [], coverImageId: "private-uuid", publishedAt: new Date("2026-01-01"), rawInput: "PRIVATE", content: { resources: [{ url: "https://secret.example/file" }], steps: ["PRIVATE"] }, objectPath: "/objects/solutions/secret", generationError: "PRIVATE", imageIds: ["PRIVATE"] };
  const publicData = solutionCard(row);
  const json = JSON.stringify(publicData);
  assert.equal(json.includes("PRIVATE"), false);
  assert.equal(json.includes("secret"), false);
  assert.equal(json.includes("private-uuid"), false);
  assert.deepEqual(Object.keys(publicData).sort(), ["id", "slug", "title", "excerpt", "brand", "model", "category", "subcategory", "tool", "tags", "coverUrl", "publishedAt"].sort());
  assert.equal(solutionCard({ ...row, coverImageId: null }).coverUrl, null);
});
test("all admin solutions mutations require dedicated permission, not support/content/community access", () => {
  for (const path of ["/admin/solutions", "/admin/solutions/1", "/admin/solutions/1/generate", "/admin/solutions/1/publish", "/admin/solutions/1/images", "/admin/solutions/images/a", "/admin/solutions/taxonomies"]) {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      assert.equal(canAccessAdminApi({ role: "support", permissions: ["manage_content", "manage_community"] }, method, path), false);
      assert.equal(canAccessAdminApi({ role: "support", permissions: ["manage_solutions"] }, method, path), true);
      assert.equal(canAccessAdminApi({ role: "super_admin" }, method, path), true);
    }
  }
  assert.equal(hasAdminPermission({ role: "support" }, "manage_solutions"), false);
});
test("image references must be attached to the same draft and remain selected", () => {
  const a = "a8a43081-1f88-40bf-a4eb-334b18fb8043";
  const b = "35a43081-1f88-40bf-a4eb-334b18fb8043";
  assert.doesNotThrow(() => assertSolutionImageRefs({ imageIds: [a], coverImageId: a }, [a]));
  assert.throws(() => assertSolutionImageRefs({ imageIds: [b] }, [a]), /Unknown/);
  assert.throws(() => assertSolutionImageRefs({ imageIds: [], coverImageId: a }, [a]), /removed/);
  assert.throws(() => assertSolutionImageRefs({ imageIds: [a, a] }, [a]), /Unknown/);
  assert.throws(() => assertSolutionImageRefs({ imageIds: [], content: { ...emptySolutionContent, steps: [{ title: "Step", text: "", imageIds: [a] }] } }, [a]), /removed/);
});
test("generic storage routes block solution namespace and encoded traversal aliases", () => {
  for (const path of ["/api/storage/objects/solutions/a.webp", "/api/storage/public-objects/../private/solutions/a.webp", "/api/storage/objects/%73olutions/a.webp", "/api/storage/objects/%2573olutions/a.webp", "/api/storage/local-signed?o=private%2Fsolutions%2Fa.webp", "/api/storage/thumbnails/solutions/a.webp"]) {
    assert.equal(isProtectedSolutionStoragePath(path), true, path);
  }
  assert.equal(isProtectedSolutionStoragePath("/api/storage/objects/uploads/normal.webp"), false);
});
test("shared resolver denies Solutions through every generic read, normalization, signing, and ACL path", async () => {
  const service = new ObjectStorageService();
  let nestedNamespace = "%73olutions";
  for (let i = 0; i < 12; i++) nestedNamespace = encodeURIComponent(nestedNamespace);
  const aliases = [
    "/objects/solutions/a.webp",
    "/objects/%73olutions/a.webp",
    "/objects/%2573olutions/a.webp",
    "/objects/uploads/../solutions/a.webp",
    "/objects/uploads\\..\\solutions\\a.webp",
    `/objects/${nestedNamespace}/a.webp`,
    "https://storage.googleapis.com/bucket/private/%73olutions/a.webp",
  ];
  for (const path of aliases) {
    await assert.rejects(service.getObjectEntityFile(path), ObjectNotFoundError);
    await assert.rejects(service.searchPublicObject(path), ObjectNotFoundError);
    assert.throws(() => service.normalizeObjectEntityPath(path), ObjectNotFoundError);
    assert.throws(() => parseObjectPath(path), ObjectNotFoundError);
    await assert.rejects(service.trySetObjectEntityAclPolicy(path, { visibility: "public", owner: "attacker" }), ObjectNotFoundError);
    await assert.rejects(service.downloadObject({ name: path } as any), ObjectNotFoundError);
    await assert.rejects(signObjectURL({ bucketName: "bucket", objectName: path, method: "GET", ttlSec: 10 }), ObjectNotFoundError);
  }
  assert.deepEqual(parseObjectPath("/bucket/private/uploads/normal.webp"), { bucketName: "bucket", objectName: "private/uploads/normal.webp" });
  assert.equal(service.normalizeObjectEntityPath("/objects/uploads/normal.webp"), "/objects/uploads/normal.webp");
  assert.deepEqual(parseObjectPath("/bucket/private/solutions/a.webp", { allowSolutions: true }), { bucketName: "bucket", objectName: "private/solutions/a.webp" });
});
test("strict mutation schema rejects publication, ownership and storage path injection", () => {
  for (const input of [{ status: "published" }, { createdBy: 1 }, { objectPath: "/objects/x" }, { content: { ...emptySolutionContent, html: "<script />" } }]) {
    assert.equal(solutionInputSchema.safeParse(input).success, false);
  }
});
test("resource links cannot execute scripts or reference local files", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,test", "ftp://host/file"]) {
    assert.equal(solutionContentSchema.safeParse({ ...emptySolutionContent, resources: [{ name: "File", type: "file", url }] }).success, false);
  }
  assert.equal(solutionContentSchema.safeParse({ ...emptySolutionContent, resources: [{ name: "File", type: "file", url: "https://vendor.example/file" }] }).success, true);
});
test("AI schema rejects missing sections, unexpected properties and malformed image IDs", () => {
  assert.equal(aiSolutionSchema.safeParse({ title: "Invented partial answer" }).success, false);
  assert.equal(solutionContentSchema.safeParse({ ...emptySolutionContent, steps: [{ title: "Step", text: "Notes", imageIds: ["unbound"] }] }).success, false);
});

const aiFixture = (resources: unknown[], imageIds = [
  "a8a43081-1f88-40bf-a4eb-334b18fb8043",
  "35a43081-1f88-40bf-a4eb-334b18fb8043",
  "45a43081-1f88-40bf-a4eb-334b18fb8043",
]) => ({
  title: "Fixture", slug: "fixture", excerpt: "Fixture excerpt", brand: "", model: "", category: "", subcategory: "", tool: "",
  tags: [], keywords: [], imageIds, coverImageId: null, reviewFlags: [],
  content: { ...emptySolutionContent, resources },
});

test("AI generation without a supplied URL succeeds with no resources and keeps three screenshots", () => {
  const normalized = normalizeAiSolutionResources(aiFixture([
    { name: "Invented download", type: "file", url: "N/A" },
    { name: "Placeholder", type: "external", url: "#" },
  ]), new Set());
  const parsed = aiSolutionSchema.parse(normalized);
  assert.deepEqual(parsed.content.resources, []);
  assert.equal(parsed.imageIds.length, 3);
});

test("AI generation preserves a strict resource matching a supplied HTTPS URL", () => {
  const url = "https://vendor.example/download/file.zip";
  const resource = { name: "Vendor download", type: "file", url, version: "1.0" };
  const parsed = aiSolutionSchema.parse(normalizeAiSolutionResources(aiFixture([resource]), new Set([url])));
  assert.deepEqual(parsed.content.resources, [resource]);
});

test("AI generation discards only an invalid optional resource and keeps the article", () => {
  const parsed = aiSolutionSchema.parse(normalizeAiSolutionResources(aiFixture([
    { name: "Invalid", type: "tool", url: "" },
  ]), new Set()));
  assert.equal(parsed.title, "Fixture");
  assert.deepEqual(parsed.content.resources, []);
});