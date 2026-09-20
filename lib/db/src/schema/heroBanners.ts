import { pgTable, serial, text, boolean, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const heroBannersTable = pgTable(
  "hero_banners",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    desktopImagePath: text("desktop_image_path"),
    mobileImagePath: text("mobile_image_path"),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("hero_banners_active_order_idx").on(table.isActive, table.sortOrder),
    uniqueIndex("hero_banners_sort_order_unique").on(table.sortOrder),
  ],
);

export const heroBannerCleanupQueueTable = pgTable(
  "hero_banner_cleanup_queue",
  {
    id: serial("id").primaryKey(),
    objectPath: text("object_path").notNull().unique(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("hero_banner_cleanup_queue_pending_idx").on(table.updatedAt, table.id)],
);