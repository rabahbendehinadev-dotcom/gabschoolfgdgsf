import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const paymentSubmissionsTable = pgTable("payment_submissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  customerName: varchar("customer_name", { length: 150 }).notNull(),
  planType: varchar("plan_type", { length: 50 }).notNull(),
  planPrice: varchar("plan_price", { length: 100 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  proofObjectPath: text("proof_object_path"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentSubmission = typeof paymentSubmissionsTable.$inferSelect;
