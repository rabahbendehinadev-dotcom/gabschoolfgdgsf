import path from "path";
import fs from "fs";
import { Router, type IRouter } from "express";
import multer from "multer";
import { db, usersTable, videosTable, categoriesTable, playlistsTable, subscriptionPlansTable, visitLogsTable, activityLogsTable, notificationsTable, notificationRecipientsTable, pushSubscriptionsTable, adminPushSubscriptionsTable, communityPostsTable, communityCommentsTable, communityReportsTable, userCoursesTable } from "@workspace/db";
import { eq, sql, count, desc, asc, lt, and, gte, isNull, isNotNull, inArray, max, ilike, or } from "drizzle-orm";

import { adminAuth } from "../middlewares/auth";
import { effectiveIpState } from "../lib/ipPolicy";
import { hashPassword, comparePassword } from "../lib/auth";
import { adminsTable } from "@workspace/db";
import { createNotification, type AudienceType, type TargetType } from "../lib/notifications";
import { sendPushToUsers, getVapidPublicKey } from "../lib/webPush";
import { sendPushToAdmins } from "../lib/adminWebPush";
import { normalizePhone, INVALID_PHONE_MESSAGE } from "../lib/phone";
import { extractDriveFileId, isFolderDriveUrl, resolveVideoParts } from "../lib/googleDrive";
import {
  buildVideoObjectPath,
  copyDriveFileToStorage,
  deleteVideoObjects,
  parseObjectParts,
  type ObjectPart,
} from "../lib/videoStorage";
import { normalizeHlsPartsInput, deleteHlsObjects, invalidateRenderedPlaylists } from "../lib/hlsStorage";
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

router.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const notifFilter = req.query.notifications;
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

    // A user is "enabled" iff they have at least one push subscription that
    // hasn't been pruned for delivery failures — the only proof we can reach
    // them, independent of the per-device permission they last reported.
    const activeSubs = await db
      .selectDistinct({ userId: pushSubscriptionsTable.userId })
      .from(pushSubscriptionsTable)
      .where(isNull(pushSubscriptionsTable.failedAt));
    const enabledIds = new Set(activeSubs.map((s) => s.userId));

    // Users who have ANY subscription row (active or already soft-failed). Lets us
    // tell "broken" (had a sub, all failed) apart from "missing/none" (no row).
    const anySubs = await db
      .selectDistinct({ userId: pushSubscriptionsTable.userId })
      .from(pushSubscriptionsTable);
    const hasAnySubIds = new Set(anySubs.map((s) => s.userId));

    // Last time each user actually received a notification (fan-out delivery).
    const lastDelivered = await db
      .select({
        userId: notificationRecipientsTable.userId,
        last: max(notificationRecipientsTable.deliveredAt),
      })
      .from(notificationRecipientsTable)
      .groupBy(notificationRecipientsTable.userId);
    const lastMap = new Map(lastDelivered.map((r) => [r.userId, r.last]));

    const mapped = users.map(u => {
      const ip = effectiveIpState(u);
      const last = lastMap.get(u.id) ?? null;
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
        pushEnabled: enabledIds.has(u.id),
        pushSupported: u.pushSupported,
        pushPermission: u.pushPermission,
        pushState: enabledIds.has(u.id)
          ? "enabled"
          : u.pushPermission === "denied"
            ? "denied"
            : hasAnySubIds.has(u.id)
              ? "broken"
              : u.pushPermission === "granted"
                ? "missing"
                : "none",
        lastNotifiedAt: last ? new Date(last).toISOString() : null,
        lastPushTestAt: u.lastPushTestAt ? u.lastPushTestAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      };
    });

    const filtered =
      notifFilter === "enabled"
        ? mapped.filter((u) => u.pushEnabled)
        : notifFilter === "disabled"
          ? mapped.filter((u) => !u.pushEnabled)
          : mapped;

    res.json(filtered);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch users" });
  }
});

