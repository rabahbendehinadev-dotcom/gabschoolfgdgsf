import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc } from "drizzle-orm";
import { db, playlistsTable, videosTable, categoriesTable } from "@workspace/db";
import { optionalUserAuth } from "../middlewares/auth";

const router: IRouter = Router();

function buildPlaylistResponse(
  playlist: typeof playlistsTable.$inferSelect & { categoryName?: string },
  videos: (typeof videosTable.$inferSelect)[]
) {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    categoryId: playlist.categoryId,
    categoryName: playlist.categoryName || "",
    sortOrder: playlist.sortOrder,
    isVisible: playlist.isVisible,
    createdAt: playlist.createdAt.toISOString(),
    videos: videos
      .filter(v => v.isVisible)
      .sort((a, b) => (a.partNumber ?? 999) - (b.partNumber ?? 999))
      .map(v => ({
        id: v.id,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        partNumber: v.partNumber,
        accessType: v.accessType,
        isVisible: v.isVisible,
        createdAt: v.createdAt.toISOString(),
      })),
  };
}

router.get("/playlists", optionalUserAuth, async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;

    const rows = await db
      .select({
        playlist: playlistsTable,
        categoryName: categoriesTable.name,
      })
      .from(playlistsTable)
      .leftJoin(categoriesTable, eq(playlistsTable.categoryId, categoriesTable.id))
      .where(eq(playlistsTable.isVisible, true))
      .orderBy(asc(playlistsTable.sortOrder), asc(playlistsTable.createdAt));

    const filtered = categoryId
      ? rows.filter(r => r.playlist.categoryId === categoryId)
      : rows;

    const playlistIds = filtered.map(r => r.playlist.id);
    const allVideos = playlistIds.length > 0
      ? await db.select().from(videosTable)
          .where(eq(videosTable.isVisible, true))
          .orderBy(asc(videosTable.partNumber))
      : [];

    const result = filtered.map(({ playlist, categoryName }) => {
      const videos = allVideos.filter(v => v.playlistId === playlist.id);
      return buildPlaylistResponse({ ...playlist, categoryName: categoryName ?? "" }, videos);
    });

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlists" });
  }
});

router.get("/playlists/:id", optionalUserAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ playlist: playlistsTable, categoryName: categoriesTable.name })
      .from(playlistsTable)
      .leftJoin(categoriesTable, eq(playlistsTable.categoryId, categoriesTable.id))
      .where(eq(playlistsTable.id, id))
      .limit(1);

    if (!row || !row.playlist.isVisible) {
      res.status(404).json({ message: "Playlist not found" });
      return;
    }

    const videos = await db.select().from(videosTable)
      .where(eq(videosTable.playlistId, id))
      .orderBy(asc(videosTable.partNumber));

    res.json(buildPlaylistResponse({ ...row.playlist, categoryName: row.categoryName ?? "" }, videos));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlist" });
  }
});

export default router;
