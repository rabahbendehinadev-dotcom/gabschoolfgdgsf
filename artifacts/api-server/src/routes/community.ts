import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  communityPostsTable,
  communityPostMediaTable,
  communityPostLikesTable,
  communityCommentsTable,
  communityPostViewsTable,
  communityReportsTable,
  communityPollVotesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray, count, gte, isNull, sql } from "drizzle-orm";
import { communitySubscriberAuth } from "../middlewares/auth";
import { generateMediaToken, verifyMediaToken } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { createNotification } from "../lib/notifications";
import { buildCommunityPostNotification } from "../lib/communityNotifications";
import {
  CreateCommunityPostBody,
  UpdateCommunityPostBody,
  CreateCommunityCommentBody,
} from "@workspace/api-zod";
import { isActiveCommunitySubscriber, isActiveVip } from "../lib/vipUtils";
import {
  deleteGeneratedThumbnail,
  generateCommunityThumbnail,
} from "../lib/imageThumbnail";
import { verifyCommunityUploadReceipt } from "../lib/communityUploadReceipt";
import { deleteCommunityMediaForPosts } from "../lib/communityMediaCleanup";

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
  authorCommunityRole?: string | null;
  authorProfileImage?: string | null;
}) {
  return {
    id: row.authorUserId,
    username: row.authorUsername || "عضو",
    accountType: row.authorAccountType === "vip" ? "vip" : "normal",
    role:
      row.authorCommunityRole === "admin" || row.authorCommunityRole === "formateur"
        ? row.authorCommunityRole
        : "student",
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
    mediaType:
      media.mediaType === "video" ? "video" : media.mediaType === "file" ? "file" : "image",
    locked: !entitled,
    previewUrl,
    thumbnailUrl,
    fullUrl,
    width: media.width ?? null,
    height: media.height ?? null,
    durationSec: media.durationSec ?? null,
    fileName: media.fileName ?? null,
    contentType: media.contentType ?? null,
    sizeBytes: media.sizeBytes ?? null,
    sortOrder: media.sortOrder,
  };
}

type PostRow = typeof communityPostsTable.$inferSelect & {
  authorUsername: string | null;
  authorAccountType: string | null;
  authorCommunityRole: string | null;
  authorProfileImage: string | null;
};

