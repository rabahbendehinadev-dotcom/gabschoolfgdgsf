import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { communityPostsTable } from "./communityPosts";
import { usersTable } from "./users";

export const communityCommentsTable = pgTable(
  "community_comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Self-reference: a reply points to its parent comment.
    parentId: integer("parent_id").references((): AnyPgColumn => communityCommentsTable.id, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    isHidden: boolean("is_hidden").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("community_comments_post_idx").on(t.postId),
    index("community_comments_parent_idx").on(t.parentId),
  ],
);

export const insertCommunityCommentSchema = createInsertSchema(communityCommentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCommunityComment = z.infer<typeof insertCommunityCommentSchema>;
export type CommunityComment = typeof communityCommentsTable.$inferSelect;
