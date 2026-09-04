import { Router, type IRouter } from "express";
import { db, videosTable, categoriesTable, visitLogsTable, playlistsTable, activityLogsTable, usersTable, userCoursesTable } from "@workspace/db";
import { eq, and, or, asc, sql, isNull, inArray, gt } from "drizzle-orm";
import { optionalUserAuth } from "../middlewares/auth";
import { getClientIp } from "../lib/ipPolicy";
import { deviceTypeFromUA } from "../lib/device";
import { isActiveVip } from "../lib/vipUtils";
import { generateVideoStreamToken, verifyVideoStreamToken } from "../lib/auth";
import { extractDriveFileId, resolveVideoParts, streamDriveFile } from "../lib/googleDrive";
import { streamGcsObjectToResponse, parseObjectParts } from "../lib/videoStorage";
import { parseLowParts } from "../lib/driveTranscode";
import { resolveAvailableHlsParts, buildMasterPlaylist, renderMediaPlaylist, buildHlsBasePath, RENDITION_NAME_RE, SAFE_SEGMENT_RE } from "../lib/hlsStorage";

/* ── Per-token concurrent-connection guard ────────────────────────────────
   Tracks how many in-flight streaming responses are using each stream token.
   Browser video players use 1–3 overlapping Range requests (play + seek);
   download-manager tools (IDM / XDM / JDownloader) open 8–32 in parallel.
   Capping at MAX_CONCURRENT_PER_TOKEN stops the parallel-split attack while
   leaving normal playback unaffected.
   Entries are cleaned up in the finally block of each route handler. */
const MP4_CONCURRENT: Map<string, number> = new Map();
const SEG_CONCURRENT: Map<string, number> = new Map();
const MP4_MAX = 3; // 3 is safe for a seeking browser; IDM needs 8+
const SEG_MAX = 5; // hls.js may prefetch a few segments at level switches

function acquireSlot(map: Map<string, number>, key: string, max: number): boolean {
  const n = map.get(key) ?? 0;
  if (n >= max) return false;
  map.set(key, n + 1);
  return true;
}
function releaseSlot(map: Map<string, number>, key: string): void {
  const n = map.get(key) ?? 1;
  if (n <= 1) map.delete(key);
  else map.set(key, n - 1);
}

const router: IRouter = Router();

