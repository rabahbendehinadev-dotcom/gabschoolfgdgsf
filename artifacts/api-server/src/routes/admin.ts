import path from "path";
import fs from "fs";
import { Router, type IRouter } from "express";
import multer from "multer";
import { db, usersTable, videosTable, categoriesTable, playlistsTable, subscriptionPlansTable, visitLogsTable, activityLogsTable, notificationsTable, notificationRecipientsTable, pushSubscriptionsTable, adminPushSubscriptionsTable, communityPostsTable, communityCommentsTable, communityReportsTable, userCoursesTable, paymentSubmissionsTable, planCoursesTable, courseAccessLogsTable, adminsTable, adminCoursePermissionsTable, r2VideoUploadsTable, trustedDevicesTable, userSecuritySessionsTable, securityEventsTable, securityWhitelistsTable } from "@workspace/db";
import { eq, sql, count, desc, asc, lt, and, gte, isNull, isNotNull, inArray, max, ilike, or } from "drizzle-orm";

import { adminAuth, securityManageAuth } from "../middlewares/auth";
import { hashPassword, comparePassword } from "../lib/auth";
import { createNotification, type AudienceType, type TargetType } from "../lib/notifications";
import { sendPushToUsers, getVapidPublicKey } from "../lib/webPush";
import { sendPushToAdmins } from "../lib/adminWebPush";
import { normalizePhone, INVALID_PHONE_MESSAGE } from "../lib/phone";
import { retiredDeviceCredentialHash, safeDeviceDto, safeSecurityUserDto } from "../lib/deviceSecurity";
import { extractDriveFileId, isFolderDriveUrl, resolveVideoParts } from "../lib/googleDrive";
import {
  buildVideoObjectPath,
  copyDriveFileToStorage,
  deleteVideoObjects,
  parseObjectParts,
  type ObjectPart,
} from "../lib/videoStorage";
import { normalizeHlsPartsInput, deleteHlsObjects, invalidateRenderedPlaylists } from "../lib/hlsStorage";
import { deleteLowCopiesBestEffort } from "../lib/driveTranscode";
import {
  abortR2MultipartVideoUpload,
  completeR2MultipartVideoUpload,
  deleteR2UploadedVideoObject,
  getPresignedR2UploadPartUrl,
  getCompletedR2VideoUpload,
  getR2VideoMetadata,
  initiateR2MultipartVideoUpload,
  isValidR2VideoObjectKey,
  verifyR2CommitReceipt,
  verifyR2UploadReceipt,
} from "../lib/r2Video";
import * as zod from "zod";
import {
  UpdateAdminUserBody,
  CreateVideoBody,
  UpdateVideoBody,
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateSubscriptionPlanBody,
  SendAdminNotificationBody,
  CreateToolBody,
  UpdateToolBody,
  InitiateR2VideoUploadBody,
  SignR2VideoUploadPartBody,
  CompleteR2VideoUploadBody,
  AbortR2VideoUploadBody,
  DiscardR2VideoUploadBody,
} from "@workspace/api-zod";
import { toolsTable, toolCategoriesTable } from "@workspace/db";
import { generateThumbnail, thumbPathToUrl } from "../lib/imageThumbnail";
import {
  deleteCommunityMediaForAuthor,
  deleteCommunityMediaForPosts,
} from "../lib/communityMediaCleanup";

const CreateSubscriptionPlanBody = zod.object({
  type: zod.string(),
  price: zod.string(),
  description: zod.string().optional(),
  durationDays: zod.number().optional().nullable(),
  isHidden: zod.boolean().optional().default(false),
});

interface AdminCtx { adminId?: number; adminName?: string; adminRole?: string }

function adminDisplayName(req: import("express").Request): string {
  return req.admin!.displayName ?? req.admin!.username;
}

async function hasAdminCoursePermission(
  adminId: number, role: string, playlistId: number, field: "canGrantAccess" | "canRemoveAccess" | "canViewUsers" | "canManageVideos" | "canManageCategories" = "canGrantAccess"
): Promise<boolean> {
  if (role === "super_admin") return true;
  const [perm] = await db.select().from(adminCoursePermissionsTable)
    .where(and(eq(adminCoursePermissionsTable.adminId, adminId), eq(adminCoursePermissionsTable.playlistId, playlistId)))
    .limit(1);
  if (!perm) return false;
  return perm[field] === true;
}

async function deleteR2ObjectIfUnreferenced(objectKey: string): Promise<void> {
  const [reference] = await db
    .select({ id: videosTable.id })
    .from(videosTable)
    .where(eq(videosTable.r2ObjectKey, objectKey))
    .limit(1);
  if (!reference) await deleteR2UploadedVideoObject(objectKey);
}

async function logActivity(
  userId: number | null,
  username: string | null,
  action: string,
  details?: string,
  ip?: string,
  adminCtx?: AdminCtx,
) {
  try {
    await db.insert(activityLogsTable).values({
      userId,
      username,
      action,
      details: details || null,
      ipAddress: ip || null,
      ...(adminCtx?.adminId != null ? { adminId: adminCtx.adminId } : {}),
      ...(adminCtx?.adminName ? { adminName: adminCtx.adminName } : {}),
      ...(adminCtx?.adminRole ? { adminRole: adminCtx.adminRole } : {}),
    } as any);
  } catch (_) { }
}

function adminCtxFrom(req: { admin?: { id: number; username: string; displayName: string | null; role: string } }): AdminCtx {
  return {
    adminId: req.admin?.id,
    adminName: req.admin?.displayName ?? req.admin?.username,
    adminRole: req.admin?.role,
  };
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
    // All independent queries run in parallel — was 8 sequential round-trips before.
    const [userAgg, videoStats, categoryStats, recentRegs] = await Promise.all([
      // Single query replaces 6 sequential COUNT queries.
      db.select({
        totalUsers:           count(),
        vipUsers:             sql<number>`COUNT(*) FILTER (WHERE ${usersTable.accountType} = 'vip')`,
        normalUsers:          sql<number>`COUNT(*) FILTER (WHERE ${usersTable.accountType} = 'normal')`,
        demoSubscriptions:    sql<number>`COUNT(*) FILTER (WHERE ${usersTable.subscriptionType} = 'demo')`,
        annualSubscriptions:  sql<number>`COUNT(*) FILTER (WHERE ${usersTable.subscriptionType} = 'annual')`,
        lifetimeSubscriptions:sql<number>`COUNT(*) FILTER (WHERE ${usersTable.subscriptionType} = 'lifetime')`,
      }).from(usersTable),

      db.select({ totalVideos: count() }).from(videosTable),
      db.select({ totalCategories: count() }).from(categoriesTable),

      db.select({
        date:  sql<string>`DATE(${usersTable.createdAt})::text`,
        count: count(),
      })
      .from(usersTable)
      .groupBy(sql`DATE(${usersTable.createdAt})`)
      .orderBy(desc(sql`DATE(${usersTable.createdAt})`))
      .limit(30),
    ]);

    const u = userAgg[0];
    res.json({
      totalUsers:            Number(u.totalUsers),
      totalVideos:           videoStats[0].totalVideos,
      totalCategories:       categoryStats[0].totalCategories,
      vipUsers:              Number(u.vipUsers),
      normalUsers:           Number(u.normalUsers),
      demoSubscriptions:     Number(u.demoSubscriptions),
      annualSubscriptions:   Number(u.annualSubscriptions),
      lifetimeSubscriptions: Number(u.lifetimeSubscriptions),
      recentRegistrations:   recentRegs.map(r => ({ date: r.date, count: Number(r.count) })),
      totalVisits:           0, // removed expensive full-scan COUNT; use activity_logs page instead
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch stats" });
  }
});

router.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const notifFilter = req.query.notifications as string | undefined;
    const search     = (req.query.search as string | undefined)?.trim();
    const pageParam  = parseInt(req.query.page  as string, 10);
    const limitParam = parseInt(req.query.limit as string, 10);
    const page  = isNaN(pageParam)  || pageParam  < 1   ? 1   : pageParam;
    const limit = isNaN(limitParam) || limitParam < 1   ? 100 : Math.min(limitParam, 500);
    const offset = (page - 1) * limit;

    // Build optional search condition
    const searchCond = search
      ? or(
          ilike(usersTable.email,    `%${search}%`),
          ilike(usersTable.username, `%${search}%`),
          ilike(usersTable.fullName, `%${search}%`),
          ilike(usersTable.phone,    `%${search}%`),
        )
      : undefined;

    // Total count for pagination metadata (needed only when client sends page param)
    const [users, totalRow] = await Promise.all([
      db.select().from(usersTable)
        .where(searchCond)
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ c: count() }).from(usersTable).where(searchCond),
    ]);

    const userIds = users.map(u => u.id);

    if (userIds.length === 0) {
      return res.json({ users: [], total: 0, page, limit, pages: 0 });
    }

    // All supporting queries run in parallel, scoped to only the returned user IDs.
    // Removed visit_logs GROUP BY query — was a full-table sequential scan with no index.
    const [pushRows, lastDelivered, deviceCounts, allUserCourses] = await Promise.all([
      // Single query replaces two separate push-subscription selects.
      db.select({
        userId:   pushSubscriptionsTable.userId,
        failedAt: pushSubscriptionsTable.failedAt,
      })
      .from(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.userId, userIds)),

      db.select({
        userId: notificationRecipientsTable.userId,
        last:   max(notificationRecipientsTable.deliveredAt),
      })
      .from(notificationRecipientsTable)
      .where(inArray(notificationRecipientsTable.userId, userIds))
      .groupBy(notificationRecipientsTable.userId),

      db.select({ userId: pushSubscriptionsTable.userId, cnt: count() })
        .from(pushSubscriptionsTable)
        .where(inArray(pushSubscriptionsTable.userId, userIds))
        .groupBy(pushSubscriptionsTable.userId),

      db.select({
        userId:     userCoursesTable.userId,
        playlistId: userCoursesTable.playlistId,
        title:      playlistsTable.title,
      })
      .from(userCoursesTable)
      .leftJoin(playlistsTable, eq(userCoursesTable.playlistId, playlistsTable.id))
      .where(inArray(userCoursesTable.userId, userIds)),
    ]);

    // Build lookup maps
    const enabledIds    = new Set(pushRows.filter(r => r.failedAt == null).map(r => r.userId));
    const hasAnySubIds  = new Set(pushRows.map(r => r.userId));
    const lastMap       = new Map(lastDelivered.map(r => [r.userId, r.last]));
    const deviceCountMap= new Map(deviceCounts.map(r => [r.userId, Number(r.cnt)]));
    const coursesByUser = new Map<number, { playlistId: number; title: string }[]>();
    for (const c of allUserCourses) {
      const arr = coursesByUser.get(c.userId) ?? [];
      arr.push({ playlistId: c.playlistId, title: c.title ?? `دورة #${c.playlistId}` });
      coursesByUser.set(c.userId, arr);
    }

    const mapped = users.map(u => {
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.fullName ?? null,
        accountType: u.accountType,
        communityRole:
          u.communityRole === "admin" || u.communityRole === "formateur"
            ? u.communityRole
            : "student",
        subscriptionType: u.subscriptionType,
        subscriptionExpiresAt:  u.subscriptionExpiresAt?.toISOString()  || null,
        subscriptionStartedAt:  u.subscriptionStartedAt?.toISOString()  || null,
        // Historical IP fields remain available for investigation only; they
        // are not device slots and never affect authorization.
        ipAddress: u.ipAddress,
        ipAddress2: u.ipAddress2,
        ipFirstSeenAt: u.ipFirstSeenAt?.toISOString() || null,
        isActive:     u.isActive,
        phone:        u.phone ?? null,
        pushEnabled:  enabledIds.has(u.id),
        pushSupported:u.pushSupported,
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
        lastNotifiedAt: (() => { const l = lastMap.get(u.id); return l ? new Date(l).toISOString() : null; })(),
        lastPushTestAt: u.lastPushTestAt ? u.lastPushTestAt.toISOString() : null,
        lastVisitAt:    null, // removed from list (use /admin/users/:id/detail for visit history)
        deviceCount:    deviceCountMap.get(u.id) ?? 0,
        courses:        coursesByUser.get(u.id) ?? [],
        createdAt:      u.createdAt.toISOString(),
      };
    });

    const filtered =
      notifFilter === "enabled"
        ? mapped.filter(u => u.pushEnabled)
        : notifFilter === "disabled"
          ? mapped.filter(u => !u.pushEnabled)
          : mapped;

    const total = Number(totalRow[0]?.c ?? 0);
    res.json({ users: filtered, total, page, limit, pages: Math.ceil(total / limit) });
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

