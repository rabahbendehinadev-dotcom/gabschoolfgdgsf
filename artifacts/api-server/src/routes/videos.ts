import { Router, type IRouter } from "express";
import { db, videosTable, categoriesTable, visitLogsTable, playlistsTable, activityLogsTable, usersTable } from "@workspace/db";
import { eq, and, or, asc, sql, isNull } from "drizzle-orm";
import { optionalUserAuth, userAuth } from "../middlewares/auth";
import { getClientIp } from "../lib/ipPolicy";
import { deviceTypeFromUA } from "../lib/device";
import { isActiveVip } from "../lib/vipUtils";
import { generateVideoStreamToken, verifyVideoStreamToken } from "../lib/auth";
import { extractDriveFileId, resolveVideoParts, streamDriveFile } from "../lib/googleDrive";
import { getSignedVideoURL, parseObjectParts } from "../lib/videoStorage";
import { parseHlsParts, buildMasterPlaylist, renderMediaPlaylist } from "../lib/hlsStorage";

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
      objectParts: videosTable.objectParts,
      hlsParts: videosTable.hlsParts,
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
    const isVipUser = isActiveVip(user);
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

    // Migrated videos play DIRECTLY from App Storage via short-lived presigned
    // URLs (no server hop → no buffering bottleneck). Unmigrated videos fall
    // back to the same-origin, token-protected Drive proxy. Raw Drive URLs
    // never leave the server either way.
    const objectParts = parseObjectParts(video.objectParts);
    const hlsParts = parseHlsParts(video.hlsParts);
    const partsList = resolveVideoParts({
      driveEmbedUrl: video.driveEmbedUrl,
      driveParts: video.driveParts,
    });
    let streamParts: { label: string; url: string; hlsUrl?: string }[];
    // Build streamParts from drive parts list (authoritative source for labels/count).
    // For each part: use GCS presigned URL if migrated, Drive proxy token otherwise.
    // This handles the mismatch case where objectParts count < driveParts count
    // (e.g., a new drive part was added after migration completed).
    // Parts that have been transcoded additionally expose an HLS master
    // playlist URL (adaptive bitrate → no stalls / instant seek on slow
    // connections); the MP4 `url` stays as the player's fallback.
    streamParts = await Promise.all(
      partsList.map(async (p, i) => {
        const hlsUrl = hlsParts?.[i]
          ? `/api/videos/${id}/hls/${i}/master.m3u8?token=${generateVideoStreamToken({
              userId: user?.id ?? 0,
              videoId: id,
              part: i,
            })}`
          : undefined;
        const objPart = objectParts?.[i];
        if (objPart) {
          return { label: p.label, url: await getSignedVideoURL(objPart.objectPath), hlsUrl };
        }
        return {
          label: p.label,
          url: `/api/videos/${id}/stream/${i}?token=${generateVideoStreamToken({
            userId: user?.id ?? 0,
            videoId: id,
            part: i,
          })}`,
          hlsUrl,
        };
      }),
    );

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

/* ── Shared gate for the byte/playlist routes ─────────────────────────────
   The native <video> element (and hls.js playlist fetches) cannot send
   Authorization headers, so these routes take a short-lived signed token in
   the query string. The token alone is NEVER trusted: on every request we
   re-verify that it matches the route, that the video is visible, and that
   the token's user is STILL entitled (live DB lookup, so revoked/downgraded
   accounts immediately lose access). Returns the video row, or null after
   having already sent the 401/403/404 response. */