// GET /admin/users/notification-stats — opt-in counts for the dashboard badge.
router.get("/admin/users/notification-stats", adminAuth, async (_req, res) => {
  try {
    const [totalRow] = await db.select({ c: count() }).from(usersTable);
    const activeSubs = await db
      .selectDistinct({ userId: pushSubscriptionsTable.userId })
      .from(pushSubscriptionsTable)
      .where(isNull(pushSubscriptionsTable.failedAt));
    const total = Number(totalRow?.c ?? 0);
    const enabled = activeSubs.length;
    res.json({ total, enabled, disabled: Math.max(total - enabled, 0) });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load notification stats" });
  }
});

// POST /admin/users/:id/test-push — send a one-off Web Push to a single user so
// an admin can confirm a device is genuinely reachable (locked screen included).
// Returns { attempted, success }: attempted=0 means no active subscription on
// file, success=0 with attempted>0 means the device(s) rejected delivery.
router.post("/admin/users/:id/test-push", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ message: "معرّف مستخدم غير صالح" });
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!user) {
      res.status(404).json({ message: "المستخدم غير موجود" });
      return;
    }
    const result = await sendPushToUsers(
      [id],
      {
        title: "إشعار تجريبي ✅",
        body: "هذا إشعار تجريبي من إدارة GAB للتأكد من وصول الإشعارات إلى جهازك.",
        url: "/notifications",
        tag: "admin-test-push",
      },
      // A targeted single-user test: a 403/400 here means THIS user's sub is
      // stale, not a global outage — prune it so the admin sees "broken".
      { pruneRejectedEvenIfAllFail: true },
    );
    await db.update(usersTable).set({ lastPushTestAt: new Date() }).where(eq(usersTable.id, id));
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to send test push" });
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
      if (!body.subscriptionStartedAt) {
        updateData.subscriptionStartedAt = new Date();
      }
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.subscriptionStartedAt !== undefined) {
      updateData.subscriptionStartedAt = body.subscriptionStartedAt ? new Date(body.subscriptionStartedAt) : null;
    }
    if (body.subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = body.subscriptionExpiresAt ? new Date(body.subscriptionExpiresAt) : null;
    }
    if ("phone" in body) {
      if (body.phone) {
        const normalizedPhone = normalizePhone(body.phone);
        if (!normalizedPhone) {
          res.status(400).json({ message: INVALID_PHONE_MESSAGE });
          return;
        }
        updateData.phone = normalizedPhone;
      } else {
        updateData.phone = null;
      }
    }

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

router.get("/admin/users/expired", adminAuth, async (_req, res) => {
  try {
    const now = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const users = await db.select().from(usersTable)
      .where(inArray(usersTable.subscriptionType, ["monthly", "annual"]))
      .orderBy(desc(usersTable.subscriptionExpiresAt));
    res.json(users.map(u => {
      const durationDays = u.subscriptionType === "annual" ? 365 : 30;

      // Derive effective dates: fill the missing one from the other
      let effectiveExpires: Date | null = null;
      let effectiveStarted: Date | null = null;
      let startDerived = false;
      let endDerived = false;

      if (u.subscriptionExpiresAt && u.subscriptionStartedAt) {
        effectiveExpires = u.subscriptionExpiresAt;
        effectiveStarted = u.subscriptionStartedAt;
      } else if (u.subscriptionExpiresAt) {
        effectiveExpires = u.subscriptionExpiresAt;
        effectiveStarted = new Date(effectiveExpires.getTime() - durationDays * MS_PER_DAY);
        startDerived = true;
      } else if (u.subscriptionStartedAt) {
        effectiveStarted = u.subscriptionStartedAt;
        effectiveExpires = new Date(effectiveStarted.getTime() + durationDays * MS_PER_DAY);
        endDerived = true;
      }
      // else both null → isMissingData = true

      const isMissingData = effectiveExpires === null;
      const isExpired = !isMissingData && effectiveExpires! < now;
      const daysLeft = effectiveExpires !== null
        ? Math.ceil((effectiveExpires.getTime() - now.getTime()) / MS_PER_DAY)
        : null;
      const daysSinceExpiry = isExpired && effectiveExpires !== null
        ? Math.floor((now.getTime() - effectiveExpires.getTime()) / MS_PER_DAY)
        : null;
      const soonThreshold = u.subscriptionType === "annual" ? 30 : 7;
      const isExpiringSoon = !isMissingData && !isExpired && daysLeft !== null && daysLeft <= soonThreshold;

      return {
        id: u.id,
        username: u.username,
        email: u.email,
        phone: u.phone ?? null,
        subscriptionType: u.subscriptionType,
        accountType: u.accountType,
        subscriptionStartedAt: effectiveStarted?.toISOString() ?? null,
        subscriptionExpiresAt: effectiveExpires?.toISOString() ?? null,
        startDerived,
        endDerived,
        driveRevokedAt: u.driveRevokedAt?.toISOString() ?? null,
        isMissingData,
        isExpired,
        isExpiringSoon,
        daysLeft,
        daysSinceExpiry,
      };
    }));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch expired users" });
  }
});