// GET /admin/users/stats — rich stats for the user management dashboard.
router.get("/admin/users/stats", adminAuth, async (_req, res) => {
  try {
    const now  = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // All aggregation done in SQL — no more loading all users into Node.js memory.
    const [aggRow, courseCounts, playlists] = await Promise.all([
      db.select({
        total:       count(),
        vip:         sql<number>`COUNT(*) FILTER (WHERE ${usersTable.accountType} = 'vip' AND (${usersTable.subscriptionExpiresAt} IS NULL OR ${usersTable.subscriptionExpiresAt} > NOW()))`,
        expired:     sql<number>`COUNT(*) FILTER (WHERE ${usersTable.accountType} = 'vip' AND ${usersTable.subscriptionExpiresAt} IS NOT NULL AND ${usersTable.subscriptionExpiresAt} < NOW())`,
        expiringSoon:sql<number>`COUNT(*) FILTER (WHERE ${usersTable.accountType} = 'vip' AND ${usersTable.subscriptionExpiresAt} IS NOT NULL AND ${usersTable.subscriptionExpiresAt} >= NOW() AND ${usersTable.subscriptionExpiresAt} <= ${soon.toISOString()})`,
        nonVip:      sql<number>`COUNT(*) FILTER (WHERE ${usersTable.accountType} != 'vip')`,
        newUsers:    sql<number>`COUNT(*) FILTER (WHERE ${usersTable.createdAt} >= ${monthAgo.toISOString()})`,
        blocked:     sql<number>`COUNT(*) FILTER (WHERE ${usersTable.isActive} = false)`,
      }).from(usersTable),

      db.select({ playlistId: userCoursesTable.playlistId, cnt: count() })
        .from(userCoursesTable)
        .groupBy(userCoursesTable.playlistId),

      db.select({ id: playlistsTable.id, title: playlistsTable.title })
        .from(playlistsTable)
        .orderBy(asc(playlistsTable.sortOrder)),
    ]);

    const a = aggRow[0];
    const perCourse = playlists.map(p => ({
      playlistId: p.id,
      title:      p.title,
      count:      Number(courseCounts.find(c => c.playlistId === p.id)?.cnt ?? 0),
    }));

    res.json({
      total:        Number(a.total),
      vip:          Number(a.vip),
      expired:      Number(a.expired),
      expiringSoon: Number(a.expiringSoon),
      nonVip:       Number(a.nonVip),
      newUsers:     Number(a.newUsers),
      blocked:      Number(a.blocked),
      perCourse,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load user stats" });
  }
});

// POST /admin/users/bulk-action — apply an operation to multiple users at once.
const BulkActionBody = zod.object({
  action: zod.enum(["block", "unblock", "grant_course", "revoke_course", "grant_vip", "revoke_vip", "extend_subscription"]),
  userIds: zod.array(zod.number()).min(1).max(500),
  playlistId: zod.number().optional(),
  days: zod.number().min(1).max(3650).optional(),
});

router.post("/admin/users/bulk-action", adminAuth, async (req, res) => {
  try {
    const body = BulkActionBody.parse(req.body);
    const { action, userIds } = body;
    const adminName = req.admin!.username;

    if (action === "block") {
      await db.update(usersTable).set({ isActive: false }).where(inArray(usersTable.id, userIds));
      await logActivity(null, adminName, "bulk_block", `حظر ${userIds.length} مستخدم`, req.ip, adminCtxFrom(req));
    } else if (action === "unblock") {
      await db.update(usersTable).set({ isActive: true }).where(inArray(usersTable.id, userIds));
      await logActivity(null, adminName, "bulk_unblock", `رفع الحظر عن ${userIds.length} مستخدم`, req.ip, adminCtxFrom(req));
    } else if (action === "grant_course") {
      const pid = body.playlistId;
      if (!pid) { res.status(400).json({ message: "playlistId مطلوب" }); return; }
      const existing = await db.select({ userId: userCoursesTable.userId })
        .from(userCoursesTable)
        .where(and(inArray(userCoursesTable.userId, userIds), eq(userCoursesTable.playlistId, pid)));
      const existingIds = new Set(existing.map(r => r.userId));
      const toInsert = userIds.filter(uid => !existingIds.has(uid));
      if (toInsert.length > 0) {
        await db.insert(userCoursesTable).values(toInsert.map(uid => ({
          userId: uid, playlistId: pid, grantedBy: adminName, grantSource: "manual",
        })));
        await db.insert(courseAccessLogsTable).values(toInsert.map(uid => ({
          userId: uid, playlistId: pid, action: "grant",
          adminId: req.admin!.id, adminName, adminRole: req.admin!.role,
          grantSource: "manual",
          ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
        })));
      }
      await logActivity(null, adminName, "bulk_grant_course", `منح الدورة ${pid} لـ ${toInsert.length} مستخدم`);
    } else if (action === "revoke_course") {
      const pid = body.playlistId;
      if (!pid) { res.status(400).json({ message: "playlistId مطلوب" }); return; }
      await db.delete(userCoursesTable)
        .where(and(inArray(userCoursesTable.userId, userIds), eq(userCoursesTable.playlistId, pid)));
      await db.insert(courseAccessLogsTable).values(userIds.map(uid => ({
        userId: uid, playlistId: pid, action: "revoke",
        adminId: req.admin!.id, adminName, adminRole: req.admin!.role,
        grantSource: "manual",
        ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
      })));
      await logActivity(null, adminName, "bulk_revoke_course", `إلغاء الدورة ${pid} من ${userIds.length} مستخدم`);
    } else if (action === "grant_vip") {
      const days = body.days ?? 365;
      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await db.update(usersTable)
        .set({ accountType: "vip", subscriptionType: "annual", subscriptionExpiresAt: expires, subscriptionStartedAt: new Date() })
        .where(inArray(usersTable.id, userIds));
      await logActivity(null, adminName, "bulk_grant_vip", `منح VIP (${days} يوم) لـ ${userIds.length} مستخدم`);
    } else if (action === "revoke_vip") {
      await db.update(usersTable)
        .set({ accountType: "normal", subscriptionType: "demo", subscriptionExpiresAt: null })
        .where(inArray(usersTable.id, userIds));
      await logActivity(null, adminName, "bulk_revoke_vip", `إلغاء VIP من ${userIds.length} مستخدم`);
    } else if (action === "extend_subscription") {
      const days = body.days ?? 30;
      await db.execute(sql`
        UPDATE users
        SET subscription_expires_at = 
          CASE
            WHEN subscription_expires_at > NOW()
              THEN subscription_expires_at + (${days} || ' days')::INTERVAL
            ELSE NOW() + (${days} || ' days')::INTERVAL
          END
        WHERE id = ANY(${sql.raw(`ARRAY[${userIds.join(",")}]::integer[]`)})
      `);
      await logActivity(null, adminName, "bulk_extend_subscription", `تمديد الاشتراك ${days} يوم لـ ${userIds.length} مستخدم`);
    }

    res.json({ ok: true, affected: userIds.length });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "فشل تنفيذ العملية الجماعية" });
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
    if (body.communityRole !== undefined) updateData.communityRole = body.communityRole;
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

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      accountType: user.accountType,
      communityRole:
        user.communityRole === "admin" || user.communityRole === "formateur"
          ? user.communityRole
          : "student",
      subscriptionType: user.subscriptionType,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
      ipAddress: user.ipAddress,
      ipAddress2: user.ipAddress2,
      ipFirstSeenAt: user.ipFirstSeenAt?.toISOString() || null,
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
    await deleteCommunityMediaForAuthor(id);
    await db.delete(visitLogsTable).where(eq(visitLogsTable.userId, id));
    await db.delete(usersTable).where(eq(usersTable.id, id));
    if (user) await logActivity(null, req.admin!.username, "user_deleted",
      `حذف مستخدم: ${user.username} (${user.email})`,
      req.ip, adminCtxFrom(req));
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
    await logActivity(id, existing.username, newStatus ? "user_unblocked" : "user_blocked",
      `${req.admin!.displayName ?? req.admin!.username} ${newStatus ? "رفع الحظر عن" : "حظر"} المستخدم: ${existing.username}`,
      req.ip, adminCtxFrom(req));
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
    await logActivity(id, user.username, "subscription_deleted",
      `إلغاء اشتراك: ${user.username} — بواسطة ${req.admin!.displayName ?? req.admin!.username}`,
      req.ip, adminCtxFrom(req));
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

// PUT /admin/users/:id/courses — replace the full set of granted courses (legacy endpoint, use POST/DELETE for tracked ops)
router.put("/admin/users/:id/courses", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const adminName = adminDisplayName(req);
    const playlistIds: number[] = zod.array(zod.number()).parse(req.body);
    const existing = await db.select({ playlistId: userCoursesTable.playlistId })
      .from(userCoursesTable).where(eq(userCoursesTable.userId, id));
    const existingSet = new Set(existing.map(r => r.playlistId));
    const newSet = new Set(playlistIds);
    const toAdd = playlistIds.filter(p => !existingSet.has(p));
    const toRemove = [...existingSet].filter(p => !newSet.has(p));
    // Diff-based: only delete removed, only insert added — preserves grantedAt/grantedBy/grantSource for unchanged
    if (toRemove.length > 0) {
      await db.delete(userCoursesTable)
        .where(and(eq(userCoursesTable.userId, id), inArray(userCoursesTable.playlistId, toRemove)));
    }
    if (toAdd.length > 0) {
      await db.insert(userCoursesTable).values(
        toAdd.map(pid => ({ userId: id, playlistId: pid, grantedBy: adminName, adminId: req.admin!.id, adminRole: req.admin!.role, grantSource: "manual" }))
      );
    }
    if (toAdd.length > 0) {
      await db.insert(courseAccessLogsTable).values(toAdd.map(pid => ({
        userId: id, playlistId: pid, action: "grant",
        adminId: req.admin!.id, adminName, adminRole: req.admin!.role,
        grantSource: "manual", reason: "put_replace",
      })));
    }
    if (toRemove.length > 0) {
      await db.insert(courseAccessLogsTable).values(toRemove.map(pid => ({
        userId: id, playlistId: pid, action: "revoke",
        adminId: req.admin!.id, adminName, adminRole: req.admin!.role,
        grantSource: "manual", reason: "put_replace",
      })));
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST /admin/users/:id/grant-course — grant a single course with full tracking + permission check
const GrantCourseBody = zod.object({
  playlistId: zod.number(),
  reason: zod.string().optional(),
  expiresAt: zod.string().optional().nullable(),
});
router.post("/admin/users/:id/grant-course", adminAuth, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) { res.status(400).json({ message: "userId غير صالح" }); return; }
    const { playlistId, reason, expiresAt } = GrantCourseBody.parse(req.body);
    const adminName = adminDisplayName(req);
    const adminRole = req.admin!.role;
    const adminId = req.admin!.id;

    if (adminRole === "support") {
      res.status(403).json({ message: "ليس لديك صلاحية منح الدورات. دور Support لا يملك هذه الصلاحية." });
      return;
    }

    const allowed = await hasAdminCoursePermission(adminId, adminRole, playlistId, "canGrantAccess");
    if (!allowed) {
      res.status(403).json({ message: "ليس لديك صلاحية لمنح هذه الدورة. تواصل مع Super Admin لإضافة الصلاحية." });
      return;
    }

    const [user] = await db.select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ message: "المستخدم غير موجود" }); return; }

    const [playlist] = await db.select({ id: playlistsTable.id, title: playlistsTable.title })
      .from(playlistsTable).where(eq(playlistsTable.id, playlistId)).limit(1);
    if (!playlist) { res.status(404).json({ message: "الدورة غير موجودة" }); return; }

    const [existing] = await db.select({ id: userCoursesTable.id })
      .from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.playlistId, playlistId)))
      .limit(1);
    if (existing) { res.status(409).json({ message: "المستخدم يملك هذه الدورة بالفعل" }); return; }

    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
    await db.insert(userCoursesTable).values({
      userId, playlistId,
      grantedBy: adminName, adminId, adminRole,
      grantSource: "manual", reason: reason ?? null,
      expiresAt: expiresAtDate, status: "active",
    });
    await db.insert(courseAccessLogsTable).values({
      userId, playlistId, action: "grant",
      adminId, adminName, adminRole,
      grantSource: "manual", reason: reason ?? null,
      ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
      extraData: { userEmail: user.email, username: user.username, playlistTitle: playlist.title },
    });
    await logActivity(userId, adminName, "grant_course",
      `منح دورة "${playlist.title}" للمستخدم ${user.username} (${user.email}). السبب: ${reason ?? "—"}`,
      req.ip, adminCtxFrom(req));

    res.json({ ok: true, message: `تم منح دورة "${playlist.title}" للمستخدم ${user.username}` });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// DELETE /admin/users/:id/revoke-course/:playlistId — revoke a course with full tracking + permission check
