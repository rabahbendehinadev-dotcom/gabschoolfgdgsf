import {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { notificationsTable } from "./notifications";
import { usersTable } from "./users";

/**
 * Per-user delivery of a notification. `readAt` doubles as the "opened" marker
 * (a notification becomes read when the user opens it), which drives both the
 * unread badge and the admin "opened count".
 */
export const notificationRecipientsTable = pgTable(
  "notification_recipients",
  {
    id: serial("id").primaryKey(),
    notificationId: integer("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    deliveredAt: timestamp("delivered_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (t) => [
    uniqueIndex("notification_recipients_unique").on(t.notificationId, t.userId),
    index("notification_recipients_user_idx").on(t.userId, t.readAt),
  ],
);

export type NotificationRecipient = typeof notificationRecipientsTable.$inferSelect;