router.post("/admin/users/revoke-drive-all", adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const expired = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(and(
        inArray(usersTable.subscriptionType, ["monthly", "annual"]),
        isNotNull(usersTable.subscriptionExpiresAt),
        lt(usersTable.subscriptionExpiresAt, now),
        isNull(usersTable.driveRevokedAt),
      ));
    if (expired.length === 0) {
      res.json({ revoked: 0 });
      return;
    }
    const ids = expired.map(u => u.id);
    await db.update(usersTable).set({ driveRevokedAt: now }).where(inArray(usersTable.id, ids));
    const adminName = req.admin!.username;
    const names = expired.map(u => u.username).join(", ");
    await logActivity(null, adminName, "drive_revoke_all", `إزالة صلاحيات Google Drive لـ ${expired.length} مستخدم منتهي الاشتراك: ${names}`);
    res.json({ revoked: expired.length });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to revoke drive access" });
  }
});

router.post("/admin/users/:id/revoke-drive", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) { res.status(404).json({ message: "User not found" }); return; }
    const now = new Date();
    await db.update(usersTable).set({ driveRevokedAt: now }).where(eq(usersTable.id, id));
    await logActivity(id, user.username, "drive_revoke", `إزالة صلاحيات Google Drive للمستخدم: ${user.username} (${user.email}) — بواسطة ${req.admin!.username}`);
    res.json({ driveRevokedAt: now.toISOString() });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to revoke drive access" });
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

