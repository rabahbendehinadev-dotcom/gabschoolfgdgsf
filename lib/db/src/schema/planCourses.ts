import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { subscriptionPlansTable } from "./subscriptionPlans";
import { playlistsTable } from "./playlists";

export const planCoursesTable = pgTable(
  "plan_courses",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlansTable.id, { onDelete: "cascade" }),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => playlistsTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("plan_courses_unique").on(t.planId, t.playlistId)]
);

export type PlanCourse = typeof planCoursesTable.$inferSelect;
