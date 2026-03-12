import { Router, type IRouter } from "express";
import { db, videosTable, categoriesTable, visitLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { userAuth, optionalUserAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/videos", optionalUserAuth, async (req, res) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = req.query.search as string | undefined;

    const isVip = req.user?.accountType === "vip";
    let conditions = [eq(videosTable.isVisible, true)];

    if (!isVip) {
      conditions.push(eq(videosTable.isVipOnly, false));
    }

    if (categoryId) {
      conditions.push(eq(videosTable.categoryId, categoryId));
    }

    let query = db.select({
      id: videosTable.id,
      title: videosTable.title,
      description: videosTable.description,
      thumbnailUrl: videosTable.thumbnailUrl,
      driveEmbedUrl: videosTable.driveEmbedUrl,
      categoryId: videosTable.categoryId,
      categoryName: categoriesTable.name,
      isVipOnly: videosTable.isVipOnly,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .where(and(...conditions))
    .orderBy(videosTable.createdAt);

    let results = await query;

    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(v =>
        v.title.toLowerCase().includes(searchLower) ||
        v.description.toLowerCase().includes(searchLower)
      );
    }

    if (req.user) {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
      await db.insert(visitLogsTable).values({
        userId: req.user.id,
        path: "/videos",
        ip: clientIp,
      });
    }

    res.json(results.map(v => ({
      ...v,
      categoryName: v.categoryName || "",
      createdAt: v.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch videos" });
  }
});

router.get("/videos/:id", userAuth, async (req, res) => {
  try {
    const user = req.user!;
    const id = Number(req.params.id);

    const [video] = await db.select({
      id: videosTable.id,
      title: videosTable.title,
      description: videosTable.description,
      thumbnailUrl: videosTable.thumbnailUrl,
      driveEmbedUrl: videosTable.driveEmbedUrl,
      categoryId: videosTable.categoryId,
      categoryName: categoriesTable.name,
      isVipOnly: videosTable.isVipOnly,
      isVisible: videosTable.isVisible,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .where(eq(videosTable.id, id))
    .limit(1);

    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    if (!video.isVisible) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    if (video.isVipOnly && user.accountType !== "vip") {
      res.status(403).json({ message: "This video is only available for VIP accounts" });
      return;
    }

    const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
    await db.insert(visitLogsTable).values({
      userId: user.id,
      path: `/videos/${id}`,
      ip: clientIp,
    });

    res.json({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId,
      categoryName: video.categoryName || "",
      isVipOnly: video.isVipOnly,
      createdAt: video.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch video" });
  }
});

export default router;