// GET /admin/users/:id/courses — list playlist IDs granted to a user
router.get("/admin/users/:id/courses", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select({ playlistId: userCoursesTable.playlistId })
      .from(userCoursesTable)
      .where(eq(userCoursesTable.userId, id));
    res.json(rows.map(r => r.playlistId));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// PUT /admin/users/:id/courses — replace the full set of granted courses
router.put("/admin/users/:id/courses", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const playlistIds: number[] = zod.array(zod.number()).parse(req.body);
    await db.delete(userCoursesTable).where(eq(userCoursesTable.userId, id));
    if (playlistIds.length > 0) {
      await db.insert(userCoursesTable).values(
        playlistIds.map(pid => ({ userId: id, playlistId: pid }))
      );
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/admin/videos", adminAuth, async (req, res) => {
  try {
    const playlistId = req.query.playlistId ? Number(req.query.playlistId) : undefined;

    // Build WHERE condition when filtering by course/playlist
    let whereCondition = undefined;
    if (playlistId) {
      // Get all categories explicitly linked to this playlist via linkedPlaylistId
      const linkedCats = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.linkedPlaylistId, playlistId));

      const catIds = linkedCats.map(c => c.id);

      whereCondition = or(
        // direct playlist_id link
        eq(videosTable.playlistId, playlistId),
        // via categories that belong to this course
        catIds.length > 0 ? inArray(videosTable.categoryId, catIds) : sql`false`,
      );
    }

    const baseQuery = db.select({
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
      migratedAt: videosTable.migratedAt,
      createdAt: videosTable.createdAt,
    })
    .from(videosTable)
    .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id));

    const videos = await (whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery
    ).orderBy(asc(videosTable.sortOrder), asc(videosTable.createdAt));

    res.json(videos.map(v => ({
      ...v,
      categoryName: v.categoryName || "",
      driveParts: v.driveParts ?? null,
      softwareLink: v.softwareLink ?? null,
      migratedAt: v.migratedAt ? v.migratedAt.toISOString() : null,
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

    // If the video source changed, the migrated App Storage copy AND the HLS
    // ladder are stale: clear both mappings (playback falls back to the Drive
    // proxy) and clean up the old objects best-effort. Admin can re-run the
    // migration/transcode afterwards.
    let staleObjectParts: ObjectPart[] | null = null;
    let staleHls = false;
    if (body.driveEmbedUrl !== undefined || "driveParts" in body) {
      const [existing] = await db
        .select({
          driveEmbedUrl: videosTable.driveEmbedUrl,
          driveParts: videosTable.driveParts,
          objectParts: videosTable.objectParts,
          hlsParts: videosTable.hlsParts,
        })
        .from(videosTable)
        .where(eq(videosTable.id, id))
        .limit(1);
      if (existing?.objectParts || existing?.hlsParts) {
        const sourceChanged =
          (body.driveEmbedUrl !== undefined && body.driveEmbedUrl !== existing.driveEmbedUrl) ||
          ("driveParts" in body && (body.driveParts ?? null) !== (existing.driveParts ?? null));
        if (sourceChanged) {
          staleObjectParts = parseObjectParts(existing.objectParts);
          updateData.objectParts = null;
          updateData.migratedAt = null;
          if (existing.hlsParts) {
            staleHls = true;
            updateData.hlsParts = null;
          }
        }
      }
    }

    const [video] = await db.update(videosTable).set(updateData)
      .where(eq(videosTable.id, id)).returning();

    if (staleObjectParts) void deleteVideoObjects(staleObjectParts);
    if (staleHls) void deleteHlsObjects(id);

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
    const [existing] = await db
      .select({ objectParts: videosTable.objectParts, hlsParts: videosTable.hlsParts })
      .from(videosTable)
      .where(eq(videosTable.id, id))
      .limit(1);
    await db.delete(videosTable).where(eq(videosTable.id, id));
    const parts = parseObjectParts(existing?.objectParts);
    if (parts) void deleteVideoObjects(parts);
    if (existing?.hlsParts) void deleteHlsObjects(id);
    res.json({ message: "Video deleted successfully" });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to delete video" });
  }
});

// One-time, synchronous Drive → App Storage copy for a single video. After
// this succeeds, playback switches to direct presigned GCS URLs (no server
// hop) which permanently fixes the buffering caused by proxying Drive bytes.
// Deliberately ONE video per request: copies are large and must finish within
// the request lifecycle (autoscale throttles background work).
router.post("/admin/videos/:id/migrate-storage", adminAuth, async (req, res) => {
  try {
    // Dev shares the production App Storage bucket AND overlapping video ids.
    // A dev-side migration would overwrite the exact objects production
    // playback depends on (videos/{id}/part-{i}.mp4). Production only.
    if (process.env.NODE_ENV !== "production") {
      res.status(403).json({
        message: "Migration is disabled in development (shared production bucket).",
      });
      return;
    }
    const id = Number(req.params.id);
    const [video] = await db
      .select({
        id: videosTable.id,
        title: videosTable.title,
        driveEmbedUrl: videosTable.driveEmbedUrl,
        driveParts: videosTable.driveParts,
        objectParts: videosTable.objectParts,
      })
      .from(videosTable)
      .where(eq(videosTable.id, id))
      .limit(1);

    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    if (video.objectParts) {
      res.status(409).json({ message: "Video already migrated" });
      return;
    }

    const partsList = resolveVideoParts({
      driveEmbedUrl: video.driveEmbedUrl,
      driveParts: video.driveParts,
    });
    if (partsList.length === 0) {
      res.status(400).json({ message: "Video has no playable parts" });
      return;
    }

    const copied: ObjectPart[] = [];
    let totalBytes = 0;
    try {
      for (let i = 0; i < partsList.length; i++) {
        const partUrl = partsList[i].url;
        const partLabel = `الجزء ${i + 1}/${partsList.length}`;
        console.info(`[video-storage] migrating part ${i + 1}/${partsList.length}`, { videoId: id, url: partUrl.slice(0, 80) });

        if (isFolderDriveUrl(partUrl)) {
          throw new Error(
            `${partLabel}: رابط مجلد Google Drive وليس ملف فيديو — لا يمكن نقل مجلد.\n` +
            `الرابط الخاطئ: ${partUrl}\n` +
            `الحل: افتح المجلد → اختر ملف الفيديو → انسخ رابط الملف (file/d/...) وحدّث الفيديو.`,
          );
        }
        const fileId = extractDriveFileId(partUrl);
        if (!fileId) {
          throw new Error(
            `${partLabel}: لم يتم التعرف على صيغة رابط Google Drive.\nالرابط: ${partUrl}`,
          );
        }
        const destPath = buildVideoObjectPath(id, i);
        const result = await copyDriveFileToStorage(fileId, destPath);
        if (result.bytes === 0) {
          throw new Error(`${partLabel}: نُسِخت 0 بايت من Drive — الملف فارغ أو محجوب.`);
        }
        copied.push({ label: partsList[i].label, objectPath: result.objectPath });
        totalBytes += result.bytes;
        console.info(`[video-storage] part ${i + 1}/${partsList.length} done`, {
          videoId: id, bytes: result.bytes,
        });

        // Throttle: wait 1 s between parts to avoid hitting Google Drive rate limits.
        // Skipped after the last part.
        if (i < partsList.length - 1) {
          await new Promise(r => setTimeout(r, 1_000));
        }
      }
    } catch (copyErr) {
      // Roll back any partial copies so we never store a half-migrated state.
      // Guard: skip deletion if a concurrent migration already claimed the row
      // (paths are deterministic, so we would be deleting the winner's files).
      if (copied.length > 0) {
        const [current] = await db
          .select({ objectParts: videosTable.objectParts })
          .from(videosTable)
          .where(eq(videosTable.id, id))
          .limit(1);
        if (!current?.objectParts) void deleteVideoObjects(copied);
      }
      // Drive 404/403/429 → 422 (fixable by admin) instead of 500
      const driveErr = copyErr as Error & { driveStatus?: number; isRateLimit?: boolean };
      const driveStatus = driveErr.driveStatus;
      if (driveStatus === 404 || driveStatus === 403 || driveStatus === 429) {
        res.status(422).json({
          message: driveErr.message ?? "Drive error",
          isRateLimit: driveErr.isRateLimit ?? false,
          driveStatus,
        });
        return;
      }
      throw copyErr;
    }

    // Conditional update closes the dual-admin race: only the first migration
    // claims the row; a concurrent one gets 0 rows and returns 409.
    const updated = await db
      .update(videosTable)
      .set({ objectParts: JSON.stringify(copied), migratedAt: new Date() })
      .where(and(eq(videosTable.id, id), isNull(videosTable.objectParts)))
      .returning({ id: videosTable.id });

    if (updated.length === 0) {
      // A concurrent migration already claimed the row. Do NOT delete: object
      // paths are deterministic per video, so "our" copies are the same paths
      // the winner recorded — deleting them would break the winner's playback.
      res.status(409).json({ message: "Video already migrated" });
      return;
    }

    console.info("[video-storage] migrated video to App Storage", {
      videoId: id,
      parts: copied.length,
      totalBytes,
    });
    res.json({
      message: "Video migrated to App Storage",
      parts: copied.length,
      totalBytes,
    });
  } catch (error: unknown) {
    console.error("[video-storage] migration failed", {
      videoId: req.params.id,
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to migrate video" });
  }
});

// Record the HLS ladder metadata for a video after its parts were transcoded
// and uploaded to App Storage (done by an offline batch script — transcoding
// is far too CPU-heavy for the autoscale request lifecycle). Only lightweight
// rendition metadata is stored; the per-segment detail lives in the skeleton
// playlists next to the segments in App Storage. Passing null clears the flag
// (playback falls back to MP4).
router.put("/admin/videos/:id/hls-parts", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid video id" });
      return;
    }
    const body = req.body as { hlsParts?: unknown };

    let normalized: string | null = null;
    if (body.hlsParts !== null && body.hlsParts !== undefined) {
      normalized = normalizeHlsPartsInput(body.hlsParts);
      if (!normalized) {
        res.status(400).json({
          message:
            "Invalid hlsParts payload: expected [{ renditions: [{ name, width, height, bandwidth, codecs? }] }, ...]",
        });
        return;
      }
    }

    const updated = await db
      .update(videosTable)
      .set({ hlsParts: normalized })
      .where(eq(videosTable.id, id))
      .returning({ id: videosTable.id });

    if (updated.length === 0) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    invalidateRenderedPlaylists(id);
    console.info("[video-hls] hls-parts updated", { videoId: id, cleared: !normalized });
    res.json({ message: normalized ? "HLS parts recorded" : "HLS parts cleared" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to update HLS parts",
    });
  }
});

