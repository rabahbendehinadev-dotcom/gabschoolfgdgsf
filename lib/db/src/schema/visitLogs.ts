import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const visitLogsTable = pgTable("visit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  path: varchar("path", { length: 500 }),
  ip: varchar("ip", { length: 45 }),
  visitedAt: timestamp("visited_at").notNull().defaultNow(),
});

export type VisitLog = typeof visitLogsTable.$inferSelect;
