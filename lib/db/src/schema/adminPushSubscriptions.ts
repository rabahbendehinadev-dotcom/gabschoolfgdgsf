import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { adminsTable } from "./admins";

export const adminPushSubscriptionsTable = pgTable("admin_push_subscriptions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id")
    .notNull()
    .references(() => adminsTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  failedAt: timestamp("failed_at"),
});

export type AdminPushSubscription = typeof adminPushSubscriptionsTable.$inferSelect;