router.get("/admin/categories", adminAuth, async (req, res) => {
  try {
    const playlistId = req.query.playlistId ? Number(req.query.playlistId) : undefined;

    let whereCondition = undefined;
    if (playlistId) {
      // Only return categories that explicitly belong to this course via linkedPlaylistId
      whereCondition = eq(categoriesTable.linkedPlaylistId, playlistId);
    }

    const categories = await db.select().from(categoriesTable)
      .where(whereCondition)
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
      linkedPlaylistId: body.linkedPlaylistId ?? null,
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
    if ("linkedPlaylistId" in body) updateData.linkedPlaylistId = body.linkedPlaylistId ?? null;

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

    // Also load all categories so we can find which ones are linked to each playlist
    const allCategories = await db.select({ id: categoriesTable.id, linkedPlaylistId: categoriesTable.linkedPlaylistId }).from(categoriesTable);

    res.json(rows.map(({ playlist, categoryName }) => {
      // Category IDs that belong to this playlist:
      // 1. The playlist's own categoryId (old architecture)
      // 2. Any category with linkedPlaylistId = playlist.id (new architecture)
      const catIds = new Set<number>();
      if (playlist.categoryId) catIds.add(playlist.categoryId);
      for (const cat of allCategories) {
        if (cat.linkedPlaylistId === playlist.id) catIds.add(cat.id);
      }

      const playlistVideos = allVideos
        .filter(v => v.playlistId === playlist.id || catIds.has(v.categoryId))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.partNumber ?? 999) - (b.partNumber ?? 999));

      return {
        id: playlist.id, title: playlist.title, description: playlist.description,
        imageUrl: playlist.imageUrl ?? null,
        categoryId: playlist.categoryId, categoryName: categoryName ?? "",
        sortOrder: playlist.sortOrder, isVisible: playlist.isVisible,
        createdAt: playlist.createdAt.toISOString(),
        videos: playlistVideos.map(v => ({
          id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl,
          driveEmbedUrl: v.driveEmbedUrl, partNumber: v.partNumber,
          accessType: v.accessType, isVisible: v.isVisible,
          createdAt: v.createdAt.toISOString(),
        })),
      };
    }));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch playlists" });
  }
});

