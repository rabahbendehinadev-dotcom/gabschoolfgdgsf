import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const courseAccessLogsTable = pgTable("course_access_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  action: text("action").notNull(),
  adminId: integer("admin_id"),
  adminName: text("admin_name"),
  adminRole: text("admin_role"),
  grantSource: text("grant_source"),
  reason: text("reason"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  extraData: jsonb("extra_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
