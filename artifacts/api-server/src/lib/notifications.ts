import {
  db,
  notificationsTable,
  notificationRecipientsTable,
  usersTable,
  activityLogsTable,
  videosTable,
} from "@workspace/db";
import { and, eq, or, gt, isNull, isNotNull, inArray, not } from "drizzle-orm";
import { sendPushToUsers, type PushPayload } from "./webPush";

export type AudienceType = "all" | "vip" | "normal" | "user" | "category";
export type TargetType = "post" | "lesson" | "page" | "none";

export type CreateNotificationInput = {
  type: string; // community_vip_post | comment | reply | like | admin_broadcast
  title: string;
  body?: string;
  actorUserId?: number | null;
  adminId?: number | null;
  audienceType?: AudienceType | null;
  audienceValue?: string | null;
  targetType?: TargetType;
  targetId?: number | null;
  targetPath?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  /** Explicit recipients (used for direct, single-user community notifications). */
  recipientUserIds?: number[];
  /** Users to drop from a resolved audience (e.g. the actor themselves). */
  excludeUserIds?: number[];
};

// A viewer counts as VIP only if active and not expired.
function vipWhere() {
  return and(
    eq(usersTable.isActive, true),
    eq(usersTable.accountType, "vip"),
    or(isNull(usersTable.subscriptionExpiresAt), gt(usersTable.subscriptionExpiresAt, new Date())),
  )!;
}

async function resolveAudience(
  audienceType: AudienceType,
  audienceValue: string | null,
): Promise<number[]> {
  switch (audienceType) {
    case "all": {
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.isActive, true));
      return rows.map((r) => r.id);
    }
    case "vip": {
      const rows = await db.select({ id: usersTable.id }).from(usersTable).where(vipWhere());
      return rows.map((r) => r.id);
    }
    case "normal": {
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.isActive, true), not(vipWhere())));
      return rows.map((r) => r.id);
    }
    case "user": {
      const uid = Number(audienceValue);
      if (!Number.isFinite(uid)) return [];
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.id, uid), eq(usersTable.isActive, true)));
      return rows.map((r) => r.id);
    }
    case "category": {
      // No direct user<->category link exists; target users who have watched a
      // lesson in this category (derived from activity logs).
      const cid = Number(audienceValue);
      if (!Number.isFinite(cid)) return [];
      const rows = await db
        .selectDistinct({ id: activityLogsTable.userId })
        .from(activityLogsTable)
        .innerJoin(videosTable, eq(activityLogsTable.videoId, videosTable.id))
        .where(and(eq(videosTable.categoryId, cid), isNotNull(activityLogsTable.userId)));
      return rows.map((r) => r.id).filter((x): x is number => x != null);
    }
    default:
      return [];
  }
}

async function dispatchPush(notificationId: number, userIds: number[], payload: PushPayload) {
  try {
    const { attempted, success } = await sendPushToUsers(userIds, payload);
    if (attempted > 0) {
      await db
        .update(notificationsTable)
        .set({ pushAttemptedCount: attempted, pushSuccessCount: success })
        .where(eq(notificationsTable.id, notificationId));
    }
  } catch {
    // Push is best-effort; never surface failures to the caller.
  }
}

/**
 * Creates a notification and fans it out to recipients. DB write is synchronous
 * (so reached counts are accurate immediately); Web Push is fired in the
 * background and never blocks or breaks the caller.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ notificationId: number; recipientCount: number; deduped: boolean }> {
  const [created] = await db
    .insert(notificationsTable)
    .values({
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      actorUserId: input.actorUserId ?? null,
      adminId: input.adminId ?? null,
      audienceType: input.audienceType ?? null,
      audienceValue: input.audienceValue ?? null,
      targetType: input.targetType ?? "none",
      targetId: input.targetId ?? null,
      targetPath: input.targetPath ?? null,
      metadata: input.metadata ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: notificationsTable.dedupeKey })
    .returning({ id: notificationsTable.id });

  if (!created) {
    // An identical event already exists (dedupeKey conflict).
    return { notificationId: 0, recipientCount: 0, deduped: true };
  }

  let recipients: number[];
  if (input.recipientUserIds && input.recipientUserIds.length > 0) {
    recipients = input.recipientUserIds;
  } else if (input.audienceType) {
    recipients = await resolveAudience(input.audienceType, input.audienceValue ?? null);
  } else {
    recipients = [];
  }

  const exclude = new Set(input.excludeUserIds ?? []);
  const finalRecipients = [...new Set(recipients)].filter((id) => !exclude.has(id));

  if (finalRecipients.length > 0) {
    await db
      .insert(notificationRecipientsTable)
      .values(finalRecipients.map((userId) => ({ notificationId: created.id, userId })))
      .onConflictDoNothing();
    await db
      .update(notificationsTable)
      .set({ recipientCount: finalRecipients.length })
      .where(eq(notificationsTable.id, created.id));

    void dispatchPush(created.id, finalRecipients, {
      title: input.title,
      body: input.body ?? "",
      url: input.targetPath ?? undefined,
      tag: input.dedupeKey ?? `notif-${created.id}`,
    });
  }

  return {
    notificationId: created.id,
    recipientCount: finalRecipients.length,
    deduped: false,
  };
}