router.post("/admin/playlists", adminAuth, async (req, res) => {
  try {
    const { title, description, imageUrl, categoryId, sortOrder, isVisible } = req.body;
    const [playlist] = await db.insert(playlistsTable).values({
      title, description: description ?? "", imageUrl: imageUrl ?? null,
      categoryId: categoryId ? Number(categoryId) : null, sortOrder: sortOrder ?? 0, isVisible: isVisible ?? true,
    }).returning();
    res.status(201).json({ id: playlist.id, title: playlist.title, description: playlist.description, imageUrl: playlist.imageUrl ?? null, categoryId: playlist.categoryId ?? null, categoryName: "", sortOrder: playlist.sortOrder, isVisible: playlist.isVisible, createdAt: playlist.createdAt.toISOString(), videos: [] });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create playlist" });
  }
});

router.patch("/admin/playlists/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, imageUrl, categoryId, sortOrder, isVisible } = req.body;
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (categoryId !== undefined) updateData.categoryId = Number(categoryId);
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isVisible !== undefined) updateData.isVisible = isVisible;
    const [playlist] = await db.update(playlistsTable).set(updateData).where(eq(playlistsTable.id, id)).returning();
    if (!playlist) { res.status(404).json({ message: "Playlist not found" }); return; }
    res.json({ id: playlist.id, title: playlist.title, description: playlist.description, imageUrl: playlist.imageUrl ?? null, categoryId: playlist.categoryId, categoryName: "", sortOrder: playlist.sortOrder, isVisible: playlist.isVisible, createdAt: playlist.createdAt.toISOString(), videos: [] });
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

