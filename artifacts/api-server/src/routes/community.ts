import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  communityPostsTable,
  communityPostMediaTable,
  communityPostLikesTable,
  communityCommentsTable,
  communityPostViewsTable,
  communityReportsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray, count, gte, isNull } from "drizzle-orm";
import { optionalUserAuth, userAuth } from "../middlewares/auth";
import { generateMediaToken, verifyMediaToken } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { createNotification } from "../lib/notifications";
import {
  CreateCommunityPostBody,
  UpdateCommunityPostBody,
  CreateCommunityCommentBody,
} from "@workspace/api-zod";
import { isActiveVip } from "../lib/vipUtils";
import {
  deleteGeneratedThumbnail,
  generateCommunityThumbnail,
} from "../lib/imageThumbnail";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

type Viewer = Request["user"] | undefined;

// Short single-line preview of user text for a notification body.
function snippet(text: string, max = 120): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// Whether the viewer may access the ORIGINAL media of a post. Text is always
// public; media is locked unless the post is unlocked or the viewer is VIP.
function isEntitled(viewer: Viewer, post: { isVipLocked: boolean }): boolean {
  if (!post.isVipLocked) return true;
  return isActiveVip(viewer);
}

function authorPayload(row: {
  authorUserId: number;
  authorUsername: string | null;
  authorAccountType: string | null;
  authorProfileImage?: string | null;
}) {
  return {
    id: row.authorUserId,
    username: row.authorUsername || "عضو",
    accountType: row.authorAccountType === "vip" ? "vip" : "normal",
    profileImageUrl: row.authorProfileImage ? `/api/users/${row.authorUserId}/avatar` : null,
  };
}

type MediaRow = typeof communityPostMediaTable.$inferSelect;

function serializeMedia(media: MediaRow, viewerUserId: number, entitled: boolean) {
  const previewUrl = media.previewObjectPath
    ? `/api/community/media/${media.id}?variant=preview&token=${generateMediaToken({
        userId: viewerUserId,
        mediaId: media.id,
        variant: "preview",
      })}`
    : null;

  const fullUrl = entitled
    ? `/api/community/media/${media.id}?variant=full&token=${generateMediaToken({
        userId: viewerUserId,
        mediaId: media.id,
        variant: "full",
      })}`
    : null;
  const thumbnailUrl =
    entitled && media.mediaType === "image"
      ? `/api/community/media/${media.id}?variant=thumbnail&token=${generateMediaToken({
          userId: viewerUserId,
          mediaId: media.id,
          variant: "thumbnail",
        })}`
      : null;

  return {
    id: media.id,
    mediaType: media.mediaType === "video" ? "video" : "image",
    locked: !entitled,
    previewUrl,
    thumbnailUrl,
    fullUrl,
    width: media.width ?? null,
    height: media.height ?? null,
    durationSec: media.durationSec ?? null,
    sortOrder: media.sortOrder,
  };
}

type PostRow = typeof communityPostsTable.$inferSelect & {
  authorUsername: string | null;
  authorAccountType: string | null;
  authorProfileImage: string | null;
};

