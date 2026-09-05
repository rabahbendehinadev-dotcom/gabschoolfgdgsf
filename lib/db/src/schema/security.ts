import { pgTable, serial, integer, text, varchar, boolean, timestamp, real, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { adminsTable } from "./admins";

export const trustedDevicesTable = pgTable("trusted_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  credentialHash: varchar("credential_hash", { length: 64 }).notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  os: varchar("os", { length: 100 }),
  browser: varchar("browser", { length: 100 }),
  userAgent: text("user_agent"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  lastIp: varchar("last_ip", { length: 45 }),
  country: varchar("country", { length: 100 }),
  region: varchar("region", { length: 150 }),
  city: varchar("city", { length: 150 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  status: varchar("status", { length: 20 }).notNull().default("TRUSTED"),
  createdBy: varchar("created_by", { length: 20 }).notNull().default("AUTO"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("trusted_devices_user_idx").on(t.userId),
  uniqueIndex("trusted_devices_credential_hash_uniq").on(t.credentialHash),
  index("trusted_devices_status_idx").on(t.status),
]);

export const userSecuritySessionsTable = pgTable("user_security_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").notNull().references(() => trustedDevicesTable.id, { onDelete: "cascade" }),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  index("user_security_sessions_user_idx").on(t.userId),
  index("user_security_sessions_device_idx").on(t.deviceId),
  index("user_security_sessions_expires_idx").on(t.expiresAt),
]);

export const securityEventsTable = pgTable("security_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  deviceId: integer("device_id").references(() => trustedDevicesTable.id, { onDelete: "set null" }),
  sessionId: varchar("session_id", { length: 36 }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull().default("INFO"),
  riskScore: integer("risk_score").notNull().default(0),
  riskReasons: jsonb("risk_reasons").$type<string[]>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  country: varchar("country", { length: 100 }),
  region: varchar("region", { length: 150 }),
  city: varchar("city", { length: 150 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  distanceKm: real("distance_km"),
  elapsedSeconds: integer("elapsed_seconds"),
  reputation: jsonb("reputation").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  adminId: integer("admin_id").references(() => adminsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("security_events_user_idx").on(t.userId),
  index("security_events_ip_idx").on(t.ipAddress),
  index("security_events_type_idx").on(t.eventType),
  index("security_events_created_idx").on(t.createdAt),
]);

export const securityWhitelistsTable = pgTable("security_whitelists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  ipAddress: varchar("ip_address", { length: 45 }),
  reason: text("reason"),
  createdByAdminId: integer("created_by_admin_id").notNull().references(() => adminsTable.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("security_whitelists_user_idx").on(t.userId),
  index("security_whitelists_ip_idx").on(t.ipAddress),
]);
