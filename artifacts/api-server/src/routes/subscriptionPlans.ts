import { Router, type IRouter } from "express";
import { db, subscriptionPlansTable, planCoursesTable, playlistsTable, videosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/subscription-plans", async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isHidden, false));

    if (plans.length === 0) { res.json([]); return; }

    const planIds = plans.map(p => p.id);
    const pcRows = await db.select().from(planCoursesTable)
      .where(inArray(planCoursesTable.planId, planIds));

    const playlistIds = [...new Set(pcRows.map(r => r.playlistId))];

    let playlistMap: Map<number, { id: number; title: string; thumbnailUrl: string | null; imageUrl: string | null; description: string }> = new Map();
    let lessonCountMap: Map<number, number> = new Map();

    if (playlistIds.length > 0) {
      const playlists = await db.select({
        id: playlistsTable.id,
        title: playlistsTable.title,
        thumbnailUrl: playlistsTable.thumbnailUrl,
        imageUrl: playlistsTable.imageUrl,
        description: playlistsTable.description,
      }).from(playlistsTable).where(inArray(playlistsTable.id, playlistIds));

      for (const pl of playlists) playlistMap.set(pl.id, pl);

      const videos = await db.select({ playlistId: videosTable.playlistId })
        .from(videosTable)
        .where(inArray(videosTable.playlistId, playlistIds));
      for (const v of videos) {
        if (v.playlistId != null)
          lessonCountMap.set(v.playlistId, (lessonCountMap.get(v.playlistId) ?? 0) + 1);
      }
    }

    const pcByPlan = new Map<number, number[]>();
    for (const r of pcRows) {
      if (!pcByPlan.has(r.planId)) pcByPlan.set(r.planId, []);
      pcByPlan.get(r.planId)!.push(r.playlistId);
    }

    const result = plans.map(plan => ({
      ...plan,
      courses: (pcByPlan.get(plan.id) ?? []).map(pid => {
        const pl = playlistMap.get(pid);
        return {
          id: pid,
          title: pl?.title ?? "",
          thumbnail: pl?.thumbnailUrl ?? pl?.imageUrl ?? null,
          lessonCount: lessonCountMap.get(pid) ?? 0,
          description: pl?.description ?? "",
        };
      }),
    }));

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch plans" });
  }
});

export default router;
