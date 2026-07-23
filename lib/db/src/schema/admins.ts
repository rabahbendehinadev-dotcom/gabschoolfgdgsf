import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminsTable = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("super_admin"),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: text("last_login_ip"),
});

export const insertAdminSchema = createInsertSchema(adminsTable).omit({ id: true });
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof adminsTable.$inferSelect;
