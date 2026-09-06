import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityPostNotification } from "./communityNotifications";

test("VIP-authored posts notify everyone except the author once", () => {
  const notification = buildCommunityPostNotification({
    authorUserId: 11,
    postId: 101,
    body: "VIP post",
  });

  assert.equal(notification.audienceType, "all");
  assert.deepEqual(notification.excludeUserIds, [11]);
  assert.equal(notification.dedupeKey, "community-post-101");
});

test("non-VIP-authored posts use the same notification and push path", () => {
  const notification = buildCommunityPostNotification({
    authorUserId: 22,
    postId: 202,
    body: "Community post",
  });

  assert.equal(notification.type, "community_vip_post");
  assert.equal(notification.targetPath, "/community");
  assert.deepEqual(notification.excludeUserIds, [22]);
  assert.equal(notification.dedupeKey, "community-post-202");
});

test("a post has one stable dedupe key", () => {
  const first = buildCommunityPostNotification({
    authorUserId: 33,
    postId: 303,
    body: "First attempt",
  });
  const retry = buildCommunityPostNotification({
    authorUserId: 33,
    postId: 303,
    body: "Retry",
  });

  assert.equal(first.dedupeKey, retry.dedupeKey);
});