// Allowed client-reported security events (allowlist — never trust arbitrary input).
const SECURITY_EVENTS = new Set([
  "external_open_attempt",
  "copy_link_attempt",
  "devtools_attempt",
  "screen_capture_attempt",
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
    const playlistId = req.query.playlistId ? Number(req.query.playlistId) : undefined;

    /* ── فلترة قاعدة البيانات حسب الدورة (playlistId) ───────────────────
       عند تمرير playlistId:
       1. نجلب معرّفات الأقسام المرتبطة بهذه الدورة (linkedPlaylistId).
       2. نرفض categoryId إن لم يكن تابعاً لنفس الدورة.
       3. نفلتر الفيديوهات لتلك التابعة للدورة مباشرةً (playlistId) أو عبر أقسامها.
    ── */
    let linkedCategoryIds: number[] | undefined;
    if (playlistId && Number.isFinite(playlistId)) {
      const linked = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(and(
          eq(categoriesTable.linkedPlaylistId, playlistId),
          eq(categoriesTable.isVisible, true),
        ));
      linkedCategoryIds = linked.map(c => c.id);

      /* إذا طُلب قسم معيّن وهو ليس تابعاً لهذه الدورة — ارفض الطلب */
      if (categoryId !== undefined && !linkedCategoryIds.includes(categoryId)) {
        res.status(403).json({ message: "هذا القسم لا ينتمي للدورة المطلوبة" });
        return;
      }

      /* إذا لم تكن هناك أقسام مرتبطة بالدورة — أعد مصفوفة فارغة فوراً */
      if (linkedCategoryIds.length === 0 && categoryId === undefined) {
        res.json([]);
        return;
      }
    }

    const conditions = [
      eq(videosTable.isVisible, true),
      or(eq(categoriesTable.isVisible, true), isNull(videosTable.categoryId)) as ReturnType<typeof eq>,
    ];

    if (categoryId) {
      conditions.push(eq(videosTable.categoryId, categoryId));
    } else if (linkedCategoryIds !== undefined && linkedCategoryIds.length > 0) {
      /* فلتر الفيديوهات: تابعة للأقسام المرتبطة بالدورة أو مرتبطة بها مباشرة */
      conditions.push(
        or(
          inArray(videosTable.categoryId, linkedCategoryIds),
          eq(videosTable.playlistId, playlistId!),
        ),
      );
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
      categoryLinkedPlaylistId: categoriesTable.linkedPlaylistId,
      playlistId: videosTable.playlistId,
      partNumber: videosTable.partNumber,
      isVipOnly: videosTable.isVipOnly,
      accessType: videosTable.accessType,
      isVisible: videosTable.isVisible,
      softwareLink: videosTable.softwareLink,
      driveParts: videosTable.driveParts,
      objectParts: videosTable.objectParts,
      hlsParts: videosTable.hlsParts,
      lowParts: videosTable.lowParts,
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
    const isSubscribed = Boolean(
      user &&
      user.subscriptionType !== "demo" &&
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date()),
    );

    // Log + deny when a user tries to open a video they are not entitled to.
    // Include safe preview metadata so the client can render a locked preview page
    // without leaking any stream URLs, Drive parts, or software links.
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
      res.status(403).json({
        message,
        preview: {
          title: video.title,
          thumbnailUrl: video.thumbnailUrl ?? null,
          accessType: video.accessType ?? "normal",
          categoryName: video.categoryName ?? null,
          description: video.description ?? null,
        },
      });
    };

    // ── Course (playlist) access check ──
    // A video belongs to a course if video.playlistId is set directly,
    // OR if its category has linkedPlaylistId (category-based course link).
    const coursePlaylistId = video.playlistId ?? video.categoryLinkedPlaylistId ?? null;
    let hasCourseAccess = false;

    if (coursePlaylistId && accessType !== "visitor") {
      if (!user) {
        await denyVideoAccess("يجب تسجيل الدخول لمشاهدة هذا الفيديو");
        return;
      }
      const [courseAccess] = await db.select({ playlistId: userCoursesTable.playlistId })
        .from(userCoursesTable)
        .where(and(
          eq(userCoursesTable.userId, user.id),
          eq(userCoursesTable.playlistId, coursePlaylistId),
          eq(userCoursesTable.status, "active"),
          or(
            isNull(userCoursesTable.expiresAt),
            gt(userCoursesTable.expiresAt, new Date()),
          ),
        ))
        .limit(1);
      if (!courseAccess) {
        await denyVideoAccess("ليس لديك صلاحية الوصول لهذه الدورة");
        return;
      }
      // User has explicit course access — grant full access without subscription check
      hasCourseAccess = true;
    }

    if (!hasCourseAccess) {
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
    }

    const hasDirectDriveAccess = Boolean(
      accessType === "visitor" ||
      (user && (hasCourseAccess || isVipUser || isSubscribed)),
    );

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

    const partsList = resolveVideoParts({
      driveEmbedUrl: video.driveEmbedUrl,
      driveParts: video.driveParts,
    });
    const availableHlsParts = await resolveAvailableHlsParts(
      id,
      video.hlsParts,
      partsList.length,
    );
    let streamParts: {
      label: string;
      url?: string;
      hlsUrl?: string;
      drivePreviewUrl?: string;
      driveViewUrl?: string;
    }[];
    // Generate same-origin, short-lived stream URLs only after the full
    // entitlement check. Lists and playlist payloads never receive Drive IDs.
    streamParts = partsList.map((p, part) => {
      const driveFileId = hasDirectDriveAccess ? extractDriveFileId(p.url) : null;
      if (!driveFileId) return { label: p.label };
      const token = generateVideoStreamToken({
        userId: user?.id ?? 0,
        videoId: id,
        part,
      });
      return {
        label: p.label,
        url: `/api/videos/${id}/stream/${part}?token=${encodeURIComponent(token)}`,
        ...(availableHlsParts?.[part]
          ? {
              hlsUrl: `/api/videos/${id}/hls/${part}/master.m3u8?token=${encodeURIComponent(token)}`,
            }
          : {}),
      };
    });

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

// Keep the unused object-stream route disabled. Signed HLS routes are enabled
// below and fall back to the authenticated Drive MP4 route when no ladder is ready.
router.use(
  ["/videos/:id/stream-object/:part"],
  (_req, res) => {
    res.status(410).json({
      message: "Platform streaming is disabled. Use Google Drive Direct playback.",
    });
  },
);

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

// Lightweight playback diagnostics. These records stay in server logs only and
// make it possible to distinguish a player-buffer underrun from a slow Drive
// TTFB or a slow backend pipe without changing the streaming architecture.
router.post("/videos/:id/playback-metric", optionalUserAuth, (req, res) => {
  const videoId = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const event = body.event;
  if (!Number.isFinite(videoId) || !["waiting", "recovered", "stalled"].includes(String(event))) {
    res.status(400).json({ message: "Invalid playback metric" });
    return;
  }
  const safeNumber = (value: unknown, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : null;
  };
  console.info("[video-buffer]", {
    event,
    videoId,
    userId: req.user?.id ?? null,
    currentTime: safeNumber(body.currentTime, 24 * 60 * 60),
    bufferAhead: safeNumber(body.bufferAhead, 60 * 60),
    readyState: safeNumber(body.readyState, 4),
    networkState: safeNumber(body.networkState, 3),
    paused: body.paused === true,
    stallMs: safeNumber(body.stallMs, 10 * 60_000),
    downlinkMbps: safeNumber(body.downlinkMbps, 10_000),
  });
  res.status(204).end();
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
    objectParts: string | null;
    lowParts: string | null;
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
      objectParts: videosTable.objectParts,
      lowParts: videosTable.lowParts,
      playlistId: videosTable.playlistId,
      categoryLinkedPlaylistId: categoriesTable.linkedPlaylistId,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
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

  // ── Course access check (defense-in-depth re-verify, primary gate is GET /videos/:id) ──
  // If the video belongs to a course (via direct playlistId or category linkedPlaylistId),
  // the user MUST have an explicit entry in user_courses — VIP/subscription is NOT enough.
  const coursePlaylistId = video.playlistId ?? video.categoryLinkedPlaylistId ?? null;
  if (video.accessType === "visitor") {
    return { id, part, video };
  }
  const [streamUser] = payload.userId
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
  if (!streamUser?.isActive) {
    console.warn(`[${logTag}] DENY 403: user missing or inactive`, {
      videoId: id,
      userId: payload.userId,
    });
    res.status(403).end();
    return null;
  }
  if (coursePlaylistId) {
    const [courseAccess] = await db
      .select({ playlistId: userCoursesTable.playlistId })
      .from(userCoursesTable)
      .where(and(
        eq(userCoursesTable.userId, payload.userId),
        eq(userCoursesTable.playlistId, coursePlaylistId),
        eq(userCoursesTable.status, "active"),
        or(
          isNull(userCoursesTable.expiresAt),
          gt(userCoursesTable.expiresAt, new Date()),
        ),
      ))
      .limit(1);
    if (!courseAccess) {
      console.warn(`[${logTag}] DENY 403: course access revoked or missing`, {
        videoId: id,
        coursePlaylistId,
        userId: payload.userId,
      });
      res.status(403).end();
      return null;
    }
    // Explicit course access confirmed — skip VIP/subscription check entirely
    return { id, part, video };
  }

  // ── Non-course video: check VIP / subscription ──
  const accessType = video.accessType || "normal";
  if (accessType === "vip" || accessType === "normal") {
    const isVipUser = isActiveVip(streamUser);
    const isSubscribed = Boolean(
      streamUser.subscriptionType !== "demo" &&
      (!streamUser.subscriptionExpiresAt || new Date(streamUser.subscriptionExpiresAt) > new Date()),
    );
    if (accessType === "vip" && !isVipUser) {
      console.warn(`[${logTag}] DENY 403: VIP video, user not VIP`, {
        videoId: id,
        userId: payload.userId,
        accountType: streamUser.accountType,
      });
      res.status(403).end();
      return null;
    }
    if (accessType === "normal" && !isVipUser && !isSubscribed) {
      console.warn(`[${logTag}] DENY 403: not VIP and not subscribed`, {
        videoId: id,
        userId: payload.userId,
        accountType: streamUser.accountType,
        subscriptionType: streamUser.subscriptionType,
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
    let fileId = extractDriveFileId(target.url);
    // ?q=low → stream the lightweight 720p Drive copy when it exists.
    // Falls back silently to the original if no copy is ready yet.
    if (req.query.q === "low") {
      const lowEntry = parseLowParts(video.lowParts)?.[part];
      if (lowEntry && "fileId" in lowEntry && lowEntry.fileId) {
        fileId = lowEntry.fileId;
      }
    }
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

/* ── GCS object proxy (migrated videos) ──────────────────────────────────
   Streams GCS bytes through the server so storage.googleapis.com URLs are
   NEVER exposed to the browser (download-manager extensions cannot intercept
   what they never see). Supports Range requests for native seeking.
   Uses the same authorizeStreamRequest gate as the Drive proxy. ── */
router.get("/videos/:id/stream-object/:part", async (req, res) => {
  try {
    const auth = await authorizeStreamRequest(req, res, "video-object");
    if (!auth) return;
    const { id, part, video } = auth;

    const objectParts = parseObjectParts(video.objectParts);
    const objPart = objectParts?.[part];
    if (!objPart) {
      console.warn("[video-object] DENY 404: no object part found", { videoId: id, part });
      res.status(404).end();
      return;
    }

    const token = req.query.token as string;
    if (!acquireSlot(MP4_CONCURRENT, token, MP4_MAX)) {
      console.warn("[video-object] RATE 429: too many concurrent requests for token", {
        videoId: id, part, active: MP4_CONCURRENT.get(token),
      });
      res.status(429).setHeader("Retry-After", "2").end();
      return;
    }
    try {
      await streamGcsObjectToResponse(objPart.objectPath, req, res);
    } finally {
      releaseSlot(MP4_CONCURRENT, token);
    }
  } catch (error: unknown) {
    console.error("[video-object] ROUTE ERROR", {
      videoId: req.params.id,
      part: req.params.part,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

/* ── HLS playlists (adaptive streaming for transcoded videos) ─────────────
   Same security gate as the byte routes. The master playlist references the
   media playlists RELATIVELY (same-origin, token re-attached); the media
   playlists embed same-origin PROXY segment URLs (/hls/:part/:rendition/
   segment/:filename?token=...) — storage.googleapis.com URLs NEVER appear
   in the browser's network tab so download managers cannot intercept them. */

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

    const partCount = resolveVideoParts(video).length;
    const hlsParts = await resolveAvailableHlsParts(id, video.hlsParts, partCount);
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

    const partCount = resolveVideoParts(video).length;
    const hlsParts = await resolveAvailableHlsParts(id, video.hlsParts, partCount);
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

    const token = req.query.token as string; // validated by authorizeStreamRequest
    const playlist = await renderMediaPlaylist(id, part, rendition, token);
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

/* ── HLS segment proxy ────────────────────────────────────────────────────
   Each .ts segment is streamed through the server behind the same stream
   token so storage.googleapis.com URLs NEVER appear in the browser's
   network tab — download managers cannot intercept what they never see.
   The token is validated by authorizeStreamRequest (videoId + part + live
   entitlement re-check). Rendition and filename are allow-listed against
   strict regexes to prevent path traversal. */
router.get("/videos/:id/hls/:part/:rendition/segment/:filename", async (req, res) => {
  try {
    const auth = await authorizeStreamRequest(req, res, "video-hls-seg");
    if (!auth) return;
    const { id, part, video } = auth;

    const rendition = String(req.params.rendition);
    const filename = String(req.params.filename);

    if (!RENDITION_NAME_RE.test(rendition) || !SAFE_SEGMENT_RE.test(filename)) {
      console.warn("[video-hls-seg] DENY 400: invalid rendition or filename", {
        videoId: id, part, rendition, filename,
      });
      res.status(400).end();
      return;
    }
    const partCount = resolveVideoParts(video).length;
    const hlsParts = await resolveAvailableHlsParts(id, video.hlsParts, partCount);
    const hlsPart = hlsParts?.[part];
    if (!hlsPart?.renditions.some((item) => item.name === rendition)) {
      console.warn("[video-hls-seg] DENY 404: rendition is not active", {
        videoId: id,
        part,
        rendition,
      });
      res.status(404).end();
      return;
    }

    const objectPath = `${buildHlsBasePath(id, part)}/${rendition}/${filename}`;
    const token = req.query.token as string;
    if (!acquireSlot(SEG_CONCURRENT, token, SEG_MAX)) {
      console.warn("[video-hls-seg] RATE 429: too many concurrent segment requests for token", {
        videoId: id, part, rendition, active: SEG_CONCURRENT.get(token),
      });
      res.status(429).setHeader("Retry-After", "1").end();
      return;
    }
    try {
      await streamGcsObjectToResponse(objectPath, req, res);
    } finally {
      releaseSlot(SEG_CONCURRENT, token);
    }
  } catch (error: unknown) {
    console.error("[video-hls-seg] ROUTE ERROR", {
      videoId: req.params.id,
      part: req.params.part,
      rendition: req.params.rendition,
      filename: req.params.filename,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

router.get("/videos/:id/token/:part", async (req, res) => {
  const auth = await authorizeStreamRequest(req, res, "video-token");
  if (!auth) return;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    token: generateVideoStreamToken({
      userId: Number(verifyVideoStreamToken(String(req.query.token))?.userId ?? 0),
      videoId: auth.id,
      part: auth.part,
    }),
  });
});

export default router;