function serializePost(
  post: PostRow,
  mediaRows: MediaRow[],
  viewer: Viewer,
  likedByMe: boolean,
) {
  const viewerUserId = viewer?.id ?? 0;
  const entitled = isEntitled(viewer, post);
  return {
    id: post.id,
    author: authorPayload(post),
    content: post.content ?? null,
    postType: post.postType,
    isVipLocked: post.isVipLocked,
    isPinned: post.isPinned,
    isFeatured: post.isFeatured,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    viewsCount: post.viewsCount,
    likedByMe,
    canEdit: !!viewer && viewer.id === post.authorUserId,
    media: mediaRows
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((m) => serializeMedia(m, viewerUserId, entitled)),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

async function recomputeLikes(postId: number): Promise<number> {
  const [{ c }] = await db
    .select({ c: count() })
    .from(communityPostLikesTable)
    .where(eq(communityPostLikesTable.postId, postId));
  const likesCount = Number(c);
  await db.update(communityPostsTable).set({ likesCount }).where(eq(communityPostsTable.id, postId));
  return likesCount;
}

async function recomputeComments(postId: number): Promise<number> {
  const [{ c }] = await db
    .select({ c: count() })
    .from(communityCommentsTable)
    .where(
      and(
        eq(communityCommentsTable.postId, postId),
        eq(communityCommentsTable.isVisible, true),
        eq(communityCommentsTable.isHidden, false),
      ),
    );
  const commentsCount = Number(c);
  await db
    .update(communityPostsTable)
    .set({ commentsCount })
    .where(eq(communityPostsTable.id, postId));
  return commentsCount;
}

async function recomputeViews(postId: number): Promise<number> {
  const [{ c }] = await db
    .select({ c: count() })
    .from(communityPostViewsTable)
    .where(eq(communityPostViewsTable.postId, postId));
  const viewsCount = Number(c);
  await db.update(communityPostsTable).set({ viewsCount }).where(eq(communityPostsTable.id, postId));
  return viewsCount;
}

// Fetch a post (with author) by id, only if publicly visible.
async function getVisiblePostRow(id: number): Promise<PostRow | undefined> {
  const [row] = await db
    .select({
      id: communityPostsTable.id,
      authorUserId: communityPostsTable.authorUserId,
      content: communityPostsTable.content,
      postType: communityPostsTable.postType,
      isVipLocked: communityPostsTable.isVipLocked,
      isVisible: communityPostsTable.isVisible,
      isHidden: communityPostsTable.isHidden,
      isPinned: communityPostsTable.isPinned,
      isFeatured: communityPostsTable.isFeatured,
      likesCount: communityPostsTable.likesCount,
      commentsCount: communityPostsTable.commentsCount,
      viewsCount: communityPostsTable.viewsCount,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      authorUsername: usersTable.username,
      authorAccountType: usersTable.accountType,
      authorProfileImage: usersTable.profileImage,
    })
    .from(communityPostsTable)
    .leftJoin(usersTable, eq(communityPostsTable.authorUserId, usersTable.id))
    .where(eq(communityPostsTable.id, id))
    .limit(1);

  if (!row || !row.isVisible || row.isHidden) return undefined;
  return row as PostRow;
}

async function loadMediaFor(postIds: number[]): Promise<Map<number, MediaRow[]>> {
  const map = new Map<number, MediaRow[]>();
  if (postIds.length === 0) return map;
  const rows = await db
    .select()
    .from(communityPostMediaTable)
    .where(inArray(communityPostMediaTable.postId, postIds));
  for (const m of rows) {
    const arr = map.get(m.postId) ?? [];
    arr.push(m);
    map.set(m.postId, arr);
  }
  return map;
}

async function likedPostIds(viewer: Viewer, postIds: number[]): Promise<Set<number>> {
  const set = new Set<number>();
  if (!viewer || postIds.length === 0) return set;
  const rows = await db
    .select({ postId: communityPostLikesTable.postId })
    .from(communityPostLikesTable)
    .where(
      and(
        eq(communityPostLikesTable.userId, viewer.id),
        inArray(communityPostLikesTable.postId, postIds),
      ),
    );
  for (const r of rows) set.add(r.postId);
  return set;
}

// Stream a private object with HTTP Range support (needed for <video> seeking).
async function streamObject(req: Request, res: Response, objectPath: string): Promise<void> {
  console.log(`[streamObject] objectPath=${objectPath} range=${req.headers.range || "none"}`);
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  const contentType = (metadata.contentType as string) || "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");

  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && size > 0) {
    let start: number;
    let end: number;
    if (match[1] === "" && match[2] !== "") {
      // Suffix range: the final N bytes.
      const suffix = parseInt(match[2], 10);
      start = Math.max(size - (Number.isNaN(suffix) ? 0 : suffix), 0);
      end = size - 1;
    } else {
      start = match[1] ? parseInt(match[1], 10) : 0;
      end = match[2] ? parseInt(match[2], 10) : size - 1;
    }
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    const stream = file.createReadStream({ start, end });
    stream.on("error", () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
    return;
  }

  if (size > 0) res.setHeader("Content-Length", String(size));
  res.status(200);
  const stream = file.createReadStream();
  stream.on("error", () => {
    if (!res.headersSent) res.status(500);
    res.end();
  });
  stream.pipe(res);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Teaser previews must stay tiny — a downscaled/blurred image, never a
// full-resolution original sneaked through as a "preview".
const PREVIEW_MAX_BYTES = 3 * 1024 * 1024;

async function objectMeta(objectPath: string): Promise<{ contentType: string; size: number }> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [m] = await file.getMetadata();
  return {
    contentType: (m.contentType as string) || "application/octet-stream",
    size: Number(m.size || 0),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /community/summary
router.get("/community/summary", optionalUserAuth, async (req, res) => {
  try {
    const [{ members }] = await db
      .select({ members: count() })
      .from(usersTable)
      .where(eq(usersTable.isActive, true));
    const [{ total }] = await db
      .select({ total: count() })
      .from(communityPostsTable)
      .where(and(eq(communityPostsTable.isVisible, true), eq(communityPostsTable.isHidden, false)));
    const [{ today }] = await db
      .select({ today: count() })
      .from(communityPostsTable)
      .where(
        and(
          eq(communityPostsTable.isVisible, true),
          eq(communityPostsTable.isHidden, false),
          gte(communityPostsTable.createdAt, startOfToday()),
        ),
      );

    res.json({
      memberCount: Number(members),
      todayPostsCount: Number(today),
      totalPostsCount: Number(total),
      coverImageUrl: null,
      isAuthenticated: !!req.user,
      isVip: isActiveVip(req.user),
      canPost: !!req.user,
      hasProfilePicture: !!(req.user?.profileImage),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load summary" });
  }
});

// GET /community/posts  (feed)
router.get("/community/posts", optionalUserAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 30);
    const offset = Math.max(Number(req.query.cursor) || 0, 0);

    const rows = (await db
      .select({
        id: communityPostsTable.id,
        authorUserId: communityPostsTable.authorUserId,
        content: communityPostsTable.content,
        postType: communityPostsTable.postType,
        isVipLocked: communityPostsTable.isVipLocked,
        isVisible: communityPostsTable.isVisible,
        isHidden: communityPostsTable.isHidden,
        isPinned: communityPostsTable.isPinned,
        isFeatured: communityPostsTable.isFeatured,
        likesCount: communityPostsTable.likesCount,
        commentsCount: communityPostsTable.commentsCount,
        viewsCount: communityPostsTable.viewsCount,
        createdAt: communityPostsTable.createdAt,
        updatedAt: communityPostsTable.updatedAt,
        authorUsername: usersTable.username,
        authorAccountType: usersTable.accountType,
        authorProfileImage: usersTable.profileImage,
      })
      .from(communityPostsTable)
      .leftJoin(usersTable, eq(communityPostsTable.authorUserId, usersTable.id))
      .where(and(eq(communityPostsTable.isVisible, true), eq(communityPostsTable.isHidden, false)))
      .orderBy(
        desc(communityPostsTable.isPinned),
        desc(communityPostsTable.createdAt),
        desc(communityPostsTable.id),
      )
      .limit(limit + 1)
      .offset(offset)) as PostRow[];

    const hasMore = rows.length > limit;
    const pagePosts = rows.slice(0, limit);
    const ids = pagePosts.map((p) => p.id);

    const [mediaMap, likedSet] = await Promise.all([
      loadMediaFor(ids),
      likedPostIds(req.user, ids),
    ]);

    res.json({
      posts: pagePosts.map((p) =>
        serializePost(p, mediaMap.get(p.id) ?? [], req.user, likedSet.has(p.id)),
      ),
      nextCursor: hasMore ? offset + limit : null,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load feed" });
  }
});

// GET /community/posts/:id
router.get("/community/posts/:id", optionalUserAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    const mediaMap = await loadMediaFor([id]);
    const likedSet = await likedPostIds(req.user, [id]);
    res.json(serializePost(post, mediaMap.get(id) ?? [], req.user, likedSet.has(id)));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load post" });
  }
});

// POST /community/posts  (all authenticated users; requires profile picture)
router.post("/community/posts", userAuth, async (req, res) => {
  try {
    if (!req.user!.profileImage) {
      res.status(403).json({ message: "يجب إضافة صورة شخصية قبل النشر", code: "PROFILE_PICTURE_REQUIRED" });
      return;
    }

    const parsed = CreateCommunityPostBody.safeParse(req.body);
    if (!parsed.success) {
      console.error("[post-create] invalid body:", parsed.error.issues);
      res.status(400).json({ message: "بيانات المنشور غير صالحة" });
      return;
    }

    const { postType } = parsed.data;
    const content = parsed.data.content?.trim() || null;
    const media = parsed.data.media ?? [];

    console.log(`[post-create] user=${req.user!.id} postType=${postType} mediaCount=${media.length} content=${content ? "yes" : "no"}`);

    if (postType === "text" && !content) {
      res.status(400).json({ message: "لا يمكن نشر منشور نصي فارغ" });
      return;
    }
    if (postType !== "text" && media.length === 0) {
      res.status(400).json({ message: "يجب إرفاق وسائط لهذا النوع من المنشورات" });
      return;
    }

    // Validate & normalize media server-side BEFORE creating the post. Never
    // trust client-declared paths/sizes: every media item must carry a SEPARATE
    // preview object that is a small image, otherwise a client could expose the
    // original through the public (non-VIP) preview route.
    const mediaToInsert: Array<{
      mediaType: string;
      objectPath: string;
      previewObjectPath: string;
      thumbnailObjectPath: string | null;
      width: number | null;
      height: number | null;
      durationSec: number | null;
      contentType: string;
      sizeBytes: number;
      sortOrder: number;
    }> = [];
    const generatedThumbnailPaths = new Set<string>();

    for (let idx = 0; idx < media.length; idx++) {
      const m = media[idx];
      const wantVideo = m.mediaType === "video";
      const preview = m.previewObjectPath?.trim();
      console.log(`[post-create] media[${idx}] objectPath=${m.objectPath} previewObjectPath=${preview}`);
      if (!preview) {
        res.status(400).json({ message: "ينقص معاينة الوسائط" });
        return;
      }
      if (preview === m.objectPath) {
        res.status(400).json({ message: "معاينة الوسائط غير صالحة" });
        return;
      }
      let previewMeta: { contentType: string; size: number };
      let originalMeta: { contentType: string; size: number };
      try {
        previewMeta = await objectMeta(preview);
        originalMeta = await objectMeta(m.objectPath);
        console.log(`[post-create] media[${idx}] objectMeta OK: original=${originalMeta.contentType}/${originalMeta.size} preview=${previewMeta.contentType}/${previewMeta.size}`);
      } catch (metaErr) {
        console.error(`[post-create] media[${idx}] objectMeta FAILED objectPath=${m.objectPath} previewPath=${preview}:`, metaErr);
        res.status(400).json({ message: "تعذّر التحقق من ملفات الوسائط" });
        return;
      }
      if (!previewMeta.contentType.startsWith("image/") || previewMeta.size > PREVIEW_MAX_BYTES) {
        console.error(`[post-create] media[${idx}] preview content-type/size invalid: ${previewMeta.contentType} ${previewMeta.size}`);
        res.status(400).json({ message: "معاينة الوسائط يجب أن تكون صورة مصغّرة" });
        return;
      }
      if (wantVideo && !originalMeta.contentType.startsWith("video/")) {
        res.status(400).json({ message: "نوع ملف الفيديو غير صالح" });
        return;
      }
      if (!wantVideo && !originalMeta.contentType.startsWith("image/")) {
        console.error(`[post-create] media[${idx}] image content-type invalid: ${originalMeta.contentType}`);
        res.status(400).json({ message: "نوع ملف الصورة غير صالح" });
        return;
      }
      mediaToInsert.push({
        mediaType: wantVideo ? "video" : "image",
        objectPath: m.objectPath,
        previewObjectPath: preview,
        thumbnailObjectPath: wantVideo ? (m.thumbnailObjectPath ?? null) : null,
        width: m.width ?? null,
        height: m.height ?? null,
        durationSec: m.durationSec ?? null,
        contentType: originalMeta.contentType,
        sizeBytes: originalMeta.size,
        sortOrder: m.sortOrder ?? idx,
      });
    }

    // Only create stored thumbnails after every media item has passed validation,
    // so a later invalid item can never orphan an earlier generated object.
    for (let idx = 0; idx < mediaToInsert.length; idx++) {
      const mediaItem = mediaToInsert[idx];
      if (mediaItem.mediaType !== "image") continue;
      try {
        const thumbnailPath = await generateCommunityThumbnail(mediaItem.objectPath);
        if (thumbnailPath) {
          mediaItem.thumbnailObjectPath = thumbnailPath;
          generatedThumbnailPaths.add(thumbnailPath);
        }
      } catch (thumbnailError) {
        console.error(`[post-create] media[${idx}] thumbnail generation failed (non-fatal):`, {
          objectPath: mediaItem.objectPath,
          error:
            thumbnailError instanceof Error
              ? thumbnailError.message
              : String(thumbnailError),
        });
      }
    }

    // Wrap post + media insert in a transaction so a media-insert failure
    // can never leave an orphan post with no media in the feed.
    let created: typeof communityPostsTable.$inferSelect;
    try {
      created = await db.transaction(async (tx) => {
        const [newPost] = await tx
          .insert(communityPostsTable)
          .values({
            authorUserId: req.user!.id,
            content,
            postType,
            isVipLocked: false,
          })
          .returning();

        if (mediaToInsert.length > 0) {
          await tx
            .insert(communityPostMediaTable)
            .values(mediaToInsert.map((m) => ({ ...m, postId: newPost.id })));
        }

        return newPost;
      });
    } catch (persistenceError) {
      await Promise.allSettled(
        [...generatedThumbnailPaths].map((path) => deleteGeneratedThumbnail(path)),
      );
      throw persistenceError;
    }

    console.log(`[post-create] created post id=${created.id} with ${mediaToInsert.length} media item(s)`);

    // A new VIP post is broadcast to everyone (except the author). Notifications
    // must never break post creation, so failures are swallowed.
    if (isActiveVip(req.user)) {
      try {
        await createNotification({
          type: "community_vip_post",
          title: "منشور VIP جديد",
          body: snippet(content ?? "") || "شاهد أحدث منشور في مجتمع GAB School",
          actorUserId: req.user!.id,
          audienceType: "all",
          excludeUserIds: [req.user!.id],
          targetType: "post",
          targetId: created.id,
          targetPath: "/community",
        });
      } catch {
        /* notifications are best-effort */
      }
    }

    const post = await getVisiblePostRow(created.id);
    const mediaMap = await loadMediaFor([created.id]);
    const serialized = serializePost(post!, mediaMap.get(created.id) ?? [], req.user, false);
    console.log(`[post-create] response media count=${serialized.media?.length ?? 0}`);
    res.status(201).json(serialized);
  } catch (error: unknown) {
    console.error("[post-create] unhandled error:", error);
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create post" });
  }
});

// PATCH /community/posts/:id  (author only — edit caption)
router.patch("/community/posts/:id", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(communityPostsTable)
      .where(eq(communityPostsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    if (existing.authorUserId !== req.user!.id) {
      res.status(403).json({ message: "لا يمكنك تعديل هذا المنشور" });
      return;
    }

    const parsed = UpdateCommunityPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات غير صالحة" });
      return;
    }

    const content = parsed.data.content?.trim() || null;
    if (existing.postType === "text" && !content) {
      res.status(400).json({ message: "لا يمكن أن يكون المنشور النصي فارغاً" });
      return;
    }

    await db
      .update(communityPostsTable)
      .set({ content, updatedAt: new Date() })
      .where(eq(communityPostsTable.id, id));

    const post = await getVisiblePostRow(id);
    const mediaMap = await loadMediaFor([id]);
    const likedSet = await likedPostIds(req.user, [id]);
    res.json(serializePost(post!, mediaMap.get(id) ?? [], req.user, likedSet.has(id)));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update post" });
  }
});

// DELETE /community/posts/:id  (author only)
router.delete("/community/posts/:id", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(communityPostsTable)
      .where(eq(communityPostsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    if (existing.authorUserId !== req.user!.id) {
      res.status(403).json({ message: "لا يمكنك حذف هذا المنشور" });
      return;
    }
    const mediaRows = await db
      .select({
        mediaType: communityPostMediaTable.mediaType,
        thumbnailObjectPath: communityPostMediaTable.thumbnailObjectPath,
      })
      .from(communityPostMediaTable)
      .where(eq(communityPostMediaTable.postId, id));
    // Delete generated derivatives first. If storage is temporarily unavailable,
    // keep the DB row so the user can retry instead of losing cleanup metadata.
    await Promise.all(
      mediaRows
        .filter(
          (media) =>
            media.mediaType === "image" &&
            media.thumbnailObjectPath?.startsWith("/objects/thumbnails/"),
        )
        .map((media) => deleteGeneratedThumbnail(media.thumbnailObjectPath!)),
    );
    await db.delete(communityPostsTable).where(eq(communityPostsTable.id, id));
    res.json({ message: "تم حذف المنشور" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete post" });
  }
});

// POST /community/posts/:id/like
router.post("/community/posts/:id/like", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    await db
      .insert(communityPostLikesTable)
      .values({ postId: id, userId: req.user!.id })
      .onConflictDoNothing();
    const likesCount = await recomputeLikes(id);

    // Notify the post owner (deduped per actor so re-likes don't re-notify).
    if (post.authorUserId && post.authorUserId !== req.user!.id) {
      try {
        await createNotification({
          type: "like",
          title: "إعجاب جديد بمنشورك",
          body: `أعجب ${req.user!.username} بمنشورك`,
          actorUserId: req.user!.id,
          recipientUserIds: [post.authorUserId],
          targetType: "post",
          targetId: id,
          targetPath: "/community",
          dedupeKey: `like:${id}:${req.user!.id}`,
        });
      } catch {
        /* notifications are best-effort */
      }
    }

    res.json({ liked: true, likesCount });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to like post" });
  }
});

// DELETE /community/posts/:id/like
router.delete("/community/posts/:id/like", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .delete(communityPostLikesTable)
      .where(
        and(eq(communityPostLikesTable.postId, id), eq(communityPostLikesTable.userId, req.user!.id)),
      );
    const likesCount = await recomputeLikes(id);
    res.json({ liked: false, likesCount });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to unlike post" });
  }
});

