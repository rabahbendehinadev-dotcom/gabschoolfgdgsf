import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { adminsTable } from "./admins";

/**
 * A single notification "event" (the source). Fan-out happens into
 * `notification_recipients` so each user gets their own read state and we can
 * report accurate reached/opened counts.
 *
 * type:        community_vip_post | comment | reply | like | admin_broadcast
 * audienceType: all | vip | normal | user | category
 * targetType:  post | lesson | page | none
 */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull().default(""),
    // The user who triggered a community event (commenter / liker / poster).
    actorUserId: integer("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // The admin who sent a broadcast.
    adminId: integer("admin_id").references(() => adminsTable.id, {
      onDelete: "set null",
    }),
    audienceType: varchar("audience_type", { length: 20 }),
    audienceValue: varchar("audience_value", { length: 100 }),
    targetType: varchar("target_type", { length: 20 }).notNull().default("none"),
    targetId: integer("target_id"),
    targetPath: varchar("target_path", { length: 255 }),
    metadata: jsonb("metadata"),
    // Prevents duplicate notifications for the same logical event
    // (e.g. like:<postId>:<actorUserId>).
    dedupeKey: varchar("dedupe_key", { length: 150 }).unique(),
    recipientCount: integer("recipient_count").notNull().default(0),
    pushAttemptedCount: integer("push_attempted_count").notNull().default(0),
    pushSuccessCount: integer("push_success_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

export type Notification = typeof notificationsTable.$inferSelect;
