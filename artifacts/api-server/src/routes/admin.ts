import path from "path";
import fs from "fs";
import { Router, type IRouter } from "express";
import multer from "multer";
import { db, usersTable, videosTable, categoriesTable, playlistsTable, subscriptionPlansTable, visitLogsTable, activityLogsTable, notificationsTable, notificationRecipientsTable } from "@workspace/db";
import { eq, sql, count, desc, asc, lt, and, gte, isNotNull, inArray } from "drizzle-orm";

import { adminAuth } from "../middlewares/auth";
import { effectiveIpState } from "../lib/ipPolicy";
import { hashPassword, comparePassword } from "../lib/auth";
import { adminsTable } from "@workspace/db";
import { createNotification, type AudienceType, type TargetType } from "../lib/notifications";
import * as zod from "zod";
import {
  UpdateAdminUserBody,
  CreateVideoBody,
  UpdateVideoBody,
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateSubscriptionPlanBody,
  SendAdminNotificationBody,
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
    res.json(users.map(u => {
      const ip = effectiveIpState(u);
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        accountType: u.accountType,
        subscriptionType: u.subscriptionType,
        subscriptionExpiresAt: u.subscriptionExpiresAt?.toISOString() || null,
        ipAddress: ip.ipAddress,
        ipAddress2: ip.ipAddress2,
        ipFirstSeenAt: ip.ipFirstSeenAt?.toISOString() || null,
        ipCount: ip.ipCount,
        isActive: u.isActive,
        phone: u.phone ?? null,
        createdAt: u.createdAt.toISOString(),
      };
    }));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch users" });
  }
});

router.patch("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateAdminUserBody.parse(req.body);

    const updateData: Partial<Record<string, unknown>> = {};
    if (body.accountType !== undefined) {
      updateData.accountType = body.accountType;
      // Changing account type resets IP tracking: non-VIP must have no IP
      // recorded, and a VIP starts a fresh 24h window on next access.
      updateData.ipAddress = null;
      updateData.ipAddress2 = null;
      updateData.ipFirstSeenAt = null;
    }
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

    const ip = effectiveIpState(user);
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
      ipAddress: ip.ipAddress,
      ipAddress2: ip.ipAddress2,
      ipFirstSeenAt: ip.ipFirstSeenAt?.toISOString() || null,
      ipCount: ip.ipCount,
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
    const logs = await db
      .select({
        id: activityLogsTable.id,
        userId: activityLogsTable.userId,
        username: activityLogsTable.username,
        action: activityLogsTable.action,
        details: activityLogsTable.details,
        ipAddress: activityLogsTable.ipAddress,
        deviceType: activityLogsTable.deviceType,
        videoId: activityLogsTable.videoId,
        videoTitle: activityLogsTable.videoTitle,
        createdAt: activityLogsTable.createdAt,
        email: usersTable.email,
        phone: usersTable.phone,
      })
      .from(activityLogsTable)
      .leftJoin(usersTable, eq(activityLogsTable.userId, usersTable.id))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit);
    res.json(logs.map(l => ({
      id: l.id,
      userId: l.userId,
      username: l.username,
      email: l.email ?? null,
      phone: l.phone ?? null,
      action: l.action,
      details: l.details,
      ipAddress: l.ipAddress,
      deviceType: l.deviceType ?? null,
      videoId: l.videoId ?? null,
      videoTitle: l.videoTitle ?? null,
      createdAt: l.createdAt.toISOString(),
    })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch logs" });
  }
});

const AdminResetPasswordBody = zod.object({
  newPassword: zod.string().min(6),
});

router.post("/admin/users/:id/reset-password", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = AdminResetPasswordBody.parse(req.body);
    const newHash = await hashPassword(body.newPassword);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, id));
    await logActivity(null, req.admin!.username, "admin_reset_password", `تم إعادة تعيين كلمة مرور المستخدم #${id}`);
    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "فشل تغيير كلمة المرور" });
  }
});

router.post("/admin/users/:id/reset-ip", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(usersTable).set({ ipAddress: null, ipAddress2: null, ipFirstSeenAt: null })
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
    const categories = await db.select().from(categoriesTable)
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));
    const counts = await db
      .select({ categoryId: videosTable.categoryId, c: count() })
      .from(videosTable)
      .groupBy(videosTable.categoryId);
    const countMap = new Map(counts.map(r => [r.categoryId, Number(r.c)]));
    res.json(categories.map(cat => ({ ...cat, lessonCount: countMap.get(cat.id) ?? 0 })));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch categories" });
  }
});

router.post("/admin/categories/reorder", adminAuth, async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; sortOrder: number }[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "items required" });
      return;
    }
    const seen = new Set<number>();
    for (const it of items) {
      if (
        !it ||
        !Number.isInteger(it.id) || it.id <= 0 ||
        !Number.isInteger(it.sortOrder) || it.sortOrder < 0
      ) {
        res.status(400).json({ message: "invalid items: id and sortOrder must be valid integers" });
        return;
      }
      if (seen.has(it.id)) {
        res.status(400).json({ message: "duplicate category id in items" });
        return;
      }
      seen.add(it.id);
    }
    await db.transaction(async (tx) => {
      const now = new Date();
      for (const { id, sortOrder } of items) {
        await tx.update(categoriesTable).set({ sortOrder, updatedAt: now }).where(eq(categoriesTable.id, id));
      }
    });
    res.json({ message: "Reordered successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to reorder" });
  }
});