// POST /community/posts/:id/view  (deduped per user)
router.post("/community/posts/:id/view", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    const inserted = await db
      .insert(communityPostViewsTable)
      .values({ postId: id, userId: req.user!.id })
      .onConflictDoNothing()
      .returning({ id: communityPostViewsTable.id });
    const counted = inserted.length > 0;
    const viewsCount = counted ? await recomputeViews(id) : post.viewsCount;
    res.json({ counted, viewsCount });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to register view" });
  }
});

// GET /community/posts/:id/comments  (threaded one level)
router.get("/community/posts/:id/comments", optionalUserAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    const rows = await db
      .select({
        id: communityCommentsTable.id,
        postId: communityCommentsTable.postId,
        userId: communityCommentsTable.userId,
        parentId: communityCommentsTable.parentId,
        body: communityCommentsTable.body,
        createdAt: communityCommentsTable.createdAt,
        authorUsername: usersTable.username,
        authorAccountType: usersTable.accountType,
        authorProfileImage: usersTable.profileImage,
      })
      .from(communityCommentsTable)
      .leftJoin(usersTable, eq(communityCommentsTable.userId, usersTable.id))
      .where(
        and(
          eq(communityCommentsTable.postId, id),
          eq(communityCommentsTable.isVisible, true),
          eq(communityCommentsTable.isHidden, false),
        ),
      )
      .orderBy(asc(communityCommentsTable.createdAt), asc(communityCommentsTable.id));

    const viewerId = req.user?.id;
    const serialize = (r: (typeof rows)[number]) => ({
      id: r.id,
      postId: r.postId,
      parentId: r.parentId ?? null,
      author: authorPayload({
        authorUserId: r.userId,
        authorUsername: r.authorUsername,
        authorAccountType: r.authorAccountType,
        authorProfileImage: r.authorProfileImage,
      }),
      body: r.body,
      canDelete: !!viewerId && viewerId === r.userId,
      createdAt: r.createdAt.toISOString(),
    });

    const topLevel = rows.filter((r) => r.parentId == null);
    const repliesByParent = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.parentId != null) {
        const arr = repliesByParent.get(r.parentId) ?? [];
        arr.push(r);
        repliesByParent.set(r.parentId, arr);
      }
    }

    res.json({
      comments: topLevel.map((c) => ({
        ...serialize(c),
        parentId: null,
        replies: (repliesByParent.get(c.id) ?? []).map((rep) => ({
          id: rep.id,
          postId: rep.postId,
          parentId: c.id,
          author: authorPayload({
            authorUserId: rep.userId,
            authorUsername: rep.authorUsername,
            authorAccountType: rep.authorAccountType,
            authorProfileImage: rep.authorProfileImage,
          }),
          body: rep.body,
          canDelete: !!viewerId && viewerId === rep.userId,
          createdAt: rep.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load comments" });
  }
});

// POST /community/posts/:id/comments
router.post("/community/posts/:id/comments", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.user!.profileImage) {
      res.status(403).json({ message: "يجب إضافة صورة شخصية قبل التعليق", code: "PROFILE_PICTURE_REQUIRED" });
      return;
    }
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    const parsed = CreateCommunityCommentBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.body.trim()) {
      res.status(400).json({ message: "لا يمكن إرسال تعليق فارغ" });
      return;
    }

    // Flatten threading to a single level: replying to a reply attaches to the
    // reply's top-level parent.
    let parentId: number | null = null;
    // The owner of the exact comment being replied to (notify them, not the
    // flattened top-level parent's owner).
    let replyTargetOwnerId: number | null = null;
    if (parsed.data.parentId != null) {
      const [parent] = await db
        .select()
        .from(communityCommentsTable)
        .where(
          and(
            eq(communityCommentsTable.id, parsed.data.parentId),
            eq(communityCommentsTable.postId, id),
          ),
        )
        .limit(1);
      if (parent) {
        parentId = parent.parentId ?? parent.id;
        replyTargetOwnerId = parent.userId;
      }
    }

    const [created] = await db
      .insert(communityCommentsTable)
      .values({ postId: id, userId: req.user!.id, parentId, body: parsed.data.body.trim() })
      .returning();

    await recomputeComments(id);

    // A reply notifies the replied-to comment's owner; a top-level comment
    // notifies the post owner. Self-actions are skipped.
    try {
      if (replyTargetOwnerId != null) {
        if (replyTargetOwnerId !== req.user!.id) {
          await createNotification({
            type: "reply",
            title: "رد جديد على تعليقك",
            body: `رد ${req.user!.username}: ${snippet(created.body)}`,
            actorUserId: req.user!.id,
            recipientUserIds: [replyTargetOwnerId],
            targetType: "post",
            targetId: id,
            targetPath: "/community",
          });
        }
      } else if (post.authorUserId && post.authorUserId !== req.user!.id) {
        await createNotification({
          type: "comment",
          title: "تعليق جديد على منشورك",
          body: `علّق ${req.user!.username}: ${snippet(created.body)}`,
          actorUserId: req.user!.id,
          recipientUserIds: [post.authorUserId],
          targetType: "post",
          targetId: id,
          targetPath: "/community",
        });
      }
    } catch {
      /* notifications are best-effort */
    }

    res.status(201).json({
      id: created.id,
      postId: id,
      parentId: created.parentId ?? null,
      author: {
        id: req.user!.id,
        username: req.user!.username,
        accountType: req.user!.accountType === "vip" ? "vip" : "normal",
        profileImageUrl: req.user!.profileImage ? `/api/users/${req.user!.id}/avatar` : null,
      },
      body: created.body,
      canDelete: true,
      createdAt: created.createdAt.toISOString(),
      replies: [],
    });
    return;
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to add comment" });
  }
});

// DELETE /community/comments/:id  (author only)
router.delete("/community/comments/:id", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(communityCommentsTable)
      .where(eq(communityCommentsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }
    if (existing.userId !== req.user!.id) {
      res.status(403).json({ message: "لا يمكنك حذف هذا التعليق" });
      return;
    }
    await db.delete(communityCommentsTable).where(eq(communityCommentsTable.id, id));
    await recomputeComments(existing.postId);
    res.json({ message: "تم حذف التعليق" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete comment" });
  }
});

// POST /community/posts/:id/report
router.post("/community/posts/:id/report", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "المنشور غير موجود" });
      return;
    }
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : null;
    await db.insert(communityReportsTable).values({
      postId: id,
      reporterId: req.user!.id,
      reason,
      status: "pending",
    }).onConflictDoNothing();
    res.json({ message: "تم إرسال التبليغ، شكراً لمساعدتنا في الحفاظ على المجتمع" });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to report post" });
  }
});

