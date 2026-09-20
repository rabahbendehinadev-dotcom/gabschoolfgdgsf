import test from "node:test";
import assert from "node:assert/strict";
import { buildSolutionPublishedNotification, isFirstSolutionPublication } from "./solutionNotifications";

test("only a solution with no prior publication date is a first publication", () => {
  assert.equal(isFirstSolutionPublication(null), true);
  assert.equal(isFirstSolutionPublication(new Date("2026-01-01T00:00:00Z")), false);
});

test("published solution notification targets the existing active-user audience with stable deep link and dedupe key", () => {
  const notification = buildSolutionPublishedNotification({
    id: 7,
    slug: "tecno-spark-30c-frp",
    title: "Tecno Spark 30C FRP via Meta Mode",
    excerpt: "Protected teaser",
    brand: "Tecno",
    model: "Spark 30C",
    category: "FRP",
    tool: "UnlockTool",
  }, 3);
  assert.equal(notification.audienceType, "all");
  assert.equal(notification.title, "🛠️ حل تقني جديد");
  assert.equal(notification.body, "Tecno Spark 30C — FRP باستخدام UnlockTool");
  assert.equal(notification.targetPath, "/solutions/tecno-spark-30c-frp");
  assert.equal(notification.dedupeKey, "solution-published-7");
  assert.equal(notification.adminId, 3);
});