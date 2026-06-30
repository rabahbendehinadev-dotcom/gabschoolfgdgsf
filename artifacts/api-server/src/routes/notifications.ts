import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  notificationsTable,
  notificationRecipientsTable,
  pushSubscriptionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, desc, lt, isNull, count } from "drizzle-orm";
import { userAuthNoIpLimit } from "../middlewares/auth";
import { getVapidPublicKey } from "../lib/webPush";
import { SavePushSubscriptionBody, DeletePushSubscriptionBody, ReportPushStatusBody } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /notifications — the current user's feed (cursor = last notification id).
router.get("/notifications", userAuthNoIpLimit, async (req: Request, res: Response) => {
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
router.get("/notifications/unread-count", userAuthNoIpLimit, async (req: Request, res: Response) => {
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
router.post("/notifications/read-all", userAuthNoIpLimit, async (req: Request, res: Response) => {
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
router.post("/notifications/:id/read", userAuthNoIpLimit, async (req: Request, res: Response) => {
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
router.post("/notifications/push-subscriptions", userAuthNoIpLimit, async (req: Request, res: Response) => {
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

    // A saved subscription is the strongest proof of "granted + supported";
    // record it as opt-in telemetry and stamp the first-enable time once.
    await db
      .update(usersTable)
      .set({ pushPermission: "granted", pushSupported: true })
      .where(eq(usersTable.id, userId));
    await db
      .update(usersTable)
      .set({ pushEnabledAt: new Date() })
      .where(and(eq(usersTable.id, userId), isNull(usersTable.pushEnabledAt)));

    res.json({ message: "ok" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to save subscription",
    });
  }
});

// DELETE /notifications/push-subscriptions
router.delete("/notifications/push-subscriptions", userAuthNoIpLimit, async (req: Request, res: Response) => {
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

// ---------------------------------------------------------------------------
// Mandatory opt-in: per-user permission/support telemetry + the one-time
// "you still haven't enabled notifications" reminder. None are IP-restricted
// (userAuthNoIpLimit) so a VIP on a rotating mobile IP can always report state.
// ---------------------------------------------------------------------------

const REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// A user is "enabled" iff they have at least one push subscription that hasn't
// been pruned for delivery failures — the only proof we can actually reach them.
async function loadPushState(userId: number): Promise<{
  enabled: boolean;
  permission: string;
  supported: boolean;
  shouldRemind: boolean;
}> {
  const [user] = await db
    .select({
      pushPermission: usersTable.pushPermission,
      pushSupported: usersTable.pushSupported,
      pushReminderSeenAt: usersTable.pushReminderSeenAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [activeSub] = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.userId, userId),
        isNull(pushSubscriptionsTable.failedAt),
      ),
    )
    .limit(1);

  const enabled = !!activeSub;
  const ageMs = user ? Date.now() - new Date(user.createdAt).getTime() : 0;
  const shouldRemind =
    !!user && !enabled && user.pushReminderSeenAt == null && ageMs >= REMINDER_AFTER_MS;

  return {
    enabled,
    permission: user?.pushPermission ?? "default",
    supported: user?.pushSupported ?? false,
    shouldRemind,
  };
}

// GET /notifications/push-status — current opt-in state for the gate.
router.get("/notifications/push-status", userAuthNoIpLimit, async (req: Request, res: Response) => {
  try {
    res.json(await loadPushState(req.user!.id));
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to load push status",
    });
  }
});

// POST /notifications/push-status — the client reports this device's permission
// and push capability after login and after each decision.
router.post("/notifications/push-status", userAuthNoIpLimit, async (req: Request, res: Response) => {
  try {
    const parsed = ReportPushStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "بيانات غير صالحة" });
      return;
    }
    const userId = req.user!.id;
    const { permission, supported } = parsed.data;

    await db
      .update(usersTable)
      .set({ pushPermission: permission, pushSupported: supported })
      .where(eq(usersTable.id, userId));

    // Stamp the first time they reach "granted"; keep it stable thereafter.
    if (permission === "granted") {
      await db
        .update(usersTable)
        .set({ pushEnabledAt: new Date() })
        .where(and(eq(usersTable.id, userId), isNull(usersTable.pushEnabledAt)));
    }

    res.json(await loadPushState(userId));
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to update push status",
    });
  }
});

// POST /notifications/push-reminder-ack — mark the one-time reminder as shown.
router.post("/notifications/push-reminder-ack", userAuthNoIpLimit, async (req: Request, res: Response) => {
  try {
    await db
      .update(usersTable)
      .set({ pushReminderSeenAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));
    res.json({ message: "ok" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to acknowledge reminder",
    });
  }
});

export default router;
