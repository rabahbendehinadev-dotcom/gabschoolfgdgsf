import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";

export const userCoursesTable = pgTable("user_courses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  grantedBy: text("granted_by"),
  adminId: integer("admin_id"),
  adminRole: text("admin_role"),
  grantSource: text("grant_source").default("manual"),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("active"),
});
