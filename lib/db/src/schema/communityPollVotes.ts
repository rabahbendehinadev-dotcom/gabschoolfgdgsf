import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { communityPostsTable } from "./communityPosts";
import { usersTable } from "./users";

export const communityPollVotesTable = pgTable(
  "community_poll_votes",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("community_poll_votes_post_user_uniq").on(t.postId, t.userId),
    index("community_poll_votes_post_idx").on(t.postId),
  ],
);