router.delete("/admin/users/:id/revoke-course/:playlistId", adminAuth, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const playlistId = Number(req.params.playlistId);
    if (!Number.isFinite(userId) || !Number.isFinite(playlistId)) {
      res.status(400).json({ message: "معرّف غير صالح" }); return;
    }
    const adminName = adminDisplayName(req);
    const adminRole = req.admin!.role;
    const adminId = req.admin!.id;

    if (adminRole === "support") {
      res.status(403).json({ message: "ليس لديك صلاحية نزع الدورات. دور Support لا يملك هذه الصلاحية." });
      return;
    }

    const allowed = await hasAdminCoursePermission(adminId, adminRole, playlistId, "canRemoveAccess");
    if (!allowed) {
      res.status(403).json({ message: "ليس لديك صلاحية لنزع هذه الدورة. تواصل مع Super Admin." });
      return;
    }

    const [user] = await db.select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const [playlist] = await db.select({ id: playlistsTable.id, title: playlistsTable.title })
      .from(playlistsTable).where(eq(playlistsTable.id, playlistId)).limit(1);

    const deleted = await db.delete(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.playlistId, playlistId)))
      .returning({ id: userCoursesTable.id });

    if (deleted.length === 0) { res.status(404).json({ message: "لم يتم العثور على الصلاحية" }); return; }

    await db.insert(courseAccessLogsTable).values({
      userId, playlistId, action: "revoke",
      adminId, adminName, adminRole,
      grantSource: "manual",
      ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
      extraData: { userEmail: user?.email, username: user?.username, playlistTitle: playlist?.title },
    });
    await logActivity(userId, adminName, "revoke_course",
      `نزع دورة "${playlist?.title ?? playlistId}" من المستخدم ${user?.username ?? userId}`,
      req.ip, adminCtxFrom(req));

    res.json({ ok: true, message: `تم نزع الدورة من المستخدم ${user?.username ?? userId}` });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/course-access-logs — full audit trail
