import { pgTable, serial, integer, text, varchar, boolean, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const communityPostsTable = pgTable(
  "community_posts",
  {
    id: serial("id").primaryKey(),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content"),
    title: varchar("title", { length: 180 }),
    category: varchar("category", { length: 30 }),
    // text | image | gallery | video
    postType: varchar("post_type", { length: 20 }).notNull().default("text"),
    // When true, the post's MEDIA is only fully accessible to VIP accounts.
    isVipLocked: boolean("is_vip_locked").notNull().default(true),
    isVisible: boolean("is_visible").notNull().default(true),
    // Admin moderation flags (used by later phases; kept here for forward-compat).
    isHidden: boolean("is_hidden").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    isImportant: boolean("is_important").notNull().default(false),
    isSolved: boolean("is_solved").notNull().default(false),
    isQuestion: boolean("is_question").notNull().default(false),
    pollOptions: jsonb("poll_options").$type<string[]>(),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    viewsCount: integer("views_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("community_posts_visible_created_idx").on(t.isVisible, t.createdAt),
    index("community_posts_author_idx").on(t.authorUserId),
  ],
);

export const insertCommunityPostSchema = createInsertSchema(communityPostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;
export type CommunityPost = typeof communityPostsTable.$inferSelect;