async function authorizeStreamRequest(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
  logTag: string,
): Promise<{
  id: number;
  part: number;
  video: {
    isVisible: boolean;
    accessType: string;
    driveEmbedUrl: string;
    driveParts: string | null;
    hlsParts: string | null;
  };
} | null> {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  const payload = token ? verifyVideoStreamToken(token) : null;
  if (!payload) {
    console.warn(`[${logTag}] DENY 401: missing/invalid token`, {
      videoId: req.params.id,
      part: req.params.part,
      hasToken: !!token,
    });
    res.status(401).end();
    return null;
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
    console.warn(`[${logTag}] DENY 403: token/route mismatch`, {
      routeId: id,
      routePart: part,
      tokenVideoId: payload.videoId,
      tokenPart: payload.part,
    });
    res.status(403).end();
    return null;
  }

  const [video] = await db
    .select({
      isVisible: videosTable.isVisible,
      accessType: videosTable.accessType,
      driveEmbedUrl: videosTable.driveEmbedUrl,
      driveParts: videosTable.driveParts,
      hlsParts: videosTable.hlsParts,
    })
    .from(videosTable)
    .where(eq(videosTable.id, id))
    .limit(1);

  if (!video || !video.isVisible) {
    console.warn(`[${logTag}] DENY 404: video missing or hidden`, {
      videoId: id,
      found: !!video,
      isVisible: video?.isVisible ?? null,
    });
    res.status(404).end();
    return null;
  }

  // Fresh entitlement re-check, mirroring GET /videos/:id.
  const accessType = video.accessType || "normal";
  if (accessType === "vip" || accessType === "normal") {
    const [u] = payload.userId
      ? await db
          .select({
            accountType: usersTable.accountType,
            subscriptionType: usersTable.subscriptionType,
            subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
            isActive: usersTable.isActive,
          })
          .from(usersTable)
          .where(eq(usersTable.id, payload.userId))
          .limit(1)
      : [undefined];
    const isVipUser = isActiveVip(u);
    const isSubscribed = !!u && u.subscriptionType !== "demo";
    if (accessType === "vip" && !isVipUser) {
      console.warn(`[${logTag}] DENY 403: VIP video, user not VIP`, {
        videoId: id,
        userId: payload.userId,
        accountType: u?.accountType ?? null,
      });
      res.status(403).end();
      return null;
    }
    if (accessType === "normal" && !isVipUser && !isSubscribed) {
      console.warn(`[${logTag}] DENY 403: not VIP and not subscribed`, {
        videoId: id,
        userId: payload.userId,
        accountType: u?.accountType ?? null,
        subscriptionType: u?.subscriptionType ?? null,
      });
      res.status(403).end();
      return null;
    }
  }

  return { id, part, video };
}

// Token-protected, same-origin video stream (Drive proxy fallback for
// unmigrated videos).
router.get("/videos/:id/stream/:part", async (req, res) => {
  try {
    const auth = await authorizeStreamRequest(req, res, "video-stream");
    if (!auth) return;
    const { id, part, video } = auth;

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

/* ── HLS playlists (adaptive streaming for transcoded videos) ─────────────
   Same security gate as the byte routes. The master playlist references the
   media playlists RELATIVELY (same-origin, token re-attached); the media
   playlists embed short-lived presigned GCS segment URLs, so the actual
   video bytes stream directly from storage.googleapis.com with zero server
   involvement — the server only ever hands out small text playlists. */

const HLS_PLAYLIST_HEADERS = {
  "Content-Type": "application/vnd.apple.mpegurl",
  // Private (token-gated) but briefly cacheable by the browser itself so
  // hls.js level switches don't re-hit the server needlessly.
  "Cache-Control": "private, max-age=300",
} as const;

router.get("/videos/:id/hls/:part/master.m3u8", async (req, res) => {
  try {
    const auth = await authorizeStreamRequest(req, res, "video-hls");
    if (!auth) return;
    const { id, part, video } = auth;

    const hlsParts = parseHlsParts(video.hlsParts);
    const hlsPart = hlsParts?.[part];
    if (!hlsPart) {
      console.warn("[video-hls] DENY 404: no HLS ladder for part", { videoId: id, part });
      res.status(404).end();
      return;
    }

    const token = req.query.token as string; // validated by authorizeStreamRequest
    res.set(HLS_PLAYLIST_HEADERS).send(buildMasterPlaylist(hlsPart, token));
  } catch (error: unknown) {
    console.error("[video-hls] ROUTE ERROR: master playlist threw", {
      videoId: req.params.id,
      part: req.params.part,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

router.get("/videos/:id/hls/:part/:rendition.m3u8", async (req, res) => {
  try {
    const auth = await authorizeStreamRequest(req, res, "video-hls");
    if (!auth) return;
    const { id, part, video } = auth;

    const hlsParts = parseHlsParts(video.hlsParts);
    const hlsPart = hlsParts?.[part];
    const rendition = String(req.params.rendition);
    if (!hlsPart || !hlsPart.renditions.some((r) => r.name === rendition)) {
      console.warn("[video-hls] DENY 404: unknown rendition", {
        videoId: id,
        part,
        rendition,
      });
      res.status(404).end();
      return;
    }

    const playlist = await renderMediaPlaylist(id, part, rendition);
    if (!playlist) {
      console.warn("[video-hls] DENY 404: skeleton playlist missing in storage", {
        videoId: id,
        part,
        rendition,
      });
      res.status(404).end();
      return;
    }
    res.set(HLS_PLAYLIST_HEADERS).send(playlist);
  } catch (error: unknown) {
    console.error("[video-hls] ROUTE ERROR: media playlist threw", {
      videoId: req.params.id,
      part: req.params.part,
      rendition: req.params.rendition,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

export default router;