router.get("/admin/course-access-logs", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const playlistId = req.query.playlistId ? Number(req.query.playlistId) : null;

    const rows = await db.execute(sql`
      SELECT
        cal.id, cal.action, cal.admin_name, cal.admin_role, cal.grant_source,
        cal.reason, cal.ip, cal.created_at, cal.extra_data,
        u.username AS user_username, u.email AS user_email,
        p.title AS playlist_title
      FROM course_access_logs cal
      LEFT JOIN users u ON u.id = cal.user_id
      LEFT JOIN playlists p ON p.id = cal.playlist_id
      ${userId ? sql`WHERE cal.user_id = ${userId}` : playlistId ? sql`WHERE cal.playlist_id = ${playlistId}` : sql``}
      ORDER BY cal.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    res.json(rows.rows);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/course-access-report — identify potentially unauthorized grants
router.get("/admin/course-access-report", adminAuth, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        uc.id, uc.user_id, uc.playlist_id, uc.granted_at,
        uc.granted_by, uc.grant_source, uc.reason, uc.status,
        u.username, u.email, u.account_type, u.created_at AS user_created_at,
        p.title AS playlist_title,
        CASE
          WHEN uc.granted_by IS NULL AND uc.grant_source = 'manual' THEN 'legacy_no_tracking'
          WHEN uc.grant_source = 'migration' THEN 'auto_migration'
          ELSE 'tracked'
        END AS classification
      FROM user_courses uc
      JOIN users u ON u.id = uc.user_id
      LEFT JOIN playlists p ON p.id = uc.playlist_id
      ORDER BY uc.granted_at DESC
    `);
    const classified = (rows.rows as any[]).map(r => ({
      ...r,
      suspicious: r.classification === "legacy_no_tracking" || r.classification === "auto_migration",
    }));
    res.json({
      total: classified.length,
      suspicious: classified.filter(r => r.suspicious).length,
      tracked: classified.filter(r => !r.suspicious).length,
      rows: classified,
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/admins — list all admins (without password hashes)
router.get("/admin/admins", adminAuth, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, username, email, display_name, role, is_active, permissions, last_login_at, last_login_ip
      FROM admins ORDER BY id ASC
    `);
    res.json(rows.rows);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST /admin/admins — create a new admin (super_admin only)
const CreateAdminBody = zod.object({
  username: zod.string().min(3).max(50),
  email: zod.string().email().optional().nullable(),
  password: zod.string().min(8),
  displayName: zod.string().optional().nullable(),
  role: zod.enum(["super_admin", "subscription_manager", "support"]).default("support"),
  isActive: zod.boolean().optional().default(true),
  permissions: zod.array(zod.string()).optional().default([]),
});
router.post("/admin/admins", adminAuth, async (req, res) => {
  try {
    if (req.admin!.role !== "super_admin") {
      res.status(403).json({ message: "فقط Super Admin يمكنه إنشاء حسابات إدارية جديدة" });
      return;
    }
    const body = CreateAdminBody.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const [created] = await db.insert(adminsTable).values({
      username: body.username,
      email: body.email ?? null,
      passwordHash,
      displayName: body.displayName ?? null,
      role: body.role,
      isActive: body.isActive ?? true,
      permissions: JSON.stringify(body.permissions ?? []),
    } as any).returning({ id: adminsTable.id, username: adminsTable.username });
    await logActivity(null, req.admin!.username, "create_admin",
      `أنشأ حساب إداري جديد: ${body.username} (${body.email ?? "—"}) دور: ${body.role}`,
      undefined, adminCtxFrom(req));
    res.status(201).json({ ok: true, admin: created });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// PATCH /admin/admins/:id — update admin role, display name, email, active, permissions (super_admin only)
router.patch("/admin/admins/:id", adminAuth, async (req, res) => {
  try {
    if (req.admin!.role !== "super_admin") {
      res.status(403).json({ message: "فقط Super Admin يمكنه تعديل حسابات المسؤولين" });
      return;
    }
    const id = Number(req.params.id);
    const body = zod.object({
      role: zod.enum(["super_admin", "subscription_manager", "support"]).optional(),
      displayName: zod.string().optional().nullable(),
      email: zod.string().email().optional().nullable(),
      password: zod.string().min(8).optional(),
      isActive: zod.boolean().optional(),
      permissions: zod.array(zod.string()).optional(),
    }).parse(req.body);
    const updates: Record<string, unknown> = {};
    if (body.role !== undefined) updates.role = body.role;
    if (body.displayName !== undefined) updates.display_name = body.displayName ?? null;
    if (body.email !== undefined) updates.email = body.email ?? null;
    if (body.password) updates.password_hash = await hashPassword(body.password);
    if (body.isActive !== undefined) updates.is_active = body.isActive;
    if (body.permissions !== undefined) updates.permissions = JSON.stringify(body.permissions);
    if (Object.keys(updates).length > 0) {
      const setParts = Object.entries(updates).map(([k, v]) => sql`${sql.raw(k)} = ${v}`);
      await db.execute(sql`UPDATE admins SET ${sql.join(setParts, sql`, `)} WHERE id = ${id}`);
    }
    await logActivity(null, req.admin!.username, "update_admin",
      `تعديل حساب مسؤول #${id}: ${Object.keys(updates).join(", ")}`,
      undefined, adminCtxFrom(req));
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// DELETE /admin/admins/:id — delete admin account (super_admin only, cannot delete self)
router.delete("/admin/admins/:id", adminAuth, async (req, res) => {
  try {
    if (req.admin!.role !== "super_admin") {
      res.status(403).json({ message: "فقط Super Admin يمكنه حذف حسابات المسؤولين" });
      return;
    }
    const id = Number(req.params.id);
    if (id === req.admin!.id) {
      res.status(400).json({ message: "لا يمكنك حذف حسابك الخاص" });
      return;
    }
    const [deleted] = await db.delete(adminsTable).where(eq(adminsTable.id, id)).returning({ username: adminsTable.username });
    if (!deleted) { res.status(404).json({ message: "المسؤول غير موجود" }); return; }
    await logActivity(null, req.admin!.username, "delete_admin",
      `حذف حساب مسؤول: ${deleted.username}`,
      undefined, adminCtxFrom(req));
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/my-permissions/courses — returns which playlists this admin can manage (grant/revoke)
router.get("/admin/my-permissions/courses", adminAuth, async (req, res) => {
  try {
    if (req.admin!.role === "super_admin") {
      res.json({ all: true, playlistIds: [] });
      return;
    }
    const perms = await db.select({ playlistId: adminCoursePermissionsTable.playlistId })
      .from(adminCoursePermissionsTable)
      .where(and(
        eq(adminCoursePermissionsTable.adminId, req.admin!.id),
        eq(adminCoursePermissionsTable.canGrantAccess, true)
      ));
    res.json({ all: false, playlistIds: perms.map(p => p.playlistId) });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/admins/:id/course-permissions — list course permissions for an admin
router.get("/admin/admins/:id/course-permissions", adminAuth, async (req, res) => {
  try {
    const adminId = Number(req.params.id);
    const rows = await db.execute(sql`
      SELECT acp.id, acp.admin_id, acp.playlist_id, p.title AS playlist_title,
             acp.can_grant_access, acp.can_remove_access, acp.can_view_users,
             acp.can_manage_videos, acp.can_manage_categories, acp.created_at
      FROM admin_course_permissions acp
      LEFT JOIN playlists p ON p.id = acp.playlist_id
      WHERE acp.admin_id = ${adminId}
      ORDER BY acp.created_at DESC
    `);
    res.json(rows.rows);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST /admin/admins/:id/course-permissions — grant a course permission to an admin (super_admin only)
router.post("/admin/admins/:id/course-permissions", adminAuth, async (req, res) => {
  try {
    if (req.admin!.role !== "super_admin") {
      res.status(403).json({ message: "فقط Super Admin يمكنه تعيين صلاحيات الدورات للمسؤولين" });
      return;
    }
    const targetAdminId = Number(req.params.id);
    const { playlistId, canGrantAccess = true, canRemoveAccess = true, canViewUsers = true, canManageVideos = false, canManageCategories = false } = req.body;
    if (!playlistId) { res.status(400).json({ message: "playlistId مطلوب" }); return; }

    await db.execute(sql`
      INSERT INTO admin_course_permissions (admin_id, playlist_id, can_grant_access, can_remove_access, can_view_users, can_manage_videos, can_manage_categories, created_by)
      VALUES (${targetAdminId}, ${playlistId}, ${canGrantAccess}, ${canRemoveAccess}, ${canViewUsers}, ${canManageVideos}, ${canManageCategories}, ${req.admin!.id})
      ON CONFLICT (admin_id, playlist_id) DO UPDATE SET
        can_grant_access = EXCLUDED.can_grant_access,
        can_remove_access = EXCLUDED.can_remove_access,
        can_view_users = EXCLUDED.can_view_users,
        can_manage_videos = EXCLUDED.can_manage_videos,
        can_manage_categories = EXCLUDED.can_manage_categories
    `);
    await logActivity(null, adminDisplayName(req), "assign_course_permission",
      `أضاف صلاحية الدورة #${playlistId} للمسؤول #${targetAdminId}`, req.ip, adminCtxFrom(req));
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// DELETE /admin/admins/:id/course-permissions/:playlistId — remove a course permission (super_admin only)
router.delete("/admin/admins/:id/course-permissions/:playlistId", adminAuth, async (req, res) => {
  try {
    if (req.admin!.role !== "super_admin") {
      res.status(403).json({ message: "فقط Super Admin يمكنه إزالة صلاحيات الدورات" });
      return;
    }
    const targetAdminId = Number(req.params.id);
    const playlistId = Number(req.params.playlistId);
    await db.delete(adminCoursePermissionsTable)
      .where(and(eq(adminCoursePermissionsTable.adminId, targetAdminId), eq(adminCoursePermissionsTable.playlistId, playlistId)));
    await logActivity(null, adminDisplayName(req), "remove_course_permission",
      `أزال صلاحية الدورة #${playlistId} من المسؤول #${targetAdminId}`, req.ip, adminCtxFrom(req));
    res.json({ ok: true });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/admin-audit-log — admin-specific activity log
router.get("/admin/admin-audit-log", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const adminId = req.query.adminId ? Number(req.query.adminId) : null;
    const rows = await db.execute(sql`
      SELECT id, admin_id, admin_name, admin_role, action, details, ip_address, user_agent, created_at
      FROM activity_logs
      WHERE admin_id IS NOT NULL
        ${adminId ? sql`AND admin_id = ${adminId}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    res.json(rows.rows);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

// GET /admin/users/:id/detail — full user profile (courses, activity, devices, payments, visits).
router.get("/admin/users/:id/detail", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) { res.status(404).json({ message: "User not found" }); return; }

    const [
      coursesResult, activityResult, paymentsResult, devicesResult, visitsResult,
    ] = await Promise.allSettled([
      db.select({
        id: userCoursesTable.id,
        playlistId: userCoursesTable.playlistId,
        title: playlistsTable.title,
        grantedAt: userCoursesTable.grantedAt,
        grantedBy: userCoursesTable.grantedBy,
        grantSource: userCoursesTable.grantSource,
        reason: userCoursesTable.reason,
        expiresAt: userCoursesTable.expiresAt,
        status: userCoursesTable.status,
      }).from(userCoursesTable)
        .leftJoin(playlistsTable, eq(userCoursesTable.playlistId, playlistsTable.id))
        .where(eq(userCoursesTable.userId, id)),

      db.select({
        id: activityLogsTable.id,
        action: activityLogsTable.action,
        details: activityLogsTable.details,
        videoTitle: activityLogsTable.videoTitle,
        createdAt: activityLogsTable.createdAt,
      }).from(activityLogsTable)
        .where(and(isNotNull(activityLogsTable.userId), eq(activityLogsTable.userId, id)))
        .orderBy(desc(activityLogsTable.createdAt))
        .limit(30),

      db.select().from(paymentSubmissionsTable)
        .where(eq(paymentSubmissionsTable.userId, id))
        .orderBy(desc(paymentSubmissionsTable.createdAt)),

      db.select().from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.userId, id))
        .orderBy(desc(pushSubscriptionsTable.lastSeenAt)),

      db.select().from(visitLogsTable)
        .where(and(isNotNull(visitLogsTable.userId), eq(visitLogsTable.userId, id)))
        .orderBy(desc(visitLogsTable.visitedAt))
        .limit(20),
    ]);

    const courses       = coursesResult.status  === "fulfilled" ? coursesResult.value  : [];
    const recentActivity = activityResult.status === "fulfilled" ? activityResult.value : [];
    const payments      = paymentsResult.status  === "fulfilled" ? paymentsResult.value : [];
    const devices       = devicesResult.status   === "fulfilled" ? devicesResult.value  : [];
    const recentVisits  = visitsResult.status    === "fulfilled" ? visitsResult.value   : [];

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone ?? null,
      fullName: user.fullName ?? null,
      profileImage: user.profileImage ?? null,
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      subscriptionStartedAt: user.subscriptionStartedAt?.toISOString() ?? null,
      isActive: user.isActive,
      // Legacy values are historical/informational only, never a limit.
      ipAddress: user.ipAddress,
      ipAddress2: user.ipAddress2,
      createdAt: user.createdAt.toISOString(),
      pushPermission: user.pushPermission,
      pushSupported: user.pushSupported,
      courses: courses.map(c => ({
        id: c.id,
        playlistId: c.playlistId,
        title: c.title ?? `دورة #${c.playlistId}`,
        grantedAt: c.grantedAt?.toISOString() ?? null,
        grantedBy: c.grantedBy ?? null,
        adminId: (c as any).adminId ?? null,
        adminRole: (c as any).adminRole ?? null,
        grantSource: c.grantSource ?? null,
        reason: c.reason ?? null,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        status: c.status ?? null,
      })),
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        action: a.action,
        details: a.details ?? null,
        videoTitle: a.videoTitle ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      payments: payments.map(p => ({
        id: p.id,
        planType: p.planType,
        planPrice: p.planPrice,
        paymentMethod: p.paymentMethod,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
      devices: devices.map(d => ({
        id: d.id,
        userAgent: d.userAgent ?? null,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        failedAt: d.failedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      recentVisits: recentVisits.map(v => ({
        path: v.path ?? null,
        visitedAt: v.visitedAt.toISOString(),
        ip: v.ip ?? null,
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load user detail" });
  }
});

router.post("/admin/r2/uploads/initiate", adminAuth, async (req, res) => {
  try {
    const body = InitiateR2VideoUploadBody.parse(req.body);
    const allowed = await hasAdminCoursePermission(
      req.admin!.id,
      req.admin!.role,
      body.courseId,
      "canManageVideos",
    );
    if (!allowed) {
      res.status(403).json({ message: "Vous n'avez pas la permission de gérer les vidéos de ce cours" });
      return;
    }
    if (body.videoId) {
      const [video] = await db
        .select({
          playlistId: videosTable.playlistId,
          linkedPlaylistId: categoriesTable.linkedPlaylistId,
        })
        .from(videosTable)
        .leftJoin(categoriesTable, eq(videosTable.categoryId, categoriesTable.id))
        .where(eq(videosTable.id, body.videoId))
        .limit(1);
      if (!video || (video.playlistId ?? video.linkedPlaylistId) !== body.courseId) {
        res.status(400).json({ message: "La vidéo ne correspond pas au cours sélectionné" });
        return;
      }
    }
    const initiated = await initiateR2MultipartVideoUpload({
      ...body,
      adminId: req.admin!.id,
    });
    const payload = verifyR2UploadReceipt(initiated.receipt);
    try {
      await db.insert(r2VideoUploadsTable).values({
        id: payload.sessionId,
        objectKey: payload.objectKey,
        adminId: payload.adminId,
        courseId: payload.courseId,
        intendedVideoId: payload.videoId,
        fileName: body.fileName,
        fileSize: payload.fileSize,
        contentType: payload.contentType,
      });
    } catch (error) {
      await abortR2MultipartVideoUpload(initiated.receipt).catch(() => undefined);
      throw error;
    }
    res.json(initiated);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to initiate upload" });
  }
});

router.post("/admin/r2/uploads/part", adminAuth, async (req, res) => {
  try {
    const body = SignR2VideoUploadPartBody.parse(req.body);
    const payload = verifyR2UploadReceipt(body.receipt);
    const [session] = await db.select({ id: r2VideoUploadsTable.id })
      .from(r2VideoUploadsTable)
      .where(and(
        eq(r2VideoUploadsTable.id, payload.sessionId),
        eq(r2VideoUploadsTable.objectKey, payload.objectKey),
        eq(r2VideoUploadsTable.adminId, payload.adminId),
        eq(r2VideoUploadsTable.courseId, payload.courseId),
        eq(r2VideoUploadsTable.status, "initiated"),
      ))
      .limit(1);
    const allowed =
      Boolean(session) &&
      payload.adminId === req.admin!.id &&
      await hasAdminCoursePermission(req.admin!.id, req.admin!.role, payload.courseId, "canManageVideos");
    if (!allowed) {
      res.status(403).json({ message: "Upload receipt does not belong to this admin or course" });
      return;
    }
    const url = await getPresignedR2UploadPartUrl(body.receipt, body.partNumber);
    res.json({ url });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to sign upload part" });
  }
});

router.post("/admin/r2/uploads/complete", adminAuth, async (req, res) => {
  try {
    const body = CompleteR2VideoUploadBody.parse(req.body);
    const payload = verifyR2UploadReceipt(body.receipt);
    const allowed =
      payload.adminId === req.admin!.id &&
      await hasAdminCoursePermission(req.admin!.id, req.admin!.role, payload.courseId, "canManageVideos");
    if (!allowed) {
      res.status(403).json({ message: "Upload receipt does not belong to this admin or course" });
      return;
    }
    const [reserved] = await db.update(r2VideoUploadsTable)
      .set({ status: "completing" })
      .where(and(
        eq(r2VideoUploadsTable.id, payload.sessionId),
        eq(r2VideoUploadsTable.objectKey, payload.objectKey),
        eq(r2VideoUploadsTable.adminId, payload.adminId),
        eq(r2VideoUploadsTable.courseId, payload.courseId),
        eq(r2VideoUploadsTable.status, "initiated"),
      ))
      .returning({ id: r2VideoUploadsTable.id });
    if (!reserved) {
      const [current] = await db.select({ status: r2VideoUploadsTable.status })
        .from(r2VideoUploadsTable)
        .where(eq(r2VideoUploadsTable.id, payload.sessionId))
        .limit(1);
      if (current?.status === "completed" || current?.status === "completing") {
        try {
          const recovered = await getCompletedR2VideoUpload(body.receipt);
          if (current.status === "completing") {
            await db.update(r2VideoUploadsTable)
              .set({ status: "completed", completedAt: new Date() })
              .where(and(
                eq(r2VideoUploadsTable.id, payload.sessionId),
                eq(r2VideoUploadsTable.status, "completing"),
              ));
          }
          res.json(recovered);
          return;
        } catch {
          throw new Error("Upload completion is still in progress; retry shortly");
        }
      }
      throw new Error("Upload session is no longer completable");
    }
    let completed;
    try {
      completed = await completeR2MultipartVideoUpload(body.receipt, body.parts);
    } catch (error) {
      try {
        completed = await getCompletedR2VideoUpload(body.receipt);
      } catch {
        await db.update(r2VideoUploadsTable)
          .set({ status: "initiated" })
          .where(and(
            eq(r2VideoUploadsTable.id, payload.sessionId),
            eq(r2VideoUploadsTable.status, "completing"),
          ));
        throw error;
      }
    }
    await db.update(r2VideoUploadsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(
        eq(r2VideoUploadsTable.id, payload.sessionId),
        eq(r2VideoUploadsTable.status, "completing"),
      ));
    res.json(completed);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to complete upload" });
  }
});

router.post("/admin/r2/uploads/abort", adminAuth, async (req, res) => {
  try {
    const body = AbortR2VideoUploadBody.parse(req.body);
    const payload = verifyR2UploadReceipt(body.receipt);
    const [session] = await db.select({ id: r2VideoUploadsTable.id })
      .from(r2VideoUploadsTable)
      .where(and(
        eq(r2VideoUploadsTable.id, payload.sessionId),
        eq(r2VideoUploadsTable.objectKey, payload.objectKey),
        eq(r2VideoUploadsTable.adminId, payload.adminId),
        eq(r2VideoUploadsTable.courseId, payload.courseId),
        eq(r2VideoUploadsTable.status, "initiated"),
      ))
      .limit(1);
    const allowed =
      Boolean(session) &&
      payload.adminId === req.admin!.id &&
      await hasAdminCoursePermission(req.admin!.id, req.admin!.role, payload.courseId, "canManageVideos");
    if (!allowed) {
      res.status(403).json({ message: "Upload receipt does not belong to this admin or course" });
      return;
    }
    await abortR2MultipartVideoUpload(body.receipt);
    await db.update(r2VideoUploadsTable)
      .set({ status: "aborted" })
      .where(and(
        eq(r2VideoUploadsTable.id, payload.sessionId),
        eq(r2VideoUploadsTable.status, "initiated"),
      ));
    res.json({ message: "Upload aborted" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to abort upload" });
  }
});

router.post("/admin/r2/uploads/discard", adminAuth, async (req, res) => {
  try {
    const body = DiscardR2VideoUploadBody.parse(req.body);
    const payload = verifyR2CommitReceipt(body.commitReceipt);
    const allowed =
      payload.adminId === req.admin!.id &&
      await hasAdminCoursePermission(req.admin!.id, req.admin!.role, payload.courseId, "canManageVideos");
    if (!allowed) {
      res.status(403).json({ message: "Completion receipt does not belong to this admin or course" });
      return;
    }
    const [discarded] = await db.update(r2VideoUploadsTable)
      .set({ status: "discarding" })
      .where(and(
        eq(r2VideoUploadsTable.id, payload.sessionId),
        eq(r2VideoUploadsTable.objectKey, payload.objectKey),
        eq(r2VideoUploadsTable.adminId, payload.adminId),
        eq(r2VideoUploadsTable.status, "completed"),
      ))
      .returning({ id: r2VideoUploadsTable.id });
    if (!discarded) throw new Error("Completed upload is already attached or discarded");
    try {
      await deleteR2ObjectIfUnreferenced(payload.objectKey);
      await db.update(r2VideoUploadsTable)
        .set({ status: "discarded" })
        .where(eq(r2VideoUploadsTable.id, payload.sessionId));
    } catch (error) {
      await db.update(r2VideoUploadsTable)
        .set({ status: "completed" })
        .where(and(
          eq(r2VideoUploadsTable.id, payload.sessionId),
          eq(r2VideoUploadsTable.status, "discarding"),
        ));
      throw error;
    }
    res.json({ message: "Completed upload discarded" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to discard upload" });
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
      storageProvider: videosTable.storageProvider,
      r2ObjectKey: videosTable.r2ObjectKey,
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
      storageProvider: v.storageProvider === "r2" ? "r2" : "drive",
      r2ObjectKey: v.r2ObjectKey ?? null,
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
    const storageProvider = body.storageProvider ?? "drive";
    let commitReceipt: ReturnType<typeof verifyR2CommitReceipt> | null = null;
    if (storageProvider === "r2") {
      if (!body.r2ObjectKey || !isValidR2VideoObjectKey(body.r2ObjectKey)) {
        throw new Error("A valid completed R2 upload is required");
      }
      if (!body.r2UploadReceipt) throw new Error("R2 completion receipt is required");
      const receipt = verifyR2CommitReceipt(body.r2UploadReceipt);
      if (
        receipt.adminId !== req.admin!.id ||
        receipt.courseId !== body.playlistId ||
        receipt.videoId !== null ||
        receipt.objectKey !== body.r2ObjectKey
      ) {
        throw new Error("R2 completion receipt does not match this lesson");
      }
      const allowed = await hasAdminCoursePermission(
        req.admin!.id, req.admin!.role, receipt.courseId, "canManageVideos",
      );
      if (!allowed) throw new Error("You no longer have permission to attach this upload");
      await getR2VideoMetadata(body.r2ObjectKey);
      commitReceipt = receipt;
    }
    const [video] = await db.transaction(async tx => {
      if (commitReceipt) {
        const [reserved] = await tx.update(r2VideoUploadsTable)
          .set({ status: "attached", attachedAt: new Date() })
          .where(and(
            eq(r2VideoUploadsTable.id, commitReceipt.sessionId),
            eq(r2VideoUploadsTable.objectKey, commitReceipt.objectKey),
            eq(r2VideoUploadsTable.adminId, commitReceipt.adminId),
            eq(r2VideoUploadsTable.courseId, commitReceipt.courseId),
            eq(r2VideoUploadsTable.status, "completed"),
          ))
          .returning({ id: r2VideoUploadsTable.id });
        if (!reserved) throw new Error("Completion receipt has already been used");
      }
      const [created] = await tx.insert(videosTable).values({
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
        storageProvider,
        r2ObjectKey: storageProvider === "r2" ? body.r2ObjectKey : null,
      }).returning();
      if (commitReceipt) {
        await tx.update(r2VideoUploadsTable)
          .set({ attachedVideoId: created.id })
          .where(eq(r2VideoUploadsTable.id, commitReceipt.sessionId));
      }
      return [created];
    });

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, video.categoryId)).limit(1);
    const coursePlaylistId = video.playlistId ?? cat?.linkedPlaylistId ?? null;
    const [playlist] = coursePlaylistId
      ? await db
          .select({ title: playlistsTable.title })
          .from(playlistsTable)
          .where(eq(playlistsTable.id, coursePlaylistId))
          .limit(1)
      : [];
    if (video.isVisible) {
      const courseTitle = playlist?.title || cat?.name || "GAB School";
      try {
        await createNotification({
          type: "video",
          title: "🎬 درس جديد متوفر الآن",
          body: `${video.title}\nضمن دورة ${courseTitle}`,
          adminId: req.admin!.id,
          audienceType: coursePlaylistId
            ? "course"
            : video.accessType === "vip"
              ? "vip"
              : "all",
          audienceValue: coursePlaylistId ? String(coursePlaylistId) : null,
          targetType: "lesson",
          targetId: video.id,
          targetPath: `/videos/${video.id}`,
          metadata: {
            thumbnailUrl: video.thumbnailUrl,
            courseTitle,
            videoTitle: video.title,
          },
          dedupeKey: `video-${video.id}`,
        });
      } catch (notificationError) {
        console.error("[admin/videos] notification fan-out failed (non-fatal):", {
          videoId: video.id,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
        });
      }
    }

    res.status(201).json({
      id: video.id, title: video.title, description: video.description,
      thumbnailUrl: video.thumbnailUrl, driveEmbedUrl: video.driveEmbedUrl,
      categoryId: video.categoryId, categoryName: cat?.name || "",
      playlistId: video.playlistId, partNumber: video.partNumber,
      isVipOnly: video.isVipOnly, accessType: video.accessType,
      isVisible: video.isVisible, softwareLink: video.softwareLink ?? null,
      driveParts: video.driveParts ?? null,
      storageProvider: video.storageProvider === "r2" ? "r2" : "drive",
      r2ObjectKey: video.r2ObjectKey ?? null,
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
    let replacedR2ObjectKey: string | null = null;
    let commitReceipt: ReturnType<typeof verifyR2CommitReceipt> | null = null;
    if (body.storageProvider !== undefined || "r2ObjectKey" in body) {
      const [existingSource] = await db
        .select({
          storageProvider: videosTable.storageProvider,
          r2ObjectKey: videosTable.r2ObjectKey,
          playlistId: videosTable.playlistId,
        })
        .from(videosTable)
        .where(eq(videosTable.id, id))
        .limit(1);
      if (!existingSource) {
        res.status(404).json({ message: "Video not found" });
        return;
      }
      const storageProvider = body.storageProvider ?? existingSource.storageProvider;
      const r2ObjectKey = "r2ObjectKey" in body
        ? body.r2ObjectKey ?? null
        : existingSource.r2ObjectKey;
      if (storageProvider === "r2") {
        if (!r2ObjectKey || !isValidR2VideoObjectKey(r2ObjectKey)) {
          throw new Error("A valid completed R2 upload is required");
        }
        if (r2ObjectKey !== existingSource.r2ObjectKey) {
          if (!body.r2UploadReceipt) throw new Error("R2 completion receipt is required");
          const receipt = verifyR2CommitReceipt(body.r2UploadReceipt);
          const targetCourseId = body.playlistId ?? existingSource.playlistId;
          if (
            receipt.adminId !== req.admin!.id ||
            receipt.courseId !== targetCourseId ||
            receipt.videoId !== id ||
            receipt.objectKey !== r2ObjectKey
          ) {
            throw new Error("R2 completion receipt does not match this lesson");
          }
          const allowed = await hasAdminCoursePermission(
            req.admin!.id, req.admin!.role, receipt.courseId, "canManageVideos",
          );
          if (!allowed) throw new Error("You no longer have permission to attach this upload");
          commitReceipt = receipt;
        }
        await getR2VideoMetadata(r2ObjectKey);
      }
      if (
        existingSource.storageProvider === "r2" &&
        existingSource.r2ObjectKey &&
        (storageProvider !== "r2" || r2ObjectKey !== existingSource.r2ObjectKey)
      ) {
        replacedR2ObjectKey = existingSource.r2ObjectKey;
      }
      updateData.storageProvider = storageProvider;
      updateData.r2ObjectKey = storageProvider === "r2" ? r2ObjectKey : null;
    }
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

    // If the video source changed, the migrated App Storage copy, the HLS
    // ladder AND the 720p Drive copies are stale: clear all mappings (playback
    // is no longer used by Direct-only playback) and clean up old objects
    // best-effort. New Drive sources are never queued for transcoding.
    let staleObjectParts: ObjectPart[] | null = null;
    let staleHls = false;
    let staleLowParts: string | null = null;
    let driveSourceChanged = false;
    if (body.driveEmbedUrl !== undefined || "driveParts" in body) {
      const [existing] = await db
        .select({
          driveEmbedUrl: videosTable.driveEmbedUrl,
          driveParts: videosTable.driveParts,
          objectParts: videosTable.objectParts,
          hlsParts: videosTable.hlsParts,
          lowParts: videosTable.lowParts,
        })
        .from(videosTable)
        .where(eq(videosTable.id, id))
        .limit(1);
      if (existing) {
        const sourceChanged =
          (body.driveEmbedUrl !== undefined && body.driveEmbedUrl !== existing.driveEmbedUrl) ||
          ("driveParts" in body && (body.driveParts ?? null) !== (existing.driveParts ?? null));
        if (sourceChanged) {
          driveSourceChanged = true;
          if (existing.objectParts) {
            staleObjectParts = parseObjectParts(existing.objectParts);
            updateData.objectParts = null;
            updateData.migratedAt = null;
          }
          if (existing.hlsParts) {
            staleHls = true;
            updateData.hlsParts = null;
          }
          if (existing.lowParts) {
            staleLowParts = existing.lowParts;
            updateData.lowParts = null;
          }
          updateData.lowError = null;
        }
      }
    }

    const [video] = await db.transaction(async tx => {
      if (commitReceipt) {
        const [reserved] = await tx.update(r2VideoUploadsTable)
          .set({ status: "attached", attachedVideoId: id, attachedAt: new Date() })
          .where(and(
            eq(r2VideoUploadsTable.id, commitReceipt.sessionId),
            eq(r2VideoUploadsTable.objectKey, commitReceipt.objectKey),
            eq(r2VideoUploadsTable.adminId, commitReceipt.adminId),
            eq(r2VideoUploadsTable.courseId, commitReceipt.courseId),
            eq(r2VideoUploadsTable.status, "completed"),
          ))
          .returning({ id: r2VideoUploadsTable.id });
        if (!reserved) throw new Error("Completion receipt has already been used");
      }
      return tx.update(videosTable).set(updateData)
        .where(eq(videosTable.id, id)).returning();
    });

    if (staleObjectParts) void deleteVideoObjects(staleObjectParts);
    if (staleHls) void deleteHlsObjects(id);
    if (staleLowParts) deleteLowCopiesBestEffort(staleLowParts);
    if (replacedR2ObjectKey) {
      void deleteR2ObjectIfUnreferenced(replacedR2ObjectKey).catch(() => undefined);
    }

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
      storageProvider: video.storageProvider === "r2" ? "r2" : "drive",
      r2ObjectKey: video.r2ObjectKey ?? null,
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
      .select({
        objectParts: videosTable.objectParts,
        hlsParts: videosTable.hlsParts,
        storageProvider: videosTable.storageProvider,
        r2ObjectKey: videosTable.r2ObjectKey,
      })
      .from(videosTable)
      .where(eq(videosTable.id, id))
      .limit(1);
    await db.delete(videosTable).where(eq(videosTable.id, id));
    const parts = parseObjectParts(existing?.objectParts);
    if (parts) void deleteVideoObjects(parts);
    if (existing?.hlsParts) void deleteHlsObjects(id);
    if (existing?.storageProvider === "r2" && existing.r2ObjectKey) {
      void deleteR2ObjectIfUnreferenced(existing.r2ObjectKey).catch(() => undefined);
    }
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

    // Log exactly what the server resolved — visible in production logs for debugging
    console.info(`[video-storage] resolved parts for migration`, {
      videoId: id,
      title: video.title,
      totalParts: partsList.length,
      parts: partsList.map((p, i) => ({
        index: i + 1,
        label: p.label,
        url: p.url.slice(0, 100),
        fileId: extractDriveFileId(p.url) ?? "UNRECOGNIZED",
      })),
    });

    if (partsList.length === 0) {
      res.status(422).json({
        message:
          "الفيديو لا يحتوي على روابط Drive صالحة.\n" +
          `driveEmbedUrl: "${video.driveEmbedUrl}"\n` +
          `driveParts: ${video.driveParts ? video.driveParts.slice(0, 200) : "null"}`,
        isRateLimit: false,
      });
      return;
    }

    const copied: ObjectPart[] = [];
    let totalBytes = 0;
    let currentPartIndex = 0; // tracked outside try so catch can report which part failed
    try {
      for (let i = 0; i < partsList.length; i++) {
        currentPartIndex = i;
        const partUrl = partsList[i].url;
        const partLabel = `الجزء ${i + 1}/${partsList.length} (${partsList[i].label})`;

        if (isFolderDriveUrl(partUrl)) {
          throw Object.assign(
            new Error(
              `${partLabel}: الرابط هو مجلد Google Drive وليس ملف فيديو.\n` +
              `URL: ${partUrl}\n` +
              `الحل: افتح المجلد → اختر ملف الفيديو → انسخ رابط الملف (file/d/...).`,
            ),
            { driveStatus: 400 as number | undefined, isRateLimit: false },
          );
        }

        const fileId = extractDriveFileId(partUrl);
        if (!fileId) {
          throw Object.assign(
            new Error(
              `${partLabel}: تعذّر استخراج File ID من الرابط.\n` +
              `URL: ${partUrl}\n` +
              `الصيغ المدعومة: /file/d/ID  أو  ?id=ID  أو  مُعرَّف خام (20+ حرف).`,
            ),
            { driveStatus: 400 as number | undefined, isRateLimit: false },
          );
        }

        console.info(`[video-storage] migrating part ${i + 1}/${partsList.length}`, {
          videoId: id,
          label: partsList[i].label,
          fileId,
          url: partUrl.slice(0, 100),
        });

        const destPath = buildVideoObjectPath(id, i);
        const result = await copyDriveFileToStorage(fileId, destPath);

        if (result.bytes === 0) {
          throw Object.assign(
            new Error(`${partLabel}: Drive أعاد 0 بايت — الملف فارغ أو محجوب.\nFile ID: ${fileId}`),
            { driveStatus: 403 as number | undefined, isRateLimit: false },
          );
        }

        copied.push({ label: partsList[i].label, objectPath: result.objectPath });
        totalBytes += result.bytes;
        const mb = (result.bytes / 1024 / 1024).toFixed(1);
        console.info(`[video-storage] part ${i + 1}/${partsList.length} done`, {
          videoId: id, fileId, bytes: result.bytes, mb,
        });

        // Throttle between parts to avoid hitting Google Drive rate limits.
        if (i < partsList.length - 1) {
          await new Promise(r => setTimeout(r, 1_000));
        }
      }
    } catch (copyErr) {
      const driveErr = copyErr as Error & { driveStatus?: number; isRateLimit?: boolean };
      const failedPart = currentPartIndex + 1;

      console.error(`[video-storage] migration failed at part ${failedPart}/${partsList.length}`, {
        videoId: id,
        failedPart,
        driveStatus: driveErr.driveStatus,
        isRateLimit: driveErr.isRateLimit,
        error: driveErr.message,
        copiedSoFar: copied.length,
      });

      // Roll back partially-uploaded GCS objects so next retry starts clean.
      // Skip rollback if another concurrent migration already committed the row.
      if (copied.length > 0) {
        try {
          const [current] = await db
            .select({ objectParts: videosTable.objectParts })
            .from(videosTable)
            .where(eq(videosTable.id, id))
            .limit(1);
          if (!current?.objectParts) void deleteVideoObjects(copied);
        } catch { /* cleanup is best-effort */ }
      }

      // Always return structured JSON so the client can show the real error.
      // Use 422 for all migration failures (it is always admin-actionable).
      res.status(422).json({
        message: driveErr.message ?? "خطأ غير معروف أثناء الترحيل",
        isRateLimit: driveErr.isRateLimit ?? false,
        driveStatus: driveErr.driveStatus ?? null,
        failedPart,
        totalParts: partsList.length,
      });
      return;
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

/**
 * POST /admin/images/generate-thumbnail
 *
 * Generate a 800×450 WebP thumbnail from an already-uploaded image.
 * Returns { thumbnailPath, thumbnailUrl }.
 */
router.post("/admin/images/generate-thumbnail", adminAuth, async (req, res) => {
  const sourcePath = typeof req.body.sourcePath === "string" ? req.body.sourcePath : null;
  if (!sourcePath) {
    res.status(400).json({ error: "sourcePath is required" });
    return;
  }
  try {
    const objectPath = sourcePath.replace(/^\/api\/storage/, "");
    const thumbPath = await generateThumbnail(objectPath);
    if (!thumbPath) {
      res.status(422).json({ error: "Could not generate thumbnail (unsupported format or file missing)" });
      return;
    }
    const thumbnailUrl = thumbPathToUrl(thumbPath);
    res.json({ thumbnailPath: thumbPath, thumbnailUrl });
  } catch (err) {
    console.error("[admin] generate-thumbnail error:", err);
    res.status(500).json({ error: "Thumbnail generation failed" });
  }
});

router.post("/admin/categories", adminAuth, async (req, res) => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    const thumbnailUrl = typeof req.body.thumbnailUrl === "string" ? req.body.thumbnailUrl || null : null;
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
      thumbnailUrl,
      accentColor: body.accentColor ?? null,
      sortOrder: body.sortOrder ?? Number(maxOrder) + 1,
      isVisible: body.isVisible ?? true,
      isFeatured: body.isFeatured ?? false,
      showOnHomepage: body.showOnHomepage ?? true,
      linkedPlaylistId: body.linkedPlaylistId ?? null,
    } as any).returning();

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
    if ("thumbnailUrl" in req.body) updateData.thumbnailUrl = req.body.thumbnailUrl ?? null;
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
    let countMap: Record<number, number> = {};
    try {
      const courseCounts = await db
        .select({ planId: planCoursesTable.planId, cnt: count() })
        .from(planCoursesTable)
        .groupBy(planCoursesTable.planId);
      countMap = Object.fromEntries(courseCounts.map(r => [r.planId, Number(r.cnt)]));
    } catch (countErr) {
      console.error("[admin/plans] courseCount query failed (non-fatal):", countErr instanceof Error ? countErr.message : countErr);
    }
    const result = plans.map(p => ({ ...p, courseCount: countMap[p.id] ?? 0 }));
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch plans";
    const cause = (error as any)?.cause?.message;
    res.status(500).json({ message: cause ? `${msg} | ${cause}` : msg });
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

/* ── Plan courses ─────────────────────────────────────────────── */

router.get("/admin/subscription-plans/:id/courses", adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .select({ playlistId: planCoursesTable.playlistId })
      .from(planCoursesTable)
      .where(eq(planCoursesTable.planId, id));
    res.json(rows.map(r => r.playlistId));
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to fetch plan courses" });
  }
});

router.put("/admin/subscription-plans/:id/courses", adminAuth, async (req, res) => {
  try {
    const planId = Number(req.params.id);
    const newPlaylistIds: number[] = Array.isArray(req.body) ? req.body.map(Number).filter(n => !isNaN(n)) : [];

    const [plan] = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, planId)).limit(1);
    if (!plan) { res.status(404).json({ message: "Plan not found" }); return; }

    const oldRows = await db.select({ playlistId: planCoursesTable.playlistId })
      .from(planCoursesTable).where(eq(planCoursesTable.planId, planId));
    const oldIds = oldRows.map(r => r.playlistId);

    const added   = newPlaylistIds.filter(id => !oldIds.includes(id));
    const removed = oldIds.filter(id => !newPlaylistIds.includes(id));

    await db.delete(planCoursesTable).where(eq(planCoursesTable.planId, planId));
    if (newPlaylistIds.length > 0) {
      await db.insert(planCoursesTable).values(newPlaylistIds.map(pid => ({ planId, playlistId: pid })));
    }

    /* ── Subscriber sync (non-fatal) ─────────────────────────── */
    let syncedSubscribers = 0;
    try {
      const subscribers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.subscriptionType, plan.type));
      const subIds = subscribers.map(u => u.id);
      syncedSubscribers = subIds.length;

      if (subIds.length > 0 && added.length > 0) {
        const existing = await db
          .select({ userId: userCoursesTable.userId, playlistId: userCoursesTable.playlistId })
          .from(userCoursesTable)
          .where(and(
            inArray(userCoursesTable.userId, subIds),
            inArray(userCoursesTable.playlistId, added),
          ));
        const existSet = new Set(existing.map(r => `${r.userId}:${r.playlistId}`));
        const toInsert = subIds.flatMap(uid =>
          added.filter(pid => !existSet.has(`${uid}:${pid}`)).map(pid => ({ userId: uid, playlistId: pid }))
        );
        if (toInsert.length > 0) await db.insert(userCoursesTable).values(toInsert);
      }

      if (subIds.length > 0 && removed.length > 0) {
        await db.delete(userCoursesTable).where(
          and(
            inArray(userCoursesTable.userId, subIds),
            inArray(userCoursesTable.playlistId, removed),
          )
        );
      }
    } catch (syncErr) {
      console.error("[admin/plans] subscriber sync failed (non-fatal):", syncErr instanceof Error ? syncErr.message : syncErr);
    }

    res.json({ message: "Plan courses updated", added: added.length, removed: removed.length, subscribers: syncedSubscribers });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update plan courses";
    const cause = (error as any)?.cause?.message;
    console.error("[admin/plans] PUT courses error:", msg, cause ?? "");
    res.status(500).json({ message: cause ? `${msg} | ${cause}` : msg });
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
    const { isHidden, isPinned, isFeatured, isVipLocked, isImportant, isSolved } = req.body as {
      isHidden?: boolean;
      isPinned?: boolean;
      isFeatured?: boolean;
      isVipLocked?: boolean;
      isImportant?: boolean;
      isSolved?: boolean;
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
    if (typeof isImportant === "boolean") updates.isImportant = isImportant;
    if (typeof isSolved === "boolean") updates.isSolved = isSolved;

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
    await deleteCommunityMediaForPosts([id]);
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

// ─── Tools Admin CRUD ───────────────────────────────────────────────────────

/* ═══════════════════════════════════════════════════════════════════════
   TOOL CATEGORIES CRUD
   ═══════════════════════════════════════════════════════════════════════ */

router.get("/admin/tool-categories", adminAuth, async (_req, res) => {
  try {
    const cats = await db
      .select()
      .from(toolCategoriesTable)
      .orderBy(asc(toolCategoriesTable.sortOrder), asc(toolCategoriesTable.id));
    res.json(cats);
  } catch (err) {
    console.error("[admin] GET /admin/tool-categories error:", err);
    res.status(500).json({ message: "حدث خطأ في جلب تصنيفات الأدوات" });
  }
});

router.post("/admin/tool-categories", adminAuth, async (req, res) => {
  try {
    const { name, sortOrder, isVisible } = req.body as { name: string; sortOrder?: number; isVisible?: boolean };
    if (!name?.trim()) { res.status(400).json({ message: "اسم التصنيف مطلوب" }); return; }
    const [cat] = await db
      .insert(toolCategoriesTable)
      .values({ name: name.trim(), sortOrder: sortOrder ?? 0, isVisible: isVisible ?? true })
      .returning();
    res.status(201).json(cat);
  } catch (err) {
    console.error("[admin] POST /admin/tool-categories error:", err);
    res.status(500).json({ message: "حدث خطأ في إضافة التصنيف" });
  }
});

router.patch("/admin/tool-categories/:id", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ message: "معرّف غير صالح" }); return; }
    const { name, sortOrder, isVisible } = req.body as { name?: string; sortOrder?: number; isVisible?: boolean };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isVisible !== undefined) updates.isVisible = isVisible;
    const [cat] = await db.update(toolCategoriesTable).set(updates).where(eq(toolCategoriesTable.id, id)).returning();
    if (!cat) { res.status(404).json({ message: "التصنيف غير موجود" }); return; }
    res.json(cat);
  } catch (err) {
    console.error("[admin] PATCH /admin/tool-categories/:id error:", err);
    res.status(500).json({ message: "حدث خطأ في تحديث التصنيف" });
  }
});

router.delete("/admin/tool-categories/:id", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ message: "معرّف غير صالح" }); return; }
    const [del] = await db.delete(toolCategoriesTable).where(eq(toolCategoriesTable.id, id)).returning({ id: toolCategoriesTable.id });
    if (!del) { res.status(404).json({ message: "التصنيف غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] DELETE /admin/tool-categories/:id error:", err);
    res.status(500).json({ message: "حدث خطأ في حذف التصنيف" });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   TOOLS CRUD
   ═══════════════════════════════════════════════════════════════════════ */

router.get("/admin/tools", adminAuth, async (_req, res) => {
  try {
    const tools = await db
      .select({
        id:           toolsTable.id,
        name:         toolsTable.name,
        description:  toolsTable.description,
        imageUrl:     toolsTable.imageUrl,
        categoryId:   toolsTable.categoryId,
        categoryName: toolCategoriesTable.name,
        accessType:   toolsTable.accessType,
        downloadUrl:  toolsTable.downloadUrl,
        hasPassword:  sql<boolean>`(${toolsTable.passwordHash} IS NOT NULL)`,
        isPublished:  toolsTable.isPublished,
        os:           toolsTable.os,
        sortOrder:    toolsTable.sortOrder,
        createdAt:    toolsTable.createdAt,
      })
      .from(toolsTable)
      .leftJoin(toolCategoriesTable, eq(toolsTable.categoryId, toolCategoriesTable.id))
      .orderBy(asc(toolsTable.sortOrder), asc(toolsTable.id));
    res.json(tools);
  } catch (err) {
    console.error("[admin] GET /admin/tools error:", err);
    res.status(500).json({ message: "حدث خطأ في جلب الأدوات" });
  }
});

router.post("/admin/tools", adminAuth, async (req, res) => {
  try {
    const parsed = CreateToolBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات الأداة غير صحيحة", errors: parsed.error.issues });
      return;
    }
    const { password, ...rest } = parsed.data;
    const categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
    let passwordHash: string | null = null;
    if (password && password.trim()) {
      passwordHash = await hashPassword(password.trim());
    }
    const [tool] = await db
      .insert(toolsTable)
      .values({ ...rest, categoryId, passwordHash })
      .returning();
    res.status(201).json(tool);
  } catch (err) {
    console.error("[admin] POST /admin/tools error:", err);
    res.status(500).json({ message: "حدث خطأ في إضافة الأداة" });
  }
});

router.patch("/admin/tools/:id", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ message: "معرّف غير صالح" }); return; }

    const parsed = UpdateToolBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات الأداة غير صحيحة", errors: parsed.error.issues });
      return;
    }

    const { password, ...rest } = parsed.data;
    const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };

    if (req.body.categoryId !== undefined) {
      updates.categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
    }

    if (password !== undefined) {
      updates.passwordHash = password && password.trim()
        ? await hashPassword(password.trim())
        : null;
    }

    const [updated] = await db
      .update(toolsTable)
      .set(updates)
      .where(eq(toolsTable.id, id))
      .returning({ id: toolsTable.id });

    if (!updated) { res.status(404).json({ message: "الأداة غير موجودة" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] PATCH /admin/tools/:id error:", err);
    res.status(500).json({ message: "حدث خطأ في تحديث الأداة" });
  }
});

router.delete("/admin/tools/:id", adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ message: "معرّف غير صالح" }); return; }

    const [deleted] = await db
      .delete(toolsTable)
      .where(eq(toolsTable.id, id))
      .returning({ id: toolsTable.id });

    if (!deleted) { res.status(404).json({ message: "الأداة غير موجودة" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] DELETE /admin/tools/:id error:", err);
    res.status(500).json({ message: "حدث خطأ في حذف الأداة" });
  }
});

const SecurityReasonBody = zod.object({ reason: zod.string().trim().max(1000).optional() });
const SecurityWhitelistBody = zod.object({
  ipAddress: zod.string().trim().min(2).max(45).optional(),
  userWide: zod.boolean().optional().default(false),
  reason: zod.string().trim().max(1000).optional(),
}).refine((v) => v.userWide || !!v.ipAddress, { message: "ipAddress or userWide is required" });

router.get("/admin/security/users", adminAuth, async (req, res) => {
  const page = Math.max(Number.parseInt(String(req.query.page || "1"), 10) || 1, 1);
  const requestedPageSize = Number.parseInt(String(req.query.pageSize || "20"), 10);
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const search = String(req.query.search || "").trim();
  const filter = String(req.query.filter || "all");
  const offset = (page - 1) * pageSize;

  const trustedPhone = sql<boolean>`EXISTS (
    SELECT 1 FROM ${trustedDevicesTable}
    WHERE ${trustedDevicesTable.userId} = ${usersTable.id}
      AND ${trustedDevicesTable.category} = 'PHONE'
      AND ${trustedDevicesTable.status} = 'TRUSTED'
  )`;
  const trustedComputer = sql<boolean>`EXISTS (
    SELECT 1 FROM ${trustedDevicesTable}
    WHERE ${trustedDevicesTable.userId} = ${usersTable.id}
      AND ${trustedDevicesTable.category} = 'COMPUTER'
      AND ${trustedDevicesTable.status} = 'TRUSTED'
  )`;
  const blockedDevice = sql<boolean>`EXISTS (
    SELECT 1 FROM ${trustedDevicesTable}
    WHERE ${trustedDevicesTable.userId} = ${usersTable.id}
      AND ${trustedDevicesTable.status} = 'BLOCKED'
  )`;

  const conditions = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(usersTable.email, pattern),
      ilike(usersTable.username, pattern),
      ilike(usersTable.fullName, pattern),
      ilike(usersTable.phone, pattern),
      sql<boolean>`CAST(${usersTable.id} AS TEXT) ILIKE ${pattern}`,
    ));
  }
  if (filter === "blocked_user") conditions.push(or(isNotNull(usersTable.securityBlockedAt), eq(usersTable.isActive, false)));
  else if (filter === "blocked_device") conditions.push(blockedDevice);
  else if (filter === "clean") conditions.push(and(isNull(usersTable.securityBlockedAt), eq(usersTable.isActive, true), sql<boolean>`NOT ${blockedDevice}`));
  else if (filter === "phone") conditions.push(trustedPhone);
  else if (filter === "computer") conditions.push(trustedComputer);
  else if (filter === "two_devices") conditions.push(and(trustedPhone, trustedComputer));
  else if (filter === "no_devices") conditions.push(and(sql<boolean>`NOT ${trustedPhone}`, sql<boolean>`NOT ${trustedComputer}`));

  const where = conditions.length ? and(...conditions) : undefined;
  const [users, totalRows] = await Promise.all([
    db.select({
    id: usersTable.id, username: usersTable.username, email: usersTable.email,
    fullName: usersTable.fullName, phone: usersTable.phone,
    isActive: usersTable.isActive, accountType: usersTable.accountType,
    subscriptionType: usersTable.subscriptionType, subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    securityBlockedAt: usersTable.securityBlockedAt, securityBlockedReason: usersTable.securityBlockedReason,
    }).from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(usersTable).where(where),
  ]);
  const ids = users.map((u) => u.id);
  const devices = ids.length ? await db.select().from(trustedDevicesTable)
    .where(inArray(trustedDevicesTable.userId, ids)).orderBy(desc(trustedDevicesTable.lastSeenAt)) : [];
  const total = Number(totalRows[0]?.total || 0);
  res.json({
    users: users.map((user) => ({
      ...safeSecurityUserDto(user),
      fullName: user.fullName,
      phone: user.phone,
      devices: devices.filter((device) => device.userId === user.id).map(safeDeviceDto),
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  });
});

router.get("/admin/security/users/:id", adminAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) { res.status(400).json({ message: "Invalid user id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  const [devices, events, whitelists, sessions] = await Promise.all([
    db.select().from(trustedDevicesTable).where(eq(trustedDevicesTable.userId, userId)).orderBy(desc(trustedDevicesTable.lastSeenAt)),
    db.select().from(securityEventsTable).where(eq(securityEventsTable.userId, userId)).orderBy(desc(securityEventsTable.createdAt)).limit(200),
    db.select().from(securityWhitelistsTable).where(eq(securityWhitelistsTable.userId, userId)).orderBy(desc(securityWhitelistsTable.createdAt)),
    db.select().from(userSecuritySessionsTable).where(eq(userSecuritySessionsTable.userId, userId)).orderBy(desc(userSecuritySessionsTable.createdAt)),
  ]);
  res.json({
    user: safeSecurityUserDto(user),
    devices: devices.map(safeDeviceDto),
    events: events.map((event) => ({
      id: event.id, userId: event.userId, deviceId: event.deviceId, sessionId: event.sessionId,
      eventType: event.eventType, outcome: event.outcome, riskScore: event.riskScore,
      riskReasons: event.riskReasons, ipAddress: event.ipAddress, country: event.country,
      region: event.region, city: event.city, latitude: event.latitude, longitude: event.longitude,
      distanceKm: event.distanceKm, elapsedSeconds: event.elapsedSeconds, reputation: event.reputation,
      metadata: event.metadata, adminId: event.adminId, createdAt: event.createdAt,
    })),
    whitelists: whitelists.map((entry) => ({
      id: entry.id, userId: entry.userId, ipAddress: entry.ipAddress, reason: entry.reason,
      createdByAdminId: entry.createdByAdminId, isActive: entry.isActive, createdAt: entry.createdAt,
    })),
    sessions: sessions.map((session) => ({
      id: session.id, userId: session.userId, deviceId: session.deviceId, ipAddress: session.ipAddress,
      createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, revokedAt: session.revokedAt,
    })),
  });
});

router.post("/admin/security/users/:id/devices/:deviceId/revoke", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const deviceId = Number(req.params.deviceId);
  const body = SecurityReasonBody.parse(req.body);
  const [device] = await db.select().from(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.id, deviceId), eq(trustedDevicesTable.userId, userId))).limit(1);
  if (!device) { res.status(404).json({ message: "Device not found" }); return; }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(trustedDevicesTable).set({ status: "REVOKED", revokedAt: now }).where(eq(trustedDevicesTable.id, deviceId));
    await tx.update(userSecuritySessionsTable).set({ revokedAt: now })
      .where(and(eq(userSecuritySessionsTable.deviceId, deviceId), isNull(userSecuritySessionsTable.revokedAt)));
    await tx.insert(securityEventsTable).values({
      userId, deviceId, adminId: req.admin!.id, eventType: "DEVICE_REVOKED",
      outcome: "ADMIN_ACTION", metadata: { reason: body.reason || null },
    });
  });
  res.json({ ok: true });
});

router.post("/admin/security/users/:id/devices/reset/:category", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const category = String(req.params.category).toUpperCase();
  if (category !== "PHONE" && category !== "COMPUTER") { res.status(400).json({ message: "Invalid category" }); return; }
  const body = SecurityReasonBody.parse(req.body);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const active = await tx.select({ id: trustedDevicesTable.id }).from(trustedDevicesTable)
      .where(and(eq(trustedDevicesTable.userId, userId), eq(trustedDevicesTable.category, category), eq(trustedDevicesTable.status, "TRUSTED")));
    if (active.length) {
      const deviceIds = active.map((d) => d.id);
      for (const device of active) {
        await tx.update(trustedDevicesTable)
          .set({ status: "REVOKED", revokedAt: now, credentialHash: retiredDeviceCredentialHash() })
          .where(eq(trustedDevicesTable.id, device.id));
      }
      await tx.update(userSecuritySessionsTable).set({ revokedAt: now }).where(inArray(userSecuritySessionsTable.deviceId, deviceIds));
    }
    await tx.insert(securityEventsTable).values({
      userId, adminId: req.admin!.id, eventType: "DEVICE_RESET_BY_ADMIN", outcome: "ADMIN_ACTION",
      riskReasons: [category], metadata: { reason: body.reason || null },
    });
  });
  res.json({ ok: true });
});

router.post("/admin/security/users/:id/devices/:deviceId/approve", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const deviceId = Number(req.params.deviceId);
  const body = SecurityReasonBody.parse(req.body);
  const now = new Date();
  const approved = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const [candidate] = await tx.select().from(trustedDevicesTable)
      .where(and(eq(trustedDevicesTable.id, deviceId), eq(trustedDevicesTable.userId, userId), eq(trustedDevicesTable.status, "BLOCKED"))).limit(1);
    if (!candidate) return false;
    const old = await tx.select({ id: trustedDevicesTable.id }).from(trustedDevicesTable)
      .where(and(eq(trustedDevicesTable.userId, userId), eq(trustedDevicesTable.category, candidate.category), eq(trustedDevicesTable.status, "TRUSTED")));
    if (old.length) {
      const ids = old.map((d) => d.id);
      await tx.update(trustedDevicesTable).set({ status: "REVOKED", revokedAt: now }).where(inArray(trustedDevicesTable.id, ids));
      await tx.update(userSecuritySessionsTable).set({ revokedAt: now }).where(inArray(userSecuritySessionsTable.deviceId, ids));
    }
    await tx.update(trustedDevicesTable).set({ status: "TRUSTED", createdBy: "ADMIN", revokedAt: null }).where(eq(trustedDevicesTable.id, deviceId));
    await tx.insert(securityEventsTable).values({
      userId, deviceId, adminId: req.admin!.id, eventType: "DEVICE_APPROVED_BY_ADMIN",
      outcome: "ADMIN_ACTION", metadata: { reason: body.reason || null },
    });
    return true;
  });
  if (!approved) { res.status(404).json({ message: "Blocked device not found" }); return; }
  res.json({ ok: true });
});

router.post("/admin/security/users/:id/block", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const body = SecurityReasonBody.parse(req.body);
  const now = new Date();
  const [user] = await db.update(usersTable).set({ securityBlockedAt: now, securityBlockedReason: body.reason || null })
    .where(eq(usersTable.id, userId)).returning({ id: usersTable.id });
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  await db.update(userSecuritySessionsTable).set({ revokedAt: now })
    .where(and(eq(userSecuritySessionsTable.userId, userId), isNull(userSecuritySessionsTable.revokedAt)));
  await db.insert(securityEventsTable).values({ userId, adminId: req.admin!.id, eventType: "USER_SECURITY_BLOCKED", outcome: "ADMIN_ACTION", metadata: { reason: body.reason || null } });
  res.json({ ok: true });
});

router.post("/admin/security/users/:id/unblock", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const [user] = await db.update(usersTable).set({ securityBlockedAt: null, securityBlockedReason: null })
    .where(eq(usersTable.id, userId)).returning({ id: usersTable.id });
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  await db.insert(securityEventsTable).values({ userId, adminId: req.admin!.id, eventType: "USER_SECURITY_UNBLOCKED", outcome: "ADMIN_ACTION" });
  res.json({ ok: true });
});

