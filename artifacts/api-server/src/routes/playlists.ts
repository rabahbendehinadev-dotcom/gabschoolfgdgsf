import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc, inArray, and } from "drizzle-orm";
import { db, playlistsTable, videosTable, categoriesTable, userCoursesTable } from "@workspace/db";
import { optionalUserAuth, userAuth } from "../middlewares/auth";

const router: IRouter = Router();

function buildPlaylistResponse(
  playlist: typeof playlistsTable.$inferSelect & { categoryName?: string },
  videos: (typeof videosTable.$inferSelect)[]
) {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    imageUrl: (playlist as any).imageUrl ?? null,
    thumbnailUrl: (playlist as any).thumbnailUrl ?? null,
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

// GET /playlists/:id — returns one playlist with sections (categories + their videos)
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

    // ── Course access check — user must have this playlist in user_courses ──
    const user = req.user;
    const hasAccess = user
      ? (await db.select({ playlistId: userCoursesTable.playlistId })
          .from(userCoursesTable)
          .where(and(eq(userCoursesTable.userId, user.id), eq(userCoursesTable.playlistId, id)))
          .limit(1)).length > 0
      : false;

    if (!hasAccess) {
      const imageUrl = (row.playlist as typeof row.playlist & { imageUrl?: string | null }).imageUrl ?? null;
      res.json({
        id: row.playlist.id,
        title: row.playlist.title,
        description: row.playlist.description,
        imageUrl,
        isVisible: row.playlist.isVisible,
        createdAt: row.playlist.createdAt.toISOString(),
        locked: true,
        sections: [],
        videos: [],
      });
      return;
    }

    // Find all categories linked to this playlist
    const linkedCats = await db.select().from(categoriesTable)
      .where(eq(
        (categoriesTable as typeof categoriesTable & { linkedPlaylistId: typeof categoriesTable.id }).linkedPlaylistId,
        id
      ))
      .orderBy(asc(categoriesTable.sortOrder));

    let allVideos: (typeof videosTable.$inferSelect)[] = [];
    if (linkedCats.length > 0) {
      const catIds = linkedCats.map(c => c.id);
      allVideos = await db.select().from(videosTable)
        .where(inArray(videosTable.categoryId, catIds))
        .orderBy(asc(videosTable.partNumber));
    }

    const visibleVideos = allVideos.filter(v => v.isVisible);

    // Build sections: one per linked category
    const sections = linkedCats.map(cat => ({
      id: cat.id,
      name: cat.name,
      imageUrl: (cat as typeof cat & { imageUrl?: string | null }).imageUrl ?? null,
      accentColor: (cat as typeof cat & { accentColor?: string | null }).accentColor ?? null,
      videos: visibleVideos
        .filter(v => v.categoryId === cat.id)
        .map(v => ({
          id: v.id,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          partNumber: v.partNumber,
          accessType: v.accessType,
          isVisible: v.isVisible,
          createdAt: v.createdAt.toISOString(),
        })),
    }));

    const imageUrl = (row.playlist as typeof row.playlist & { imageUrl?: string | null }).imageUrl ?? null;

    res.json({
      id: row.playlist.id,
      title: row.playlist.title,
      description: row.playlist.description,
      imageUrl,
      isVisible: row.playlist.isVisible,
      createdAt: row.playlist.createdAt.toISOString(),
      sections,
      // flat videos list kept for backward compat
      videos: visibleVideos.map(v => ({
        id: v.id,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        partNumber: v.partNumber,
        accessType: v.accessType,
        isVisible: v.isVisible,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlist" });
  }
});

// GET /user/courses — returns playlists assigned to the current user via user_courses table
router.get("/user/courses", userAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as typeof req & { user?: { id: number } }).user!.id;
    const assignments = await db.select({ playlistId: userCoursesTable.playlistId })
      .from(userCoursesTable)
      .where(eq(userCoursesTable.userId, userId));

    if (assignments.length === 0) {
      res.json([]);
      return;
    }

    const playlistIds = assignments.map(a => a.playlistId);

    const rows = await db.select({
      playlist: playlistsTable,
      categoryName: categoriesTable.name,
    })
      .from(playlistsTable)
      .leftJoin(categoriesTable, eq(playlistsTable.categoryId, categoriesTable.id))
      .where(and(eq(playlistsTable.isVisible, true), inArray(playlistsTable.id, playlistIds)))
      .orderBy(asc(playlistsTable.sortOrder), asc(playlistsTable.createdAt));

    const linkedCategories = rows.length > 0
      ? await db.select().from(categoriesTable).where(inArray(
          (categoriesTable as typeof categoriesTable & { linkedPlaylistId: typeof categoriesTable.id }).linkedPlaylistId,
          playlistIds
        ))
      : [];

    const linkedCatIds = linkedCategories.map(c => c.id);
    const allVideos = linkedCatIds.length > 0
      ? await db.select().from(videosTable)
          .where(inArray(videosTable.categoryId, linkedCatIds))
          .orderBy(asc(videosTable.partNumber))
      : [];

    const result = rows.map(({ playlist, categoryName }) => {
      const catIds = linkedCategories
        .filter(c => (c as typeof c & { linkedPlaylistId?: number | null }).linkedPlaylistId === playlist.id)
        .map(c => c.id);
      const videos = allVideos.filter(v => catIds.includes(v.categoryId!));
      return buildPlaylistResponse({ ...playlist, categoryName: categoryName ?? "" }, videos);
    });

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch user courses" });
  }
});

export default router;
