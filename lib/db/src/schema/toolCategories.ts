import { pgTable, serial, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const toolCategoriesTable = pgTable("tool_categories", {
  id:        serial("id").primaryKey(),
  name:      varchar("name", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ToolCategory = typeof toolCategoriesTable.$inferSelect;
