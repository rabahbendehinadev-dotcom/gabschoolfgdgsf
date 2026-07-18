import { Router, type IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";
import { asc, eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/categories", async (req, res) => {
  try {
    const playlistId = req.query.playlistId ? Number(req.query.playlistId) : undefined;

    const conditions: Parameters<typeof and>[0][] = [
      eq(categoriesTable.isVisible, true),
    ];

    if (playlistId && Number.isFinite(playlistId)) {
      conditions.push(eq(categoriesTable.linkedPlaylistId, playlistId));
    }

    const categories = await db
      .select()
      .from(categoriesTable)
      .where(and(...conditions))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));

    res.json(categories);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch categories" });
  }
});

export default router;
