import { Router, type IRouter } from "express";
import { db, videosTable, categoriesTable, visitLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { optionalUserAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/videos", optionalUserAuth, async (req, res) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = req.query.search as string | undefined;

    let conditions = [eq(videosTable.isVisible, true)];
    if (categoryId) {
      conditions.push(eq(videosTable.categoryId, categoryId));
    }

    const results = await db.select({
      id: videosTable.id,
      title: videosTable.title,
      description: videosTable.description,
      thumbnailUrl: videosTable.thumbnailUrl,
      driveEmbedUrl: videosTable.driveEmbedUrl,
      categoryId: videosTable.categoryId,
      categoryName: categoriesTable.name,
      isVipOnly: videosTable.isVipOnly,
      accessType: videosTable.accessType,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .where(and(...conditions))
    .orderBy(videosTable.createdAt);

    let filtered = results;
    if (search) {
      const s = search.toLowerCase();
      filtered = results.filter(v =>
        v.title.toLowerCase().includes(s) || v.description.toLowerCase().includes(s)
      );
    }

    if (req.user) {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
      await db.insert(visitLogsTable).values({ userId: req.user.id, path: "/videos", ip: clientIp });
    }

    res.json(filtered.map(v => ({
      ...v,
      categoryName: v.categoryName || "",
      createdAt: v.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch videos" });
  }
});

router.get("/videos/:id", optionalUserAuth, async (req, res) => {
  try {
    const user = req.user;
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
      accessType: videosTable.accessType,
      isVisible: videosTable.isVisible,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .where(eq(videosTable.id, id))
    .limit(1);

    if (!video || !video.isVisible) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    const accessType = video.accessType || "normal";

    if (accessType === "vip") {
      if (!user || user.accountType !== "vip") {
        res.status(403).json({ message: "This video is only available for VIP accounts" });
        return;
      }
    } else if (accessType === "normal") {
      if (!user || user.subscriptionType === "demo") {
        res.status(403).json({ message: "Subscribe to watch this video" });
        return;
      }
    }

    if (user) {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
      await db.insert(visitLogsTable).values({ userId: user.id, path: `/videos/${id}`, ip: clientIp });
    }

    res.json({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId,
      categoryName: video.categoryName || "",
      isVipOnly: video.isVipOnly,
      accessType: video.accessType,
      createdAt: video.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch video" });
  }
});

export default router;