// ── Admin push-notification subscription management ──────────────────────────
// Admins subscribe their own devices to receive push alerts (new registrations,
// etc.) without needing a user account.

// GET /api/admin/push/vapid-key — public VAPID key for PushManager.subscribe()
router.get("/admin/push/vapid-key", adminAuth, (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) { res.status(503).json({ message: "Push notifications not configured on server" }); return; }
  res.json({ publicKey: key });
});

// GET /api/admin/push/status — is THIS admin device subscribed?
router.get("/admin/push/status", adminAuth, async (req, res) => {
  try {
    const adminId = req.admin!.id;
    const subs = await db
      .select({ id: adminPushSubscriptionsTable.id })
      .from(adminPushSubscriptionsTable)
      .where(and(eq(adminPushSubscriptionsTable.adminId, adminId), isNull(adminPushSubscriptionsTable.failedAt)));
    res.json({ subscribed: subs.length > 0 });
  } catch { res.status(500).json({ message: "Failed to check status" }); }
});

// POST /api/admin/push/subscribe — save (or refresh) an admin device subscription
router.post("/admin/push/subscribe", adminAuth, async (req, res) => {
  try {
    const { endpoint, p256dh, auth } = req.body as { endpoint?: string; p256dh?: string; auth?: string };
    if (!endpoint || !p256dh || !auth) { res.status(400).json({ message: "Invalid subscription payload" }); return; }
    const adminId = req.admin!.id;
    await db.insert(adminPushSubscriptionsTable)
      .values({ adminId, endpoint, p256dh, auth, userAgent: req.headers["user-agent"] ?? null })
      .onConflictDoUpdate({
        target: adminPushSubscriptionsTable.endpoint,
        set: { adminId, p256dh, auth, failedAt: null, userAgent: req.headers["user-agent"] ?? null },
      });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: "Failed to save subscription" }); }
});

// DELETE /api/admin/push/subscribe — remove an admin device subscription
router.delete("/admin/push/subscribe", adminAuth, async (req, res) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) { res.status(400).json({ message: "Missing endpoint" }); return; }
    await db.delete(adminPushSubscriptionsTable).where(eq(adminPushSubscriptionsTable.endpoint, endpoint));
    res.json({ ok: true });
  } catch { res.status(500).json({ message: "Failed to remove subscription" }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Community Moderation Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /admin/community/posts?search=&page=&limit=
router.get("/admin/community/posts", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const whereClause = search
      ? or(
          ilike(communityPostsTable.content, `%${search}%`),
          ilike(usersTable.username, `%${search}%`),
          ilike(usersTable.email, `%${search}%`),
        )
      : undefined;

    const rows = await db
      .select({
        id: communityPostsTable.id,
        content: communityPostsTable.content,
        postType: communityPostsTable.postType,
        isVisible: communityPostsTable.isVisible,
        isHidden: communityPostsTable.isHidden,
        isPinned: communityPostsTable.isPinned,
        isFeatured: communityPostsTable.isFeatured,
        isVipLocked: communityPostsTable.isVipLocked,
        likesCount: communityPostsTable.likesCount,
        commentsCount: communityPostsTable.commentsCount,
        viewsCount: communityPostsTable.viewsCount,
        createdAt: communityPostsTable.createdAt,
        authorUserId: communityPostsTable.authorUserId,
        authorUsername: usersTable.username,
        authorEmail: usersTable.email,
        authorProfileImage: usersTable.profileImage,
      })
      .from(communityPostsTable)
      .leftJoin(usersTable, eq(communityPostsTable.authorUserId, usersTable.id))
      .where(whereClause)
      .orderBy(desc(communityPostsTable.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    res.json({
      posts: rows.slice(0, limit).map((p) => ({
        ...p,
        authorProfileImageUrl: p.authorProfileImage ? `/api/users/${p.authorUserId}/avatar` : null,
        createdAt: p.createdAt.toISOString(),
      })),
      hasMore,
      page,
      limit,
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to list community posts" });
  }
});

// PATCH /admin/community/posts/:id — moderate (hide/show/pin/unpin)
router.patch("/admin/community/posts/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isHidden, isPinned, isFeatured, isVipLocked } = req.body as {
      isHidden?: boolean;
      isPinned?: boolean;
      isFeatured?: boolean;
      isVipLocked?: boolean;
    };

    const [existing] = await db
      .select({ id: communityPostsTable.id, isHidden: communityPostsTable.isHidden, isPinned: communityPostsTable.isPinned })
      .from(communityPostsTable)
      .where(eq(communityPostsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ message: "Post not found" });
      return;
    }

    const updates: Record<string, boolean> = {};
    if (typeof isHidden === "boolean") updates.isHidden = isHidden;
    if (typeof isPinned === "boolean") updates.isPinned = isPinned;
    if (typeof isFeatured === "boolean") updates.isFeatured = isFeatured;
    if (typeof isVipLocked === "boolean") updates.isVipLocked = isVipLocked;

    await db.update(communityPostsTable).set(updates).where(eq(communityPostsTable.id, id));

    // Log admin action
    const adminName = req.admin?.username || "admin";
    const action = isHidden === true
      ? "community_post_hide"
      : isHidden === false
      ? "community_post_show"
      : isPinned === true
      ? "community_post_pin"
      : isPinned === false
      ? "community_post_unpin"
      : "community_post_update";
    await logActivity(null, adminName, action, `Post #${id}`);

    res.json({ message: "تم تحديث المنشور", id });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to update post" });
  }
});

