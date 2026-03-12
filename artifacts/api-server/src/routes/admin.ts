import { Router, type IRouter } from "express";
import { db, usersTable, videosTable, categoriesTable, subscriptionPlansTable, visitLogsTable } from "@workspace/db";
import { eq, sql, count, desc } from "drizzle-orm";
import { adminAuth } from "../middlewares/auth";
import {
  UpdateAdminUserBody,
  CreateVideoBody,
  UpdateVideoBody,
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateSubscriptionPlanBody,
} from "@workspace/api-zod";

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
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch stats" });
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
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch users" });
  }
});

router.patch("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateAdminUserBody.parse(req.body);

    const updateData: any = {};
    if (body.accountType !== undefined) updateData.accountType = body.accountType;
    if (body.subscriptionType !== undefined) updateData.subscriptionType = body.subscriptionType;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = body.subscriptionExpiresAt ? new Date(body.subscriptionExpiresAt) : null;
    }

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
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to update user" });
  }
});

router.delete("/admin/users/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ message: "User deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete user" });
  }
});

router.post("/admin/users/:id/reset-ip", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(usersTable).set({ ipAddress: null })
      .where(eq(usersTable.id, id));
    res.json({ message: "IP address reset successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to reset IP" });
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
      isVipOnly: videosTable.isVipOnly,
      isVisible: videosTable.isVisible,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
    .orderBy(desc(videosTable.createdAt));

    res.json(videos.map(v => ({
      ...v,
      categoryName: v.categoryName || "",
      createdAt: v.createdAt.toISOString(),
    })));
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch videos" });
  }
});

router.post("/admin/videos", adminAuth, async (req, res) => {
  try {
    const body = CreateVideoBody.parse(req.body);
    const [video] = await db.insert(videosTable).values({
      title: body.title,
      description: body.description,
      thumbnailUrl: body.thumbnailUrl,
      driveEmbedUrl: body.driveEmbedUrl,
      categoryId: body.categoryId,
      isVipOnly: body.isVipOnly ?? false,
      isVisible: body.isVisible ?? true,
    }).returning();

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, video.categoryId)).limit(1);

    res.status(201).json({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId,
      categoryName: cat?.name || "",
      isVipOnly: video.isVipOnly,
      isVisible: video.isVisible,
      createdAt: video.createdAt.toISOString(),
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to create video" });
  }
});

router.patch("/admin/videos/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateVideoBody.parse(req.body);

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.thumbnailUrl !== undefined) updateData.thumbnailUrl = body.thumbnailUrl;
    if (body.driveEmbedUrl !== undefined) updateData.driveEmbedUrl = body.driveEmbedUrl;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
    if (body.isVipOnly !== undefined) updateData.isVipOnly = body.isVipOnly;
    if (body.isVisible !== undefined) updateData.isVisible = body.isVisible;

    const [video] = await db.update(videosTable).set(updateData)
      .where(eq(videosTable.id, id)).returning();

    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, video.categoryId)).limit(1);

    res.json({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId,
      categoryName: cat?.name || "",
      isVipOnly: video.isVipOnly,
      isVisible: video.isVisible,
      createdAt: video.createdAt.toISOString(),
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to update video" });
  }
});

router.delete("/admin/videos/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(videosTable).where(eq(videosTable.id, id));
    res.json({ message: "Video deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete video" });
  }
});

router.get("/admin/categories", adminAuth, async (_req, res) => {
  try {
    const categories = await db.select().from(categoriesTable);
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch categories" });
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
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to create category" });
  }
});

router.patch("/admin/categories/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateCategoryBody.parse(req.body);

    const updateData: any = {};
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
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to update category" });
  }
});

router.delete("/admin/categories/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    res.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete category" });
  }
});

router.get("/admin/subscription-plans", adminAuth, async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable);
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch plans" });
  }
});

router.patch("/admin/subscription-plans/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateSubscriptionPlanBody.parse(req.body);

    const updateData: any = {};
    if (body.price !== undefined) updateData.price = body.price;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.durationDays !== undefined) updateData.durationDays = body.durationDays;

    const [plan] = await db.update(subscriptionPlansTable).set(updateData)
      .where(eq(subscriptionPlansTable.id, id)).returning();

    if (!plan) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }

    res.json(plan);
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to update plan" });
  }
});

export default router;
