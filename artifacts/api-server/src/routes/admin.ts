import path from "path";
import fs from "fs";
import { Router, type IRouter } from "express";
import multer from "multer";
import { db, usersTable, videosTable, categoriesTable, playlistsTable, subscriptionPlansTable, visitLogsTable, activityLogsTable } from "@workspace/db";
import { eq, sql, count, desc, asc, lt, and, gte, isNotNull, inArray } from "drizzle-orm";

import { adminAuth } from "../middlewares/auth";
import * as zod from "zod";
import {
  UpdateAdminUserBody,
  CreateVideoBody,
  UpdateVideoBody,
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateSubscriptionPlanBody,
} from "@workspace/api-zod";

const CreateSubscriptionPlanBody = zod.object({
  type: zod.string(),
  price: zod.string(),
  description: zod.string().optional(),
  durationDays: zod.number().optional().nullable(),
  isHidden: zod.boolean().optional().default(false),
});

async function logActivity(userId: number | null, username: string | null, action: string, details?: string, ip?: string) {
  try {
    await db.insert(activityLogsTable).values({ userId, username, action, details: details || null, ipAddress: ip || null });
  } catch (_) { }
}

const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `thumb_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const router: IRouter = Router();

router.get("/admin/stats", adminAuth, async (_req, res) => {
  try {
    const [userStats] = await db.select({
      totalUsers: count(),
    }).from(usersTable);

    const [vipCount] = await db.select({
      count: count(),
    }).from(usersTable).where(eq(usersTable.accountType, "vip"));

    const [normalCount] = await db.select({
      count: count(),
    }).from(usersTable).where(eq(usersTable.accountType, "normal"));

    const [demoCount] = await db.select({
      count: count(),
    }).from(usersTable).where(eq(usersTable.subscriptionType, "demo"));

    const [annualCount] = await db.select({
      count: count(),
    }).from(usersTable).where(eq(usersTable.subscriptionType, "annual"));

    const [lifetimeCount] = await db.select({
      count: count(),
    }).from(usersTable).where(eq(usersTable.subscriptionType, "lifetime"));

    const [videoStats] = await db.select({
      totalVideos: count(),
    }).from(videosTable);

    const [categoryStats] = await db.select({
      totalCategories: count(),
    }).from(categoriesTable);

    const [visitStats] = await db.select({
      totalVisits: count(),
    }).from(visitLogsTable);

    const recentRegs = await db.select({
      date: sql<string>`DATE(${usersTable.createdAt})::text`,
      count: count(),
    })
    .from(usersTable)
    .groupBy(sql`DATE(${usersTable.createdAt})`)
    .orderBy(desc(sql`DATE(${usersTable.createdAt})`))
    .limit(30);

    res.json({
      totalUsers: userStats.totalUsers,
      totalVideos: videoStats.totalVideos,
      totalCategories: categoryStats.totalCategories,
      vipUsers: vipCount.count,
      normalUsers: normalCount.count,
      demoSubscriptions: demoCount.count,
      annualSubscriptions: annualCount.count,
      lifetimeSubscriptions: lifetimeCount.count,
      recentRegistrations: recentRegs.map(r => ({ date: r.date, count: Number(r.count) })),
      totalVisits: visitStats.totalVisits,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch stats" });
  }
});

router.get("/admin/users", adminAuth, async (_req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      accountType: u.accountType,
      subscriptionType: u.subscriptionType,
      subscriptionExpiresAt: u.subscriptionExpiresAt?.toISOString() || null,
      ipAddress: u.ipAddress,
      ipAddress2: u.ipAddress2,
      isActive: u.isActive,
      phone: u.phone ?? null,
      createdAt: u.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch users" });
  }
});

router.patch("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateAdminUserBody.parse(req.body);

    const updateData: Partial<Record<string, unknown>> = {};
    if (body.accountType !== undefined) updateData.accountType = body.accountType;
    if (body.subscriptionType !== undefined) {
      updateData.subscriptionType = body.subscriptionType;
      if (!body.subscriptionExpiresAt) {
        const [plan] = await db.select().from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.type, body.subscriptionType)).limit(1);
        if (plan?.durationDays) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
          updateData.subscriptionExpiresAt = expiresAt;
        } else {
          updateData.subscriptionExpiresAt = null;
        }
      }
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = body.subscriptionExpiresAt ? new Date(body.subscriptionExpiresAt) : null;
    }
    if ("phone" in body) updateData.phone = body.phone ?? null;

    const [user] = await db.update(usersTable).set(updateData)
      .where(eq(usersTable.id, id)).returning();

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
      ipAddress: user.ipAddress,
      ipAddress2: user.ipAddress2,
      isActive: user.isActive,
      phone: user.phone ?? null,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to update user" });
  }
});

router.delete("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    await db.delete(visitLogsTable).where(eq(visitLogsTable.userId, id));
    await db.delete(usersTable).where(eq(usersTable.id, id));
    if (user) await logActivity(null, "admin", "user_deleted", `Deleted user: ${user.username} (${user.email})`);
    res.json({ message: "User deleted successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to delete user" });
  }
});

router.post("/admin/users/:id/block", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ message: "User not found" }); return; }
    const newStatus = !existing.isActive;
    const [user] = await db.update(usersTable).set({ isActive: newStatus }).where(eq(usersTable.id, id)).returning();
    await logActivity(id, existing.username, newStatus ? "user_unblocked" : "user_blocked", `Admin ${newStatus ? "unblocked" : "blocked"} user: ${existing.username}`);
    res.json({ id: user.id, isActive: user.isActive });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to block/unblock user" });
  }
});

router.delete("/admin/users/:id/subscription", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [user] = await db.update(usersTable)
      .set({ subscriptionType: "demo", subscriptionExpiresAt: null, accountType: "normal" })
      .where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ message: "User not found" }); return; }
    await logActivity(id, user.username, "subscription_deleted", `Subscription reset to demo for: ${user.username}`);
    res.json({ message: "Subscription deleted" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete subscription" });
  }
});

router.get("/admin/subscriptions", adminAuth, async (_req, res) => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.subscriptionExpiresAt));
    const result = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      accountType: u.accountType,
      subscriptionType: u.subscriptionType,
      subscriptionExpiresAt: u.subscriptionExpiresAt?.toISOString() || null,
      isActive: u.isActive,
      isExpired: u.subscriptionExpiresAt ? u.subscriptionExpiresAt < now : false,
      isExpiringSoon: u.subscriptionExpiresAt ? (u.subscriptionExpiresAt >= now && u.subscriptionExpiresAt <= soon) : false,
    }));
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch subscriptions" });
  }
});

router.get("/admin/activity-logs", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await db.select().from(activityLogsTable).orderBy(desc(activityLogsTable.createdAt)).limit(limit);
    res.json(logs.map(l => ({
      id: l.id,
      userId: l.userId,
      username: l.username,
      action: l.action,
      details: l.details,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch logs" });
  }
});

router.post("/admin/users/:id/reset-ip", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(usersTable).set({ ipAddress: null, ipAddress2: null })
      .where(eq(usersTable.id, id));
    res.json({ message: "IP address reset successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to reset IP" });
  }
});

router.get("/admin/videos", adminAuth, async (_req, res) => {
  try {
    const videos = await db.select({
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
      sortOrder: videosTable.sortOrder,
      driveParts: videosTable.driveParts,
      softwareLink: videosTable.softwareLink,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .orderBy(asc(videosTable.sortOrder), asc(videosTable.createdAt));

    res.json(videos.map(v => ({
      ...v,
      categoryName: v.categoryName || "",
      driveParts: v.driveParts ?? null,
      softwareLink: v.softwareLink ?? null,
      createdAt: v.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch videos" });
  }
});

router.post("/admin/videos/reorder", adminAuth, async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; sortOrder: number }[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "items required" });
      return;
    }
    await Promise.all(
      items.map(({ id, sortOrder }) =>
        db.update(videosTable).set({ sortOrder }).where(eq(videosTable.id, id))
      )
    );
    res.json({ message: "Reordered successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to reorder" });
  }
});

router.post("/admin/videos", adminAuth, async (req, res) => {
  try {
    const body = CreateVideoBody.parse(req.body);
    const accessType = body.accessType ?? (body.isVipOnly ? "vip" : "normal");
    const [video] = await db.insert(videosTable).values({
      title: body.title,
      description: body.description,
      thumbnailUrl: body.thumbnailUrl,
      driveEmbedUrl: body.driveEmbedUrl,
      categoryId: body.categoryId,
      isVipOnly: accessType === "vip",
      accessType,
      isVisible: body.isVisible ?? true,
      playlistId: body.playlistId ?? null,
      partNumber: body.partNumber ?? null,
      softwareLink: body.softwareLink ?? null,
      driveParts: body.driveParts ?? null,
    }).returning();

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, video.categoryId)).limit(1);

    res.status(201).json({
      id: video.id, title: video.title, description: video.description,
      thumbnailUrl: video.thumbnailUrl, driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId, categoryName: cat?.name || "",
      playlistId: video.playlistId, partNumber: video.partNumber,
      isVipOnly: video.isVipOnly, accessType: video.accessType,
      isVisible: video.isVisible, softwareLink: video.softwareLink ?? null,
      driveParts: video.driveParts ?? null,
      createdAt: video.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to create video" });
  }
});

router.patch("/admin/videos/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateVideoBody.parse(req.body);

    const updateData: Partial<Record<string, unknown>> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.thumbnailUrl !== undefined) updateData.thumbnailUrl = body.thumbnailUrl;
    if (body.driveEmbedUrl !== undefined) updateData.driveEmbedUrl = body.driveEmbedUrl;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
    if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;
    if (body.accessType !== undefined) {
      updateData.accessType = body.accessType;
      updateData.isVipOnly = body.accessType === "vip";
    } else if (body.isVipOnly !== undefined) {
      updateData.isVipOnly = body.isVipOnly;
    }
    if ("playlistId" in body) updateData.playlistId = body.playlistId ?? null;
    if ("partNumber" in body) updateData.partNumber = body.partNumber ?? null;
    if ("softwareLink" in body) updateData.softwareLink = body.softwareLink ?? null;
    if ("driveParts" in body) updateData.driveParts = body.driveParts ?? null;

    const [video] = await db.update(videosTable).set(updateData)
      .where(eq(videosTable.id, id)).returning();

    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, video.categoryId)).limit(1);

    res.json({
      id: video.id, title: video.title, description: video.description,
      thumbnailUrl: video.thumbnailUrl, driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId, categoryName: cat?.name || "",
      playlistId: video.playlistId, partNumber: video.partNumber,
      isVipOnly: video.isVipOnly, accessType: video.accessType,
      isVisible: video.isVisible, softwareLink: video.softwareLink ?? null,
      driveParts: video.driveParts ?? null,
      createdAt: video.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to update video" });
  }
});

router.delete("/admin/videos/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(videosTable).where(eq(videosTable.id, id));
    res.json({ message: "Video deleted successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to delete video" });
  }
});

router.get("/admin/categories", adminAuth, async (_req, res) => {
  try {
    const categories = await db.select().from(categoriesTable);
    res.json(categories);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch categories" });
  }
});

router.post("/admin/categories", adminAuth, async (req, res) => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    const [category] = await db.insert(categoriesTable).values({
      name: body.name,
      slug: body.slug,
      icon: body.icon ?? null,
    }).returning();

    res.status(201).json(category);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to create category" });
  }
});

router.patch("/admin/categories/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateCategoryBody.parse(req.body);

    const updateData: Partial<Record<string, unknown>> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.icon !== undefined) updateData.icon = body.icon;

    const [category] = await db.update(categoriesTable).set(updateData)
      .where(eq(categoriesTable.id, id)).returning();

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    res.json(category);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to update category" });
  }
});

router.delete("/admin/categories/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    res.json({ message: "Category deleted successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to delete category" });
  }
});

router.get("/admin/playlists", adminAuth, async (_req, res) => {
  try {
    const rows = await db.select({ playlist: playlistsTable, categoryName: categoriesTable.name })
      .from(playlistsTable)
      .leftJoin(categoriesTable, eq(playlistsTable.categoryId, categoriesTable.id))
      .orderBy(desc(playlistsTable.createdAt));
    const allVideos = await db.select().from(videosTable);
    res.json(rows.map(({ playlist, categoryName }) => ({
      id: playlist.id, title: playlist.title, description: playlist.description,
      categoryId: playlist.categoryId, categoryName: categoryName ?? "",
      sortOrder: playlist.sortOrder, isVisible: playlist.isVisible,
      createdAt: playlist.createdAt.toISOString(),
      videos: allVideos
        .filter(v => v.playlistId === playlist.id)
        .sort((a, b) => (a.partNumber ?? 999) - (b.partNumber ?? 999))
        .map(v => ({ id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl, driveEmbedUrl: v.driveEmbedUrl, partNumber: v.partNumber, accessType: v.accessType, isVisible: v.isVisible, createdAt: v.createdAt.toISOString() })),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlists" });
  }
});

router.post("/admin/playlists", adminAuth, async (req, res) => {
  try {
    const { title, description, categoryId, sortOrder, isVisible } = req.body;
    const [playlist] = await db.insert(playlistsTable).values({
      title, description: description ?? "", categoryId: Number(categoryId),
      sortOrder: sortOrder ?? 0, isVisible: isVisible ?? true,
    }).returning();
    res.status(201).json({ id: playlist.id, title: playlist.title, description: playlist.description, categoryId: playlist.categoryId, categoryName: "", sortOrder: playlist.sortOrder, isVisible: playlist.isVisible, createdAt: playlist.createdAt.toISOString(), videos: [] });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create playlist" });
  }
});

router.patch("/admin/playlists/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, categoryId, sortOrder, isVisible } = req.body;
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (categoryId !== undefined) updateData.categoryId = Number(categoryId);
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isVisible !== undefined) updateData.isVisible = isVisible;
    const [playlist] = await db.update(playlistsTable).set(updateData).where(eq(playlistsTable.id, id)).returning();
    if (!playlist) { res.status(404).json({ message: "Playlist not found" }); return; }
    res.json({ id: playlist.id, title: playlist.title, description: playlist.description, categoryId: playlist.categoryId, categoryName: "", sortOrder: playlist.sortOrder, isVisible: playlist.isVisible, createdAt: playlist.createdAt.toISOString(), videos: [] });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update playlist" });
  }
});

router.delete("/admin/playlists/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(videosTable).set({ playlistId: null, partNumber: null }).where(eq(videosTable.playlistId, id));
    await db.delete(playlistsTable).where(eq(playlistsTable.id, id));
    res.json({ message: "Playlist deleted successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete playlist" });
  }
});

router.get("/admin/subscription-plans", adminAuth, async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable);
    res.json(plans);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch plans" });
  }
});

router.post("/admin/subscription-plans", adminAuth, async (req, res) => {
  try {
    const body = CreateSubscriptionPlanBody.parse(req.body);
    const [plan] = await db.insert(subscriptionPlansTable).values({
      type: body.type,
      price: body.price,
      description: body.description ?? "",
      durationDays: body.durationDays ?? null,
      isHidden: body.isHidden ?? false,
    }).returning();
    res.status(201).json(plan);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create plan" });
  }
});

router.delete("/admin/subscription-plans/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id));
    res.json({ message: "Plan deleted successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to delete plan" });
  }
});

router.patch("/admin/subscription-plans/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateSubscriptionPlanBody.parse(req.body);

    const updateData: Partial<Record<string, unknown>> = {};
    if (body.price !== undefined) updateData.price = body.price;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.durationDays !== undefined) updateData.durationDays = body.durationDays;
    if (body.isHidden !== undefined) updateData.isHidden = body.isHidden;

    const [plan] = await db.update(subscriptionPlansTable).set(updateData)
      .where(eq(subscriptionPlansTable.id, id)).returning();

    if (!plan) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }

    res.json(plan);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to update plan" });
  }
});

router.post("/admin/upload-thumbnail", adminAuth, upload.single("thumbnail"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }
  const url = `/uploads/${req.file!.filename}`;
  res.json({ url });
});

export default router;