// DELETE /admin/community/posts/:id — hard delete
router.delete("/admin/community/posts/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(communityPostsTable).where(eq(communityPostsTable.id, id));
    const adminName = req.admin?.username || "admin";
    await logActivity(null, adminName, "community_post_delete", `Post #${id} deleted by admin`);
    res.json({ message: "تم حذف المنشور" });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to delete post" });
  }
});

// DELETE /admin/community/comments/:id — hard delete
router.delete("/admin/community/comments/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(communityCommentsTable).where(eq(communityCommentsTable.id, id));
    const adminName = req.admin?.username || "admin";
    await logActivity(null, adminName, "community_comment_delete", `Comment #${id} deleted by admin`);
    res.json({ message: "تم حذف التعليق" });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to delete comment" });
  }
});

// GET /admin/community/reports
router.get("/admin/community/reports", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const status = typeof req.query.status === "string" ? req.query.status : "pending";

    const rows = await db
      .select({
        id: communityReportsTable.id,
        postId: communityReportsTable.postId,
        commentId: communityReportsTable.commentId,
        reason: communityReportsTable.reason,
        status: communityReportsTable.status,
        createdAt: communityReportsTable.createdAt,
        reporterUsername: usersTable.username,
        reporterEmail: usersTable.email,
      })
      .from(communityReportsTable)
      .leftJoin(usersTable, eq(communityReportsTable.reporterId, usersTable.id))
      .where(eq(communityReportsTable.status, status))
      .orderBy(desc(communityReportsTable.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    res.json({
      reports: rows.slice(0, limit).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      hasMore,
      page,
      limit,
    });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to list reports" });
  }
});

// PATCH /admin/community/reports/:id — resolve or dismiss
router.patch("/admin/community/reports/:id", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body as { status: string };
    if (!["resolved", "dismissed"].includes(status)) {
      res.status(400).json({ message: "status يجب أن يكون resolved أو dismissed" });
      return;
    }
    await db.update(communityReportsTable).set({ status }).where(eq(communityReportsTable.id, id));
    res.json({ message: "تم تحديث التبليغ", id });
  } catch (err: unknown) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Failed to update report" });
  }
});

// POST /api/admin/push/test — send a test push to all subscribed admin devices
router.post("/admin/push/test", adminAuth, async (_req, res) => {
  try {
    const result = await sendPushToAdmins({
      title: "إشعار تجريبي للأدمن ✅",
      body: "الإشعارات تعمل بشكل صحيح على جهازك.",
      tag: "admin-self-test",
    });
    res.json(result);
  } catch { res.status(500).json({ message: "Failed to send test push" }); }
});

export default router;
