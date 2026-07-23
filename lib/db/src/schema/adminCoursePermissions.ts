import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const adminCoursePermissionsTable = pgTable("admin_course_permissions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  playlistId: integer("playlist_id").notNull(),
  canGrantAccess: boolean("can_grant_access").notNull().default(true),
  canRemoveAccess: boolean("can_remove_access").notNull().default(true),
  canViewUsers: boolean("can_view_users").notNull().default(true),
  canManageVideos: boolean("can_manage_videos").notNull().default(false),
  canManageCategories: boolean("can_manage_categories").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by"),
});
