import { pgTable, serial, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const toolsTable = pgTable("tools", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  category: varchar("category", { length: 100 }).notNull().default("عام"),
  accessType: varchar("access_type", { length: 20 }).notNull().default("free"),
  passwordHash: text("password_hash"),
  downloadUrl: text("download_url").notNull().default(""),
  isPublished: boolean("is_published").notNull().default(true),
  version: varchar("version", { length: 50 }),
  fileSizeMb: varchar("file_size_mb", { length: 50 }),
  os: varchar("os", { length: 100 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertToolSchema = createInsertSchema(toolsTable).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTool = z.infer<typeof insertToolSchema>;
export type Tool = typeof toolsTable.$inferSelect;