function serializePost(
  post: PostRow,
  mediaRows: MediaRow[],
  viewer: Viewer,
  likedByMe: boolean,
  poll?: { votes: number[]; myVote: number | null },
) {
  const viewerUserId = viewer?.id ?? 0;
  const entitled = isEntitled(viewer, post);
  return {
    id: post.id,
    author: authorPayload(post),
    content: post.content ?? null,
    title: post.title ?? null,
    category: post.category ?? null,
    postType: post.postType,
    isVipLocked: post.isVipLocked,
    isPinned: post.isPinned,
    isFeatured: post.isFeatured,
    isImportant: post.isImportant,
    isSolved: post.isSolved,
    isQuestion: post.isQuestion,
    pollOptions: post.pollOptions ?? null,
    pollVotes: poll?.votes ?? null,
    myPollVote: poll?.myVote ?? null,
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

async function loadPollsFor(
  posts: Array<{ id: number; pollOptions: string[] | null }>,
  viewer: Viewer,
): Promise<Map<number, { votes: number[]; myVote: number | null }>> {
  const map = new Map<number, { votes: number[]; myVote: number | null }>();
  const pollPosts = posts.filter((post) => post.pollOptions?.length);
  if (!pollPosts.length) return map;
  for (const post of pollPosts) {
    map.set(post.id, { votes: post.pollOptions!.map(() => 0), myVote: null });
  }
  const rows = await db
    .select({
      postId: communityPollVotesTable.postId,
      userId: communityPollVotesTable.userId,
      optionIndex: communityPollVotesTable.optionIndex,
    })
    .from(communityPollVotesTable)
    .where(inArray(communityPollVotesTable.postId, pollPosts.map((post) => post.id)));
  for (const vote of rows) {
    const item = map.get(vote.postId);
    if (!item || vote.optionIndex < 0 || vote.optionIndex >= item.votes.length) continue;
    item.votes[vote.optionIndex]++;
    if (viewer?.id === vote.userId) item.myVote = vote.optionIndex;
  }
  return map;
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
      title: communityPostsTable.title,
      category: communityPostsTable.category,
      postType: communityPostsTable.postType,
      isVipLocked: communityPostsTable.isVipLocked,
      isVisible: communityPostsTable.isVisible,
      isHidden: communityPostsTable.isHidden,
      isPinned: communityPostsTable.isPinned,
      isFeatured: communityPostsTable.isFeatured,
      isImportant: communityPostsTable.isImportant,
      isSolved: communityPostsTable.isSolved,
      isQuestion: communityPostsTable.isQuestion,
      pollOptions: communityPostsTable.pollOptions,
      likesCount: communityPostsTable.likesCount,
      commentsCount: communityPostsTable.commentsCount,
      viewsCount: communityPostsTable.viewsCount,
      createdAt: communityPostsTable.createdAt,
      updatedAt: communityPostsTable.updatedAt,
      authorUsername: usersTable.username,
      authorAccountType: usersTable.accountType,
      authorCommunityRole: usersTable.communityRole,
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
async function streamObject(
  req: Request,
  res: Response,
  objectPath: string,
  downloadName?: string | null,
): Promise<void> {
  console.log(`[streamObject] objectPath=${objectPath} range=${req.headers.range || "none"}`);
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  const contentType = (metadata.contentType as string) || "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    downloadName
      ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName.replace(/[\r\n]/g, ""))}`
      : "inline",
  );

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
router.get("/community/summary", communitySubscriberAuth, async (req, res) => {
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

    const weekStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);
    const visible = and(eq(communityPostsTable.isVisible, true), eq(communityPostsTable.isHidden, false));
    const [weeklyPosts, trendingPosts, unansweredRows, activeCategoryRows, activeMemberRows, latestPostRows, latestSolutionRows] =
      await Promise.all([
        db.select({ createdAt: communityPostsTable.createdAt }).from(communityPostsTable).where(and(visible, gte(communityPostsTable.createdAt, weekStart))),
        db.select({ id: communityPostsTable.id, title: communityPostsTable.title, content: communityPostsTable.content, likesCount: communityPostsTable.likesCount, commentsCount: communityPostsTable.commentsCount, viewsCount: communityPostsTable.viewsCount })
          .from(communityPostsTable).where(and(visible, gte(communityPostsTable.createdAt, weekStart)))
          .orderBy(desc(sql`${communityPostsTable.likesCount} * 3 + ${communityPostsTable.commentsCount} * 5 + ${communityPostsTable.viewsCount}`)).limit(3),
        db.select({ id: communityPostsTable.id, title: communityPostsTable.title, content: communityPostsTable.content, viewsCount: communityPostsTable.viewsCount })
          .from(communityPostsTable).where(and(visible, eq(communityPostsTable.isQuestion, true), eq(communityPostsTable.isSolved, false), eq(communityPostsTable.commentsCount, 0)))
          .orderBy(desc(communityPostsTable.viewsCount), desc(communityPostsTable.createdAt)).limit(1),
        db.select({ category: communityPostsTable.category, postsCount: count() }).from(communityPostsTable)
          .where(and(visible, gte(communityPostsTable.createdAt, weekStart), sql`${communityPostsTable.category} is not null`))
          .groupBy(communityPostsTable.category).orderBy(desc(count())).limit(1),
        db.select({ id: usersTable.id, username: usersTable.username, accountType: usersTable.accountType, communityRole: usersTable.communityRole, profileImage: usersTable.profileImage, postsCount: count() })
          .from(communityPostsTable).innerJoin(usersTable, eq(communityPostsTable.authorUserId, usersTable.id))
          .where(and(visible, gte(communityPostsTable.createdAt, weekStart)))
          .groupBy(usersTable.id).orderBy(desc(count())).limit(5),
        db.select({ id: communityPostsTable.id, title: communityPostsTable.title, content: communityPostsTable.content, createdAt: communityPostsTable.createdAt })
          .from(communityPostsTable).where(visible).orderBy(desc(communityPostsTable.createdAt)).limit(1),
        db.select({ id: communityPostsTable.id, title: communityPostsTable.title, content: communityPostsTable.content, createdAt: communityPostsTable.createdAt })
          .from(communityPostsTable).where(and(visible, eq(communityPostsTable.isSolved, true))).orderBy(desc(communityPostsTable.updatedAt)).limit(1),
      ]);
    const activity = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + offset);
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: weeklyPosts.filter((p) => p.createdAt.toISOString().slice(0, 10) === key).length };
    });

    res.json({
      memberCount: Number(members),
      todayPostsCount: Number(today),
      totalPostsCount: Number(total),
      coverImageUrl: null,
      isAuthenticated: !!req.user,
      isVip: isActiveVip(req.user),
      canPost: !!req.user,
      hasProfilePicture: !!(req.user?.profileImage),
      weeklyPostsCount: weeklyPosts.length,
      activityThisWeek: activity,
      trendingPosts: trendingPosts.map((p) => ({ ...p, label: p.title || snippet(p.content || "", 70) || `منشور #${p.id}` })),
      unansweredQuestion: unansweredRows[0] ? { ...unansweredRows[0], label: unansweredRows[0].title || snippet(unansweredRows[0].content || "", 80) } : null,
      mostActiveCategory: activeCategoryRows[0] ? { category: activeCategoryRows[0].category!, postsCount: Number(activeCategoryRows[0].postsCount) } : null,
      activeMembers: activeMemberRows.map((m) => ({ id: m.id, username: m.username, accountType: m.accountType === "vip" ? "vip" : "normal", role: m.communityRole, profileImageUrl: m.profileImage ? `/api/users/${m.id}/avatar` : null, postsCount: Number(m.postsCount) })),
      latestPost: latestPostRows[0] ? { ...latestPostRows[0], label: latestPostRows[0].title || snippet(latestPostRows[0].content || "", 70), createdAt: latestPostRows[0].createdAt.toISOString() } : null,
      latestSolution: latestSolutionRows[0] ? { ...latestSolutionRows[0], label: latestSolutionRows[0].title || snippet(latestSolutionRows[0].content || "", 70), createdAt: latestSolutionRows[0].createdAt.toISOString() } : null,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load summary" });
  }
});

