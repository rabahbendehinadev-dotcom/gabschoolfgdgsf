import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  notificationsTable,
  notificationRecipientsTable,
  pushSubscriptionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, desc, lt, isNull, count } from "drizzle-orm";
import { userAuth } from "../middlewares/auth";
import { getVapidPublicKey } from "../lib/webPush";
import { SavePushSubscriptionBody, DeletePushSubscriptionBody } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /notifications — the current user's feed (cursor = last notification id).
router.get("/notifications", userAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
    const rawCursor = Number(req.query.cursor);
    const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? rawCursor : null;

    const conditions = [eq(notificationRecipientsTable.userId, userId)];
    if (cursor) conditions.push(lt(notificationRecipientsTable.notificationId, cursor));

    const rows = await db
      .select({
        id: notificationsTable.id,
        type: notificationsTable.type,
        title: notificationsTable.title,
        body: notificationsTable.body,
        targetType: notificationsTable.targetType,
        targetId: notificationsTable.targetId,
        targetPath: notificationsTable.targetPath,
        createdAt: notificationsTable.createdAt,
        readAt: notificationRecipientsTable.readAt,
        actorUsername: usersTable.username,
      })
      .from(notificationRecipientsTable)
      .innerJoin(
        notificationsTable,
        eq(notificationRecipientsTable.notificationId, notificationsTable.id),
      )
      .leftJoin(usersTable, eq(notificationsTable.actorUserId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(notificationRecipientsTable.notificationId))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      items: page.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        targetType: r.targetType,
        targetId: r.targetId ?? null,
        targetPath: r.targetPath ?? null,
        actorUsername: r.actorUsername ?? null,
        isRead: r.readAt != null,
        createdAt: (r.createdAt as Date).toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to load notifications",
    });
  }
});

// GET /notifications/unread-count
router.get("/notifications/unread-count", userAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const [row] = await db
      .select({ c: count() })
      .from(notificationRecipientsTable)
      .where(and(eq(notificationRecipientsTable.userId, userId), isNull(notificationRecipientsTable.readAt)));
    res.json({ count: Number(row?.c ?? 0) });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to count notifications",
    });
  }
});

// POST /notifications/read-all
router.post("/notifications/read-all", userAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await db
      .update(notificationRecipientsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationRecipientsTable.userId, userId), isNull(notificationRecipientsTable.readAt)));
    res.json({ message: "ok" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to mark notifications read",
    });
  }
});

// POST /notifications/:id/read
router.post("/notifications/:id/read", userAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ message: "Invalid notification id" });
      return;
    }
    await db
      .update(notificationRecipientsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationRecipientsTable.userId, userId),
          eq(notificationRecipientsTable.notificationId, id),
          isNull(notificationRecipientsTable.readAt),
        ),
      );
    res.json({ message: "ok" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to mark notification read",
    });
  }
});

// GET /notifications/vapid-public-key — public; returns null when push disabled.
router.get("/notifications/vapid-public-key", async (_req: Request, res: Response) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// POST /notifications/push-subscriptions — register / refresh a Web Push sub.
router.post("/notifications/push-subscriptions", userAuth, async (req: Request, res: Response) => {
  try {
    const parsed = SavePushSubscriptionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات الاشتراك غير صالحة" });
      return;
    }
    const userId = req.user!.id;
    const { endpoint, keys, userAgent } = parsed.data;
    await db
      .insert(pushSubscriptionsTable)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? req.headers["user-agent"] ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: {
          userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          lastSeenAt: new Date(),
          failedAt: null,
        },
      });
    res.json({ message: "ok" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to save subscription",
    });
  }
});

// DELETE /notifications/push-subscriptions
router.delete("/notifications/push-subscriptions", userAuth, async (req: Request, res: Response) => {
  try {
    const parsed = DeletePushSubscriptionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات الاشتراك غير صالحة" });
      return;
    }
    const userId = req.user!.id;
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.endpoint, parsed.data.endpoint),
          eq(pushSubscriptionsTable.userId, userId),
        ),
      );
    res.json({ message: "ok" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to remove subscription",
    });
  }
});

export default router;
