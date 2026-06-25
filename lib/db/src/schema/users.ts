import { pgTable, serial, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: varchar("google_id", { length: 255 }).unique(),
  fullName: varchar("full_name", { length: 255 }),
  profileImage: text("profile_image"),
  accountType: varchar("account_type", { length: 20 }).notNull().default("normal"),
  subscriptionType: varchar("subscription_type", { length: 20 }).notNull().default("demo"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  ipAddress: varchar("ip_address", { length: 45 }),
  ipAddress2: varchar("ip_address_2", { length: 45 }),
  ipFirstSeenAt: timestamp("ip_first_seen_at"),
  isActive: boolean("is_active").notNull().default(true),
  phone: varchar("phone", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