// GET /community/posts  (feed)
router.get("/community/posts", communitySubscriberAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 30);
    const offset = Math.max(Number(req.query.cursor) || 0, 0);

    const rows = (await db
      .select({
        id: communityPostsTable.id,
        authorUserId: communityPostsTable.authorUserId,
        content: communityPostsTable.content,
        title: communityPostsTable.title,
        category: communityPostsTable.category,
        postType: communityPostsTable.postType,
        isVipLocked: communityPostsTable.isVipLocked,
        isVisible: communityPostsTable.isVisible,
        isHidden: communityPostsTable.isHidden,
        isPinned: communityPostsTable.isPinned,
        isFeatured: communityPostsTable.isFeatured,
        isImportant: communityPostsTable.isImportant,
        isSolved: communityPostsTable.isSolved,
        isQuestion: communityPostsTable.isQuestion,
        pollOptions: communityPostsTable.pollOptions,
        likesCount: communityPostsTable.likesCount,
        commentsCount: communityPostsTable.commentsCount,
        viewsCount: communityPostsTable.viewsCount,
        createdAt: communityPostsTable.createdAt,
        updatedAt: communityPostsTable.updatedAt,
        authorUsername: usersTable.username,
        authorAccountType: usersTable.accountType,
        authorCommunityRole: usersTable.communityRole,
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

    const [mediaMap, likedSet, pollMap] = await Promise.all([
      loadMediaFor(ids),
      likedPostIds(req.user, ids),
      loadPollsFor(pagePosts, req.user),
    ]);

    res.json({
      posts: pagePosts.map((p) =>
        serializePost(p, mediaMap.get(p.id) ?? [], req.user, likedSet.has(p.id), pollMap.get(p.id)),
      ),
      nextCursor: hasMore ? offset + limit : null,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load feed" });
  }
});

// GET /community/posts/:id
router.get("/community/posts/:id", communitySubscriberAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await getVisiblePostRow(id);
    if (!post) {
      res.status(404).json({ message: "Post not found" });
      return;
    }
    const mediaMap = await loadMediaFor([id]);
    const likedSet = await likedPostIds(req.user, [id]);
    const pollMap = await loadPollsFor([post], req.user);
    res.json(serializePost(post, mediaMap.get(id) ?? [], req.user, likedSet.has(id), pollMap.get(id)));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load post" });
  }
});

