import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { communityPostsTable } from "./communityPosts";
import { usersTable } from "./users";

export const communityPostLikesTable = pgTable(
  "community_post_likes",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("community_post_likes_post_user_uniq").on(t.postId, t.userId)],
);

export type CommunityPostLike = typeof communityPostLikesTable.$inferSelect;
