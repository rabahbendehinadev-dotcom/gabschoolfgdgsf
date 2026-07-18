import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, inArray } from "drizzle-orm";
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
    imageUrl: (playlist as typeof playlist & { imageUrl?: string | null }).imageUrl ?? null,
    categoryId: playlist.categoryId,
    categoryName: playlist.categoryName || "",
    sortOrder: playlist.sortOrder,
    isVisible: playlist.isVisible,
    createdAt: playlist.createdAt.toISOString(),
    videos: videos
      .filter(v => v.isVisible)
      .sort((a, b) => {
        if (a.partNumber !== null && b.partNumber !== null &&
            a.partNumber !== undefined && b.partNumber !== undefined) {
          return a.partNumber - b.partNumber;
        }
        if (a.partNumber != null) return -1;
        if (b.partNumber != null) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
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

// GET /playlists — returns all visible playlists with videos from linked categories
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

    // Find categories linked to each playlist
    const linkedCategories = playlistIds.length > 0
      ? await db.select().from(categoriesTable)
          .where(inArray((categoriesTable as typeof categoriesTable & { linkedPlaylistId: typeof categoriesTable.id }).linkedPlaylistId, playlistIds))
      : [];

    // Get all videos from linked categories
    const linkedCatIds = [...new Set(linkedCategories.map(c => c.id))];
    const allVideos = linkedCatIds.length > 0
      ? await db.select().from(videosTable)
          .where(inArray(videosTable.categoryId, linkedCatIds))
          .orderBy(asc(videosTable.partNumber))
      : [];

    const result = filtered.map(({ playlist, categoryName }) => {
      // Find all categories linked to this playlist
      const catIds = linkedCategories
        .filter(c => (c as typeof c & { linkedPlaylistId?: number | null }).linkedPlaylistId === playlist.id)
        .map(c => c.id);
      const videos = allVideos.filter(v => catIds.includes(v.categoryId!));
      return buildPlaylistResponse({ ...playlist, categoryName: categoryName ?? "" }, videos);
    });

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlists" });
  }
});

// GET /playlists/:id — returns one playlist with videos from its linked categories
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

    // Find all categories linked to this playlist
    const linkedCats = await db.select().from(categoriesTable)
      .where(eq(
        (categoriesTable as typeof categoriesTable & { linkedPlaylistId: typeof categoriesTable.id }).linkedPlaylistId,
        id
      ));

    let videos: (typeof videosTable.$inferSelect)[] = [];
    if (linkedCats.length > 0) {
      const catIds = linkedCats.map(c => c.id);
      videos = await db.select().from(videosTable)
        .where(inArray(videosTable.categoryId, catIds))
        .orderBy(asc(videosTable.partNumber));
    }

    res.json(buildPlaylistResponse({ ...row.playlist, categoryName: row.categoryName ?? "" }, videos));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlist" });
  }
});

export default router;