// POST /community/posts  (all authenticated users; requires profile picture)
router.post("/community/posts", communitySubscriberAuth, async (req, res) => {
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
    const title = parsed.data.title?.trim() || null;
    const category = parsed.data.category ?? null;
    const isQuestion = parsed.data.isQuestion === true;
    const pollOptions = parsed.data.pollOptions?.map((option) => option.trim()).filter(Boolean) ?? null;
    const media = parsed.data.media ?? [];

    console.log(`[post-create] user=${req.user!.id} postType=${postType} mediaCount=${media.length} content=${content ? "yes" : "no"}`);

    if (postType === "text" && !content && !title && !pollOptions?.length) {
      res.status(400).json({ message: "لا يمكن نشر منشور نصي فارغ" });
      return;
    }
    if (postType !== "text" && postType !== "poll" && media.length === 0) {
      res.status(400).json({ message: "يجب إرفاق وسائط لهذا النوع من المنشورات" });
      return;
    }
    if (postType === "poll") {
      if (
        !pollOptions ||
        pollOptions.length < 2 ||
        pollOptions.length > 6 ||
        new Set(pollOptions.map((option) => option.toLocaleLowerCase())).size !== pollOptions.length ||
        media.length > 0
      ) {
        res.status(400).json({ message: "الاستطلاع يحتاج من خيارين إلى 6 خيارات مختلفة وبدون مرفقات" });
        return;
      }
    } else if (pollOptions?.length) {
      res.status(400).json({ message: "خيارات الاستطلاع مسموحة فقط لمنشور استطلاع" });
      return;
    }
    const matchesDeclaredType =
      (postType === "text" && media.length === 0) ||
      (postType === "poll" && media.length === 0) ||
      (postType === "image" && media.length === 1 && media[0]?.mediaType === "image") ||
      (postType === "video" && media.length === 1 && media[0]?.mediaType === "video") ||
      (postType === "file" && media.length === 1 && media[0]?.mediaType === "file") ||
      (postType === "gallery" && media.length >= 2 && media.length <= 6);
    if (!matchesDeclaredType) {
      res.status(400).json({ message: "نوع وعدد المرفقات لا يطابق نوع المنشور" });
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
      fileName: string | null;
      sortOrder: number;
    }> = [];
    const generatedThumbnailPaths = new Set<string>();

    for (let idx = 0; idx < media.length; idx++) {
      const m = media[idx];
      const wantVideo = m.mediaType === "video";
      const wantFile = m.mediaType === "file";
      const preview = m.previewObjectPath?.trim();
      console.log(`[post-create] media[${idx}] objectPath=${m.objectPath} previewObjectPath=${preview}`);
      if (!wantFile && !preview) {
        res.status(400).json({ message: "ينقص معاينة الوسائط" });
        return;
      }
      if (!wantFile && preview === m.objectPath) {
        res.status(400).json({ message: "معاينة الوسائط غير صالحة" });
        return;
      }
      const originalReceipt = verifyCommunityUploadReceipt(m.uploadToken, {
        objectPath: m.objectPath,
        userId: req.user!.id,
      });
      const previewReceipt = wantFile
        ? null
        : verifyCommunityUploadReceipt(m.previewUploadToken ?? "", {
            objectPath: preview!,
            userId: req.user!.id,
          });
      if (!originalReceipt || (!wantFile && !previewReceipt)) {
        res.status(400).json({ message: "إيصال رفع الوسائط غير صالح أو منتهي" });
        return;
      }
      if (
        !wantFile &&
        (!previewReceipt!.contentType.startsWith("image/") ||
          previewReceipt!.sizeBytes > PREVIEW_MAX_BYTES)
      ) {
        res.status(400).json({ message: "معاينة الوسائط يجب أن تكون صورة مصغّرة" });
        return;
      }
      if (wantVideo && !originalReceipt.contentType.startsWith("video/")) {
        res.status(400).json({ message: "نوع ملف الفيديو غير صالح" });
        return;
      }
      if (!wantVideo && !wantFile && !originalReceipt.contentType.startsWith("image/")) {
        res.status(400).json({ message: "نوع ملف الصورة غير صالح" });
        return;
      }
      mediaToInsert.push({
        mediaType: wantVideo ? "video" : wantFile ? "file" : "image",
        objectPath: m.objectPath,
        previewObjectPath: preview || "",
        thumbnailObjectPath: null,
        width: m.width ?? null,
        height: m.height ?? null,
        durationSec: m.durationSec ?? null,
        contentType: originalReceipt.contentType,
        sizeBytes: originalReceipt.sizeBytes,
        fileName: wantFile ? (m.fileName?.trim().slice(0, 255) || "ملف مرفق") : null,
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
            title,
            category,
            isQuestion,
            pollOptions: postType === "poll" ? pollOptions : null,
            postType,
            isVipLocked: mediaToInsert.length > 0,
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

    // Every new post is broadcast to everyone except the author. Notification
    // and push failures remain best-effort and never roll back a valid post.
    try {
      await createNotification(buildCommunityPostNotification({
        authorUserId: req.user!.id,
        postId: created.id,
        body: snippet(content ?? "") || "شاهد أحدث منشور في مجتمع GAB School",
      }));
    } catch (notificationError) {
      console.error("[community-post-notification] create failed", {
        postId: created.id,
        message: notificationError instanceof Error ? notificationError.message : "Unknown error",
      });
    }

    const post = await getVisiblePostRow(created.id);
    const mediaMap = await loadMediaFor([created.id]);
    const pollMap = await loadPollsFor([post!], req.user);
    const serialized = serializePost(post!, mediaMap.get(created.id) ?? [], req.user, false, pollMap.get(created.id));
    console.log(`[post-create] response media count=${serialized.media?.length ?? 0}`);
    res.status(201).json(serialized);
  } catch (error: unknown) {
    console.error("[post-create] unhandled error:", error);
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create post" });
  }
});

// PATCH /community/posts/:id  (author only — edit caption)
router.patch("/community/posts/:id", communitySubscriberAuth, async (req, res) => {
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

    const content =
      parsed.data.content === undefined ? existing.content : parsed.data.content?.trim() || null;
    const title =
      parsed.data.title === undefined ? existing.title : parsed.data.title?.trim() || null;
    if (existing.postType === "text" && !content && !title) {
      res.status(400).json({ message: "لا يمكن أن يكون المنشور النصي فارغاً" });
      return;
    }

    const updates: Partial<typeof communityPostsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.content !== undefined) updates.content = content;
    if (parsed.data.title !== undefined) updates.title = title;
    if (typeof parsed.data.isSolved === "boolean" && existing.isQuestion) {
      updates.isSolved = parsed.data.isSolved;
    }
    await db
      .update(communityPostsTable)
      .set(updates)
      .where(eq(communityPostsTable.id, id));

    const post = await getVisiblePostRow(id);
    const mediaMap = await loadMediaFor([id]);
    const likedSet = await likedPostIds(req.user, [id]);
    res.json(serializePost(post!, mediaMap.get(id) ?? [], req.user, likedSet.has(id)));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update post" });
  }
});

