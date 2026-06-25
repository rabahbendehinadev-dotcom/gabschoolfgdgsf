import { Router, type IRouter } from "express";
import { db, videosTable, categoriesTable, visitLogsTable, playlistsTable, activityLogsTable } from "@workspace/db";
import { eq, and, or, asc, sql, isNull } from "drizzle-orm";
import { optionalUserAuth, userAuth } from "../middlewares/auth";
import { getClientIp } from "../lib/ipPolicy";
import { deviceTypeFromUA } from "../lib/device";

const router: IRouter = Router();

// Allowed client-reported security events (allowlist — never trust arbitrary input).
const SECURITY_EVENTS = new Set([
  "external_open_attempt",
  "copy_link_attempt",
  "devtools_attempt",
]);

// Best-effort insert of a video-related activity log row. Never throws.
async function logVideoActivity(opts: {
  user?: { id: number; username: string } | null;
  action: string;
  videoId: number;
  videoTitle?: string | null;
  details?: string | null;
  ip: string;
  ua?: string | null;
}): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      userId: opts.user?.id ?? null,
      username: opts.user?.username ?? null,
      action: opts.action,
      details: opts.details ?? null,
      ipAddress: opts.ip,
      deviceType: deviceTypeFromUA(opts.ua),
      userAgent: opts.ua ?? null,
      videoId: opts.videoId,
      videoTitle: opts.videoTitle ?? null,
    });
  } catch {
    /* best-effort: logging must never break the request */
  }
}

router.get("/videos", optionalUserAuth, async (req, res) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = req.query.search as string | undefined;

    let conditions = [
      eq(videosTable.isVisible, true),
      or(eq(categoriesTable.isVisible, true), isNull(videosTable.categoryId)),
    ];
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
      playlistId: videosTable.playlistId,
      partNumber: videosTable.partNumber,
      isVipOnly: videosTable.isVipOnly,
      accessType: videosTable.accessType,
      sortOrder: videosTable.sortOrder,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .where(and(...conditions))
    .orderBy(asc(videosTable.sortOrder), asc(videosTable.createdAt));

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
      playlistId: videosTable.playlistId,
      partNumber: videosTable.partNumber,
      isVipOnly: videosTable.isVipOnly,
      accessType: videosTable.accessType,
      isVisible: videosTable.isVisible,
      softwareLink: videosTable.softwareLink,
      driveParts: videosTable.driveParts,
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
    const isVipUser = user?.accountType === "vip";
    const isSubscribed = user && user.subscriptionType !== "demo";

    // Log + deny when a user tries to open a video they are not entitled to.
    const denyVideoAccess = async (message: string) => {
      await logVideoActivity({
        user,
        action: "locked_video_attempt",
        videoId: id,
        videoTitle: video.title,
        details: `accessType=${accessType} | accountType=${user?.accountType ?? "guest"}`,
        ip: getClientIp(req),
        ua: req.headers["user-agent"],
      });
      res.status(403).json({ message });
    };

    if (accessType === "vip") {
      if (!isVipUser) {
        await denyVideoAccess("This video is only available for VIP accounts");
        return;
      }
    } else if (accessType === "normal") {
      if (!isVipUser && !isSubscribed) {
        await denyVideoAccess("Subscribe to watch this video");
        return;
      }
    }

    if (user) {
      await db.insert(visitLogsTable).values({ userId: user.id, path: `/videos/${id}`, ip: getClientIp(req) });
    }

    // Fetch playlist info if video belongs to a playlist
    let playlistInfo = null;
    if (video.playlistId) {
      const [pl] = await db.select().from(playlistsTable).where(eq(playlistsTable.id, video.playlistId)).limit(1);
      const siblingVideos = await db.select({
        id: videosTable.id, title: videosTable.title, partNumber: videosTable.partNumber,
        thumbnailUrl: videosTable.thumbnailUrl, accessType: videosTable.accessType, isVisible: videosTable.isVisible,
      }).from(videosTable).where(and(eq(videosTable.playlistId, video.playlistId), eq(videosTable.isVisible, true))).orderBy(asc(videosTable.partNumber));
      if (pl) {
        playlistInfo = {
          id: pl.id, title: pl.title, description: pl.description,
          videos: siblingVideos,
        };
      }
    }

    res.json({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId,
      categoryName: video.categoryName || "",
      playlistId: video.playlistId,
      partNumber: video.partNumber,
      isVipOnly: video.isVipOnly,
      accessType: video.accessType,
      softwareLink: isVipUser ? (video.softwareLink ?? null) : null,
      driveParts: video.driveParts ?? null,
      createdAt: video.createdAt.toISOString(),
      playlist: playlistInfo,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch video" });
  }
});

router.post("/videos/:id/violation", optionalUserAuth, async (req, res) => {
  try {
    const videoId = Number(req.params.id);
    const { count } = req.body as { count?: number };
    const [video] = await db
      .select({ title: videosTable.title })
      .from(videosTable)
      .where(eq(videosTable.id, videoId))
      .limit(1);

    await logVideoActivity({
      user: req.user,
      action: "screenshot_attempt",
      videoId,
      videoTitle: video?.title ?? null,
      details: `Attempt count: ${count ?? 1}`,
      ip: getClientIp(req),
      ua: req.headers["user-agent"],
    });

    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to log violation" });
  }
});

// Generic suspicious-activity reporter for the in-page player (right-click,
// copy-link, devtools, attempts to open the video outside the platform, etc.).
router.post("/videos/:id/security-event", optionalUserAuth, async (req, res) => {
  try {
    const videoId = Number(req.params.id);
    const { eventType, details } = req.body as { eventType?: string; details?: string };

    if (!eventType || !SECURITY_EVENTS.has(eventType)) {
      res.status(400).json({ message: "Invalid event type" });
      return;
    }

    const [video] = await db
      .select({ title: videosTable.title })
      .from(videosTable)
      .where(eq(videosTable.id, videoId))
      .limit(1);

    await logVideoActivity({
      user: req.user,
      action: eventType,
      videoId,
      videoTitle: video?.title ?? null,
      details: typeof details === "string" ? details.slice(0, 300) : null,
      ip: getClientIp(req),
      ua: req.headers["user-agent"],
    });

    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to log event" });
  }
});

export default router;
