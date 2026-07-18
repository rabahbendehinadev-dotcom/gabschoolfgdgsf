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
        // Videos with explicit partNumber come first, ordered by partNumber
        // Then by sortOrder, then by createdAt
        if (a.partNumber !== null && b.partNumber !== null) return a.partNumber - b.partNumber;
        if (a.partNumber !== null) return -1;
        if (b.partNumber !== null) return 1;
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

// GET /playlists — returns all visible playlists with their category's videos
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

    // Collect all distinct categoryIds from these playlists
    const catIds = [...new Set(filtered.map(r => r.playlist.categoryId).filter(Boolean))];

    // Fetch all visible videos that belong to any of those categories
    const allVideos = catIds.length > 0
      ? await db.select().from(videosTable)
          .where(inArray(videosTable.categoryId, catIds as number[]))
          .orderBy(asc(videosTable.partNumber))
      : [];

    // For each playlist, show videos from its linked category
    const result = filtered.map(({ playlist, categoryName }) => {
      const videos = allVideos.filter(v => v.categoryId === playlist.categoryId);
      return buildPlaylistResponse({ ...playlist, categoryName: categoryName ?? "" }, videos);
    });

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlists" });
  }
});

// GET /playlists/:id — returns one playlist with all videos from its linked category
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

    // Fetch all visible videos that belong to the same category as this playlist
    const videos = await db.select().from(videosTable)
      .where(eq(videosTable.categoryId, row.playlist.categoryId))
      .orderBy(asc(videosTable.partNumber));

    res.json(buildPlaylistResponse({ ...row.playlist, categoryName: row.categoryName ?? "" }, videos));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlist" });
  }
});

export default router;