// POST /community/posts/:id/poll-vote
router.post("/community/posts/:id/poll-vote", communitySubscriberAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const optionIndex = Number(req.body?.optionIndex);
    const post = await getVisiblePostRow(postId);
    const options = post?.pollOptions;
    if (!post || !Array.isArray(options) || options.length < 2) {
      res.status(404).json({ message: "الاستطلاع غير موجود" });
      return;
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
      res.status(400).json({ message: "الخيار غير صالح" });
      return;
    }
    await db
      .insert(communityPollVotesTable)
      .values({
        postId,
        userId: req.user!.id,
        optionIndex,
      })
      .onConflictDoNothing({
        target: [communityPollVotesTable.postId, communityPollVotesTable.userId],
      });
    const pollMap = await loadPollsFor([post], req.user);
    const poll = pollMap.get(postId)!;
    res.json({ votes: poll.votes, myVote: poll.myVote ?? optionIndex });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to vote" });
  }
});

// DELETE /community/posts/:id  (author only)
router.delete("/community/posts/:id", communitySubscriberAuth, async (req, res) => {
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
    // Keep DB protection metadata if storage cleanup fails, so retained direct
    // paths can never become public orphaned objects.
    await deleteCommunityMediaForPosts([id]);
    await db.delete(communityPostsTable).where(eq(communityPostsTable.id, id));
    res.json({ message: "تم حذف المنشور" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete post" });
  }
});

// POST /community/posts/:id/like
router.post("/community/posts/:id/like", communitySubscriberAuth, async (req, res) => {
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
router.delete("/community/posts/:id/like", communitySubscriberAuth, async (req, res) => {
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
router.post("/community/posts/:id/view", communitySubscriberAuth, async (req, res) => {
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
router.get("/community/posts/:id/comments", communitySubscriberAuth, async (req, res) => {
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
        authorCommunityRole: usersTable.communityRole,
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
        authorCommunityRole: r.authorCommunityRole,
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
            authorCommunityRole: rep.authorCommunityRole,
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
router.post("/community/posts/:id/comments", communitySubscriberAuth, async (req, res) => {
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

    const [commentAuthor] = await db
      .select({ communityRole: usersTable.communityRole })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id))
      .limit(1);
    const commentRole =
      commentAuthor?.communityRole === "admin" || commentAuthor?.communityRole === "formateur"
        ? commentAuthor.communityRole
        : "student";

    res.status(201).json({
      id: created.id,
      postId: id,
      parentId: created.parentId ?? null,
      author: {
        id: req.user!.id,
        username: req.user!.username,
        accountType: req.user!.accountType === "vip" ? "vip" : "normal",
        role: commentRole,
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
router.delete("/community/comments/:id", communitySubscriberAuth, async (req, res) => {
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
router.post("/community/posts/:id/report", communitySubscriberAuth, async (req, res) => {
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
router.post("/community/comments/:id/report", communitySubscriberAuth, async (req, res) => {
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

    const [viewer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);
    if (!isActiveCommunitySubscriber(viewer)) {
      res.status(403).json({
        message: "هذا المحتوى مخصص للمشتركين",
        code: "COMMUNITY_SUBSCRIPTION_REQUIRED",
      });
      return;
    }

    if (variant === "full" || variant === "thumbnail") {
      // Re-check entitlement fresh at stream time — never trust the token alone.
      if (post.isVipLocked) {
        if (!isActiveCommunitySubscriber(viewer)) {
          console.warn(`[media-stream] 403 VIP-locked mediaId=${mediaId} userId=${payload.userId}`);
          res.status(403).json({ message: "هذا المحتوى متاح لأعضاء VIP فقط" });
          return;
        }
      }
      if (variant === "full") {
        console.log(`[media-stream] streaming full mediaId=${mediaId} objectPath=${media.objectPath}`);
        await streamObject(
          req,
          res,
          media.objectPath,
          media.mediaType === "file" ? media.fileName || "attachment" : null,
        );
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
