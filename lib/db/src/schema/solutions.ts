import { pgTable, serial, text, integer, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";

export const solutionTaxonomiesTable = pgTable("solution_taxonomies", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
});
export const solutionsTable = pgTable("solutions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  brand: text("brand").notNull().default(""),
  model: text("model").notNull().default(""),
  category: text("category").notNull().default(""),
  subcategory: text("subcategory").notNull().default(""),
  tool: text("tool").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  rawInput: text("raw_input").notNull().default(""),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
  imageIds: jsonb("image_ids").$type<string[]>().notNull().default([]),
  coverImageId: uuid("cover_image_id"),
  aiCoverImageId: uuid("ai_cover_image_id"),
  customCoverImageId: uuid("custom_cover_image_id"),
  reviewFlags: jsonb("review_flags").$type<string[]>().notNull().default([]),
  generationError: text("generation_error"),
  coverGenerationError: text("cover_generation_error"),
  status: text("status").notNull().default("draft"),
  createdBy: integer("created_by").notNull(),
  publishedAt: timestamp("published_at"),
  publicationNotificationSentAt: timestamp("publication_notification_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [index("solutions_discovery_idx").on(t.status, t.publishedAt), index("solutions_filters_idx").on(t.brand, t.category, t.tool)]);
export const solutionImagesTable = pgTable("solution_images", {
  id: uuid("id").primaryKey(),
  solutionId: integer("solution_id").notNull().references(() => solutionsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  name: text("name").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
}, t => [index("solution_images_solution_idx").on(t.solutionId)]);