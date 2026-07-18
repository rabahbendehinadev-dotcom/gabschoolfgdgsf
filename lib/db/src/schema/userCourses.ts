import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const userCoursesTable = pgTable("user_courses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});
