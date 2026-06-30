import { Router, type IRouter } from "express";
import { db, videosTable, categoriesTable, visitLogsTable, playlistsTable, activityLogsTable, usersTable } from "@workspace/db";
import { eq, and, or, asc, sql, isNull } from "drizzle-orm";
import { optionalUserAuth, userAuth } from "../middlewares/auth";
import { getClientIp } from "../lib/ipPolicy";
import { deviceTypeFromUA } from "../lib/device";
import { generateVideoStreamToken, verifyVideoStreamToken } from "../lib/auth";
import { extractDriveFileId, streamDriveFile } from "../lib/googleDrive";

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

// Build the ordered list of playable parts for a video. driveParts (when present)
// is a JSON string of [{label,url}]; otherwise we fall back to the single
// driveEmbedUrl. The returned URLs are RAW Drive URLs used ONLY server-side to
// resolve a file id — they are never sent to the browser.
function resolveVideoParts(video: {
  driveEmbedUrl: string;
  driveParts: string | null;
}): { label: string; url: string }[] {
  if (video.driveParts) {
    try {
      const parsed = JSON.parse(video.driveParts) as Array<{ label?: string; url?: string }>;
      const valid = (Array.isArray(parsed) ? parsed : []).filter(
        (p) => p && typeof p.url === "string" && p.url.length > 0,
      );
      if (valid.length > 0) {
        return valid.map((p, i) => ({ label: p.label || `الجزء ${i + 1}`, url: p.url as string }));
      }
    } catch {
      /* malformed driveParts → fall back to the single embed url */
    }
  }
  if (video.driveEmbedUrl) return [{ label: "الفيديو", url: video.driveEmbedUrl }];
  return [];
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

    // Build same-origin, token-protected stream URLs — one per part. The raw
    // Drive URLs never leave the server; the browser only ever sees these.
    const partsList = resolveVideoParts({
      driveEmbedUrl: video.driveEmbedUrl,
      driveParts: video.driveParts,
    });
    const streamParts = partsList.map((p, i) => ({
      label: p.label,
      url: `/api/videos/${id}/stream/${i}?token=${generateVideoStreamToken({
        userId: user?.id ?? 0,
        videoId: id,
        part: i,
      })}`,
    }));

    res.json({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      categoryId: video.categoryId,
      categoryName: video.categoryName || "",
      playlistId: video.playlistId,
      partNumber: video.partNumber,
      isVipOnly: video.isVipOnly,
      accessType: video.accessType,
      softwareLink: isVipUser ? (video.softwareLink ?? null) : null,
      streamParts,
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

// Token-protected, same-origin video stream. The native <video> element cannot
// send Authorization headers, so the player passes a short-lived signed token in
// the query string. We re-verify ENTITLEMENT here on every request (never trust
// the token alone) and pipe the private Drive bytes through our own server.
router.get("/videos/:id/stream/:part", async (req, res) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : null;
    const payload = token ? verifyVideoStreamToken(token) : null;
    if (!payload) {
      console.warn("[video-stream] DENY 401: missing/invalid token", {
        videoId: req.params.id,
        part: req.params.part,
        hasToken: !!token,
      });
      res.status(401).end();
      return;
    }

    const id = Number(req.params.id);
    const part = Number(req.params.part);
    if (
      !Number.isInteger(id) ||
      !Number.isInteger(part) ||
      part < 0 ||
      payload.videoId !== id ||
      payload.part !== part
    ) {
      console.warn("[video-stream] DENY 403: token/route mismatch", {
        routeId: id,
        routePart: part,
        tokenVideoId: payload.videoId,
        tokenPart: payload.part,
      });
      res.status(403).end();
      return;
    }

    const [video] = await db
      .select({
        isVisible: videosTable.isVisible,
        accessType: videosTable.accessType,
        driveEmbedUrl: videosTable.driveEmbedUrl,
        driveParts: videosTable.driveParts,
      })
      .from(videosTable)
      .where(eq(videosTable.id, id))
      .limit(1);

    if (!video || !video.isVisible) {
      console.warn("[video-stream] DENY 404: video missing or hidden", {
        videoId: id,
        found: !!video,
        isVisible: video?.isVisible ?? null,
      });
      res.status(404).end();
      return;
    }

    // Fresh entitlement re-check, mirroring GET /videos/:id. The token's userId
    // is looked up live so revoked/downgraded accounts immediately lose access.
    const accessType = video.accessType || "normal";
    if (accessType === "vip" || accessType === "normal") {
      const [u] = payload.userId
        ? await db
            .select({
              accountType: usersTable.accountType,
              subscriptionType: usersTable.subscriptionType,
            })
            .from(usersTable)
            .where(eq(usersTable.id, payload.userId))
            .limit(1)
        : [undefined];
      const isVipUser = u?.accountType === "vip";
      const isSubscribed = !!u && u.subscriptionType !== "demo";
      if (accessType === "vip" && !isVipUser) {
        console.warn("[video-stream] DENY 403: VIP video, user not VIP", {
          videoId: id,
          userId: payload.userId,
          accountType: u?.accountType ?? null,
        });
        res.status(403).end();
        return;
      }
      if (accessType === "normal" && !isVipUser && !isSubscribed) {
        console.warn("[video-stream] DENY 403: not VIP and not subscribed", {
          videoId: id,
          userId: payload.userId,
          accountType: u?.accountType ?? null,
          subscriptionType: u?.subscriptionType ?? null,
        });
        res.status(403).end();
        return;
      }
    }

    const partsList = resolveVideoParts({
      driveEmbedUrl: video.driveEmbedUrl,
      driveParts: video.driveParts,
    });
    const target = partsList[part];
    if (!target) {
      console.warn("[video-stream] DENY 404: part index out of range", {
        videoId: id,
        part,
        partCount: partsList.length,
      });
      res.status(404).end();
      return;
    }
    const fileId = extractDriveFileId(target.url);
    if (!fileId) {
      console.warn("[video-stream] DENY 404: could not extract Drive file id", {
        videoId: id,
        part,
      });
      res.status(404).end();
      return;
    }

    await streamDriveFile(req, res, fileId);
  } catch (error: unknown) {
    console.error("[video-stream] ROUTE ERROR: stream handler threw", {
      videoId: req.params.id,
      part: req.params.part,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (!res.headersSent) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to stream video",
      });
    } else {
      res.end();
    }
  }
});

export default router;
