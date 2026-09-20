import test from "node:test";
import assert from "node:assert/strict";
import { localizedNotificationBody, localizedNotificationTitle, normalizeLocale } from "./notificationLocale";

test("normalizes unsupported notification locales to Arabic", () => {
  assert.equal(normalizeLocale("fr"), "fr");
  assert.equal(normalizeLocale("en-GB"), "ar");
  assert.equal(normalizeLocale(undefined), "ar");
});

test("localizes generated community bodies but preserves authored content", () => {
  assert.equal(
    localizedNotificationBody("comment", "fallback", "en", { actorName: "Sam", snippet: "Hello" }),
    "Sam commented: Hello",
  );
  assert.equal(
    localizedNotificationBody("community_vip_post", "نص كتبه المستخدم", "fr", {}),
    "نص كتبه المستخدم",
  );
});

test("localizes system notification titles without translating authored fallback text", () => {
  assert.equal(localizedNotificationTitle("solution_published", "custom body", "fr"), "🛠️ Nouvelle solution technique");
  assert.equal(localizedNotificationTitle("solution_published", "custom body", "en"), "🛠️ New technical solution");
  assert.equal(localizedNotificationTitle("solution_published", "custom body", "ar"), "🛠️ حل تقني جديد");
  assert.equal(localizedNotificationTitle("admin_broadcast", "Announcement authored by admin", "fr"), "Announcement authored by admin");
});