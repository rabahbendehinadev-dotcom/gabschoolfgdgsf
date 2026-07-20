import { pgTable, serial, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";
import { playlistsTable } from "./playlists";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  driveEmbedUrl: text("drive_embed_url").notNull(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  playlistId: integer("playlist_id").references(() => playlistsTable.id, { onDelete: "set null" }),
  partNumber: integer("part_number"),
  isVipOnly: boolean("is_vip_only").notNull().default(false),
  accessType: varchar("access_type", { length: 20 }).notNull().default("normal"),
  isVisible: boolean("is_visible").notNull().default(true),
  softwareLink: text("software_link"),
  driveParts: text("drive_parts"),
  // JSON [{label, objectPath}] — set once the video bytes are copied to App
  // Storage. When present, playback uses direct presigned GCS URLs instead of
  // proxying Drive bytes through this server (fixes buffering at scale).
  objectParts: text("object_parts"),
  // JSON per-part HLS metadata — set once the part has been transcoded to an
  // adaptive HLS ladder stored under .private/hls/{id}/part-{i}/ in App
  // Storage: [{ renditions: [{ name, height, bandwidth, segments: [{ file,
  // duration }] }] }]. When present, the player streams HLS (continuous
  // buffering + instant seek + auto quality on slow connections); the MP4
  // presigned URL remains as fallback.
  hlsParts: text("hls_parts"),
  // JSON per-part 720p copies stored back in Google Drive by the background
  // transcode worker: [{ fileId, size } | { skipped: true, reason } | null].
  // Index i matches driveParts index i. When an entry has fileId, the player
  // offers a lightweight 720p stream (default) alongside the original.
  lowParts: text("low_parts"),
  // Last transcode error for this video (worker retries on next scan).
  lowError: text("low_error"),
  migratedAt: timestamp("migrated_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({ id: true, createdAt: true });
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videosTable.$inferSelect;
