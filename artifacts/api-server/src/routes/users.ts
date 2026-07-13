import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, communityPostsTable, communityPostMediaTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { userAuth, optionalUserAuth } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { generateMediaToken } from "../lib/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function avatarUrl(userId: number, profileImage: string | null): string | null {
  if (!profileImage) return null;
  return `/api/users/${userId}/avatar`;
}

async function streamAvatarObject(req: Request, res: Response, objectPath: string): Promise<void> {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  const contentType = (metadata.contentType as string) || "image/jpeg";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  if (size > 0) res.setHeader("Content-Length", String(size));

  const stream = file.createReadStream();
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  stream.pipe(res);
}

// PATCH /users/me/avatar — save objectPath from presigned upload
router.patch("/users/me/avatar", userAuth, async (req, res) => {
  try {
    const { objectPath } = req.body as { objectPath?: string };
    if (!objectPath || typeof objectPath !== "string" || !objectPath.trim()) {
      res.status(400).json({ message: "objectPath مطلوب" });
      return;
    }

    // Validate it's an image in object storage
    let contentType = "image/jpeg";
    let sizeBytes = 0;
    try {
      const file = await objectStorageService.getObjectEntityFile(objectPath.trim());
      const [meta] = await file.getMetadata();
      contentType = (meta.contentType as string) || "image/jpeg";
      sizeBytes = Number(meta.size || 0);
    } catch {
      res.status(400).json({ message: "تعذّر التحقق من الصورة" });
      return;
    }

    if (!contentType.startsWith("image/")) {
      res.status(400).json({ message: "يجب أن تكون الصورة الشخصية صورة" });
      return;
    }
    if (sizeBytes > 10 * 1024 * 1024) {
      res.status(400).json({ message: "حجم الصورة يتجاوز الحد المسموح (10MB)" });
      return;
    }

    await db
      .update(usersTable)
      .set({ profileImage: objectPath.trim() })
      .where(eq(usersTable.id, req.user!.id));

    res.json({
      profileImageUrl: avatarUrl(req.user!.id, objectPath.trim()),
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "فشل تحديث الصورة الشخصية" });
  }
});

// GET /users/:id/avatar — stream profile picture from object storage
router.get("/users/:id/avatar", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).end();
      return;
    }

    const [user] = await db
      .select({ profileImage: usersTable.profileImage })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (!user?.profileImage) {
      res.status(404).end();
      return;
    }

    await streamAvatarObject(req, res, user.profileImage);
  } catch (err: unknown) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).end();
      return;
    }
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

// GET /community/users/:id — public student profile
router.get("/community/users/:id", optionalUserAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ message: "المستخدم غير موجود" });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
        accountType: usersTable.accountType,
        profileImage: usersTable.profileImage,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ message: "المستخدم غير موجود" });
      return;
    }

    // Fetch recent visible posts
    const posts = await db
      .select({
        id: communityPostsTable.id,
        content: communityPostsTable.content,
        postType: communityPostsTable.postType,
        likesCount: communityPostsTable.likesCount,
        commentsCount: communityPostsTable.commentsCount,
        isPinned: communityPostsTable.isPinned,
        createdAt: communityPostsTable.createdAt,
      })
      .from(communityPostsTable)
      .where(
        and(
          eq(communityPostsTable.authorUserId, id),
          eq(communityPostsTable.isVisible, true),
          eq(communityPostsTable.isHidden, false),
        ),
      )
      .orderBy(desc(communityPostsTable.createdAt))
      .limit(12);

    // Load preview images for image posts
    const postIds = posts.map((p) => p.id);
    const mediaMap = new Map<number, string>();
    if (postIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const mediaRows = await db
        .select({
          postId: communityPostMediaTable.postId,
          previewObjectPath: communityPostMediaTable.previewObjectPath,
          id: communityPostMediaTable.id,
          sortOrder: communityPostMediaTable.sortOrder,
        })
        .from(communityPostMediaTable)
        .where(inArray(communityPostMediaTable.postId, postIds))
        .orderBy(communityPostMediaTable.sortOrder);

      const viewerId = req.user?.id ?? 0;
      for (const m of mediaRows) {
        if (!mediaMap.has(m.postId) && m.previewObjectPath) {
          const token = generateMediaToken({ userId: viewerId, mediaId: m.id, variant: "preview" });
          mediaMap.set(m.postId, `/api/community/media/${m.id}?variant=preview&token=${token}`);
        }
      }
    }

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName ?? null,
      accountType: user.accountType === "vip" ? "vip" : "normal",
      profileImageUrl: avatarUrl(user.id, user.profileImage),
      postsCount: posts.length,
      joinedAt: user.createdAt.toISOString(),
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content ?? null,
        postType: p.postType,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        isPinned: p.isPinned,
        previewImageUrl: mediaMap.get(p.id) ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "فشل تحميل الملف الشخصي" });
  }
});

export default router;