router.post("/admin/security/users/:id/whitelists", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const body = SecurityWhitelistBody.parse(req.body);
  const [entry] = await db.insert(securityWhitelistsTable).values({
    userId: body.userWide ? userId : null,
    ipAddress: body.userWide ? null : body.ipAddress,
    reason: body.reason,
    createdByAdminId: req.admin!.id,
  }).returning();
  await db.insert(securityEventsTable).values({ userId, adminId: req.admin!.id, eventType: "IP_WHITELISTED", outcome: "ADMIN_ACTION", ipAddress: entry.ipAddress, metadata: { whitelistId: entry.id, userWide: body.userWide } });
  res.status(201).json(entry);
});

router.delete("/admin/security/users/:id/whitelists/:whitelistId", adminAuth, securityManageAuth, async (req, res) => {
  const userId = Number(req.params.id);
  const whitelistId = Number(req.params.whitelistId);
  const [entry] = await db.update(securityWhitelistsTable).set({ isActive: false })
    .where(and(eq(securityWhitelistsTable.id, whitelistId), or(eq(securityWhitelistsTable.userId, userId), isNull(securityWhitelistsTable.userId)))).returning();
  if (!entry) { res.status(404).json({ message: "Whitelist entry not found" }); return; }
  await db.insert(securityEventsTable).values({ userId, adminId: req.admin!.id, eventType: "IP_WHITELIST_REMOVED", outcome: "ADMIN_ACTION", ipAddress: entry.ipAddress, metadata: { whitelistId } });
  res.json({ ok: true });
});

router.post("/admin/tools/reorder", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids)) { res.status(400).json({ message: "ids مطلوب" }); return; }
    await Promise.all(
      ids.map((id, index) =>
        db.update(toolsTable).set({ sortOrder: index }).where(eq(toolsTable.id, id))
      )
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[admin] POST /admin/tools/reorder error:", err);
    res.status(500).json({ message: "حدث خطأ في الترتيب" });
  }
});

export default router;
