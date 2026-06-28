import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { communityPostsTable } from "./communityPosts";

export const communityPostMediaTable = pgTable(
  "community_post_media",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    // image | video
    mediaType: varchar("media_type", { length: 20 }).notNull(),
    // Private original object path (e.g. "/objects/uploads/<uuid>"). VIP-only.
    objectPath: text("object_path").notNull(),
    // Non-VIP-safe visual: for images a low-res blurred preview; for videos the
    // author-provided thumbnail. Always safe to show as a teaser.
    previewObjectPath: text("preview_object_path"),
    // Optional full-resolution poster for videos (shown to VIP before play).
    thumbnailObjectPath: text("thumbnail_object_path"),
    width: integer("width"),
    height: integer("height"),
    durationSec: integer("duration_sec"),
    contentType: varchar("content_type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("community_post_media_post_idx").on(t.postId)],
);

export const insertCommunityPostMediaSchema = createInsertSchema(communityPostMediaTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommunityPostMedia = z.infer<typeof insertCommunityPostMediaSchema>;
export type CommunityPostMedia = typeof communityPostMediaTable.$inferSelect;