router.post("/admin/categories", adminAuth, async (req, res) => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${categoriesTable.sortOrder}), -1)` })
      .from(categoriesTable);
    const [category] = await db.insert(categoriesTable).values({
      name: body.name,
      nameEn: body.nameEn ?? null,
      slug: body.slug,
      icon: body.icon ?? null,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      accentColor: body.accentColor ?? null,
      sortOrder: body.sortOrder ?? Number(maxOrder) + 1,
      isVisible: body.isVisible ?? true,
      isFeatured: body.isFeatured ?? false,
      showOnHomepage: body.showOnHomepage ?? true,
    }).returning();

    res.status(201).json({ ...category, lessonCount: 0 });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to create category" });
  }
});

router.patch("/admin/categories/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateCategoryBody.parse(req.body);

    const updateData: Partial<Record<string, unknown>> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if ("nameEn" in body) updateData.nameEn = body.nameEn ?? null;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if ("icon" in body) updateData.icon = body.icon ?? null;
    if ("description" in body) updateData.description = body.description ?? null;
    if ("imageUrl" in body) updateData.imageUrl = body.imageUrl ?? null;
    if ("accentColor" in body) updateData.accentColor = body.accentColor ?? null;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
    if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured;
    if (body.showOnHomepage !== undefined) updateData.showOnHomepage = body.showOnHomepage;

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
    const [{ c }] = await db.select({ c: count() }).from(videosTable).where(eq(videosTable.categoryId, id));
    if (Number(c) > 0) {
      res.status(409).json({ message: `لا يمكن حذف هذا القسم لأنه يحتوي على ${Number(c)} درس. انقل الدروس إلى قسم آخر أو احذفها أولاً.` });
      return;
    }
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

const AdminChangePasswordBody = zod.object({
  currentPassword: zod.string(),
  newPassword: zod.string().min(6),
});

router.post("/admin/change-password", adminAuth, async (req, res) => {
  try {
    const body = AdminChangePasswordBody.parse(req.body);
    const [admin] = await db.select().from(adminsTable)
      .where(eq(adminsTable.id, req.admin!.id)).limit(1);

    const valid = await comparePassword(body.currentPassword, admin.passwordHash);
    if (!valid) {
      res.status(400).json({ message: "كلمة المرور الحالية غير صحيحة" });
      return;
    }

    const newHash = await hashPassword(body.newPassword);
    await db.update(adminsTable).set({ passwordHash: newHash })
      .where(eq(adminsTable.id, req.admin!.id));

    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "فشل تغيير كلمة المرور" });
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

// POST /admin/notifications/send — broadcast to an audience.
router.post("/admin/notifications/send", adminAuth, async (req, res) => {
  try {
    const parsed = SendAdminNotificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات الإشعار غير صالحة" });
      return;
    }
    const { title, body, audienceType, audienceValue, targetType, targetId, targetPath } =
      parsed.data;

    if ((audienceType === "user" || audienceType === "category") && !audienceValue?.trim()) {
      res.status(400).json({ message: "يجب تحديد الجمهور المستهدف" });
      return;
    }

    // Deep links must be INTERNAL app-relative paths. Reject schemes,
    // protocol-relative URLs, and backslashes so a notification click can never
    // be turned into an open-redirect to an external site.
    const trimmedPath = targetPath?.trim() || null;
    if (
      trimmedPath !== null &&
      (!trimmedPath.startsWith("/") ||
        trimmedPath.startsWith("//") ||
        trimmedPath.includes("\\") ||
        trimmedPath.includes("://") ||
        /\s/.test(trimmedPath))
    ) {
      res.status(400).json({ message: "مسار الوجهة غير صالح" });
      return;
    }

    const result = await createNotification({
      type: "admin_broadcast",
      title: title.trim(),
      body: body.trim(),
      adminId: req.admin!.id,
      audienceType: audienceType as AudienceType,
      audienceValue: audienceValue ?? null,
      targetType: (targetType as TargetType) ?? "none",
      targetId: targetId ?? null,
      targetPath: trimmedPath,
    });

    res.status(201).json({ id: result.notificationId, recipientCount: result.recipientCount });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "فشل إرسال الإشعار" });
  }
});

// GET /admin/notifications — activity log with reached/opened counts.
router.get("/admin/notifications", adminAuth, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: notificationsTable.id,
        type: notificationsTable.type,
        title: notificationsTable.title,
        body: notificationsTable.body,
        audienceType: notificationsTable.audienceType,
        audienceValue: notificationsTable.audienceValue,
        targetType: notificationsTable.targetType,
        targetPath: notificationsTable.targetPath,
        recipientCount: notificationsTable.recipientCount,
        createdAt: notificationsTable.createdAt,
        adminUsername: adminsTable.username,
        actorUsername: usersTable.username,
        openedCount: sql<number>`(
          SELECT COUNT(*) FROM ${notificationRecipientsTable}
          WHERE ${notificationRecipientsTable.notificationId} = ${notificationsTable.id}
            AND ${notificationRecipientsTable.readAt} IS NOT NULL
        )`,
      })
      .from(notificationsTable)
      .leftJoin(adminsTable, eq(notificationsTable.adminId, adminsTable.id))
      .leftJoin(usersTable, eq(notificationsTable.actorUserId, usersTable.id))
      .orderBy(desc(notificationsTable.id))
      .limit(200);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        audienceType: r.audienceType ?? null,
        audienceValue: r.audienceValue ?? null,
        targetType: r.targetType,
        targetPath: r.targetPath ?? null,
        senderName: r.adminUsername ?? r.actorUsername ?? null,
        recipientCount: r.recipientCount,
        openedCount: Number(r.openedCount ?? 0),
        createdAt: (r.createdAt as Date).toISOString(),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "فشل تحميل سجل الإشعارات" });
  }
});

export default router;