// POST /community/comments/:id/report
router.post("/community/comments/:id/report", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [comment] = await db
      .select({ id: communityCommentsTable.id, isVisible: communityCommentsTable.isVisible, isHidden: communityCommentsTable.isHidden })
      .from(communityCommentsTable)
      .where(eq(communityCommentsTable.id, id))
      .limit(1);
    if (!comment || !comment.isVisible || comment.isHidden) {
      res.status(404).json({ message: "التعليق غير موجود" });
      return;
    }
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : null;
    await db.insert(communityReportsTable).values({
      commentId: id,
      reporterId: req.user!.id,
      reason,
      status: "pending",
    }).onConflictDoNothing();
    res.json({ message: "تم إرسال التبليغ، شكراً لمساعدتنا في الحفاظ على المجتمع" });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to report comment" });
  }
});

// GET /community/media/:id  (protected streaming — token in query)
// Not part of the OpenAPI client; <img>/<video> hit this URL directly.
router.get("/community/media/:id", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    const variant =
      req.query.variant === "full"
        ? "full"
        : req.query.variant === "thumbnail"
          ? "thumbnail"
          : "preview";
    const token = String(req.query.token || "");

    const payload = verifyMediaToken(token);
    if (!payload || payload.mediaId !== mediaId || payload.variant !== variant) {
      console.warn(`[media-stream] 401 mediaId=${mediaId} variant=${variant} tokenOk=${!!payload}`);
      res.status(401).json({ message: "Unauthorized media request" });
      return;
    }

    const [media] = await db
      .select()
      .from(communityPostMediaTable)
      .where(eq(communityPostMediaTable.id, mediaId))
      .limit(1);
    if (!media) {
      console.warn(`[media-stream] 404 no DB row mediaId=${mediaId}`);
      res.status(404).json({ message: "Media not found" });
      return;
    }

    const post = await getVisiblePostRow(media.postId);
    if (!post) {
      console.warn(`[media-stream] 404 post not visible postId=${media.postId} mediaId=${mediaId}`);
      res.status(404).json({ message: "Media not found" });
      return;
    }

    if (variant === "full" || variant === "thumbnail") {
      // Re-check entitlement fresh at stream time — never trust the token alone.
      if (post.isVipLocked) {
        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, payload.userId))
          .limit(1);
        const expired =
          user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date();
        const entitled = !!user && user.isActive && user.accountType === "vip" && !expired;
        if (!entitled) {
          console.warn(`[media-stream] 403 VIP-locked mediaId=${mediaId} userId=${payload.userId}`);
          res.status(403).json({ message: "هذا المحتوى متاح لأعضاء VIP فقط" });
          return;
        }
      }
      if (variant === "full") {
        console.log(`[media-stream] streaming full mediaId=${mediaId} objectPath=${media.objectPath}`);
        await streamObject(req, res, media.objectPath);
        return;
      }

      if (media.mediaType !== "image") {
        res.status(404).json({ message: "Thumbnail not available" });
        return;
      }
      let thumbnailPath = media.thumbnailObjectPath;
      if (!thumbnailPath) {
        const generatedPath = await generateCommunityThumbnail(media.objectPath);
        if (generatedPath) {
          try {
            const [updated] = await db
              .update(communityPostMediaTable)
              .set({ thumbnailObjectPath: generatedPath })
              .where(
                and(
                  eq(communityPostMediaTable.id, media.id),
                  isNull(communityPostMediaTable.thumbnailObjectPath),
                ),
              )
              .returning({ thumbnailObjectPath: communityPostMediaTable.thumbnailObjectPath });
            if (updated?.thumbnailObjectPath) {
              thumbnailPath = updated.thumbnailObjectPath;
            } else {
              const [winner] = await db
                .select({ thumbnailObjectPath: communityPostMediaTable.thumbnailObjectPath })
                .from(communityPostMediaTable)
                .where(eq(communityPostMediaTable.id, media.id))
                .limit(1);
              thumbnailPath = winner?.thumbnailObjectPath ?? null;
              await deleteGeneratedThumbnail(generatedPath);
            }
          } catch (persistenceError) {
            await deleteGeneratedThumbnail(generatedPath).catch(() => {});
            throw persistenceError;
          }
        }
      }
      if (!thumbnailPath) {
        res.status(404).json({ message: "Thumbnail not available" });
        return;
      }
      console.log(
        `[media-stream] streaming thumbnail mediaId=${mediaId} thumbnailObjectPath=${thumbnailPath}`,
      );
      await streamObject(req, res, thumbnailPath);
      return;
    }

    // preview variant — safe low-res image / video thumbnail for everyone
    if (!media.previewObjectPath) {
      console.warn(`[media-stream] 404 no previewObjectPath mediaId=${mediaId}`);
      res.status(404).json({ message: "Preview not available" });
      return;
    }
    console.log(`[media-stream] streaming preview mediaId=${mediaId} previewObjectPath=${media.previewObjectPath}`);
    await streamObject(req, res, media.previewObjectPath);
  } catch (error: unknown) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Media object not found" });
      return;
    }
    if (!res.headersSent) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to serve media" });
    } else {
      res.end();
    }
  }
});

export default router;
