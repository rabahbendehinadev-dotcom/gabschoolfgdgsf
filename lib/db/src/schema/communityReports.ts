import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { communityPostsTable } from "./communityPosts";
import { communityCommentsTable } from "./communityComments";
import { usersTable } from "./users";

export const communityReportsTable = pgTable(
  "community_reports",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").references(() => communityPostsTable.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => communityCommentsTable.id, { onDelete: "cascade" }),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("community_reports_post_idx").on(t.postId),
    index("community_reports_comment_idx").on(t.commentId),
    index("community_reports_status_idx").on(t.status),
    index("community_reports_reporter_idx").on(t.reporterId),
  ],
);

export type CommunityReport = typeof communityReportsTable.$inferSelect;
