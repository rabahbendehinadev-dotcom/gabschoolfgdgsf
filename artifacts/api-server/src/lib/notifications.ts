import {
  db,
  notificationsTable,
  notificationRecipientsTable,
  usersTable,
  activityLogsTable,
  videosTable,
  userCoursesTable,
} from "@workspace/db";
import { and, eq, or, gt, isNull, isNotNull, inArray, not } from "drizzle-orm";
import { sendPushToUsers, type PushPayload } from "./webPush";

export type AudienceType = "all" | "vip" | "normal" | "user" | "category" | "course";
export type TargetType = "post" | "lesson" | "page" | "none";

export type CreateNotificationInput = {
  type: string; // video | community_* | vip | system | comment | reply | like | admin_broadcast
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
  executor: Pick<typeof db, "select" | "selectDistinct"> = db,
): Promise<number[]> {
  switch (audienceType) {
    case "all": {
      const rows = await executor
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.isActive, true));
      return rows.map((r) => r.id);
    }
    case "vip": {
      const rows = await executor.select({ id: usersTable.id }).from(usersTable).where(vipWhere());
      return rows.map((r) => r.id);
    }
    case "normal": {
      const rows = await executor
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.isActive, true), not(vipWhere())));
      return rows.map((r) => r.id);
    }
    case "user": {
      const uid = Number(audienceValue);
      if (!Number.isFinite(uid)) return [];
      const rows = await executor
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
      const rows = await executor
        .selectDistinct({ id: activityLogsTable.userId })
        .from(activityLogsTable)
        .innerJoin(videosTable, eq(activityLogsTable.videoId, videosTable.id))
        .where(and(eq(videosTable.categoryId, cid), isNotNull(activityLogsTable.userId)));
      return rows.map((r) => r.id).filter((x): x is number => x != null);
    }
    case "course": {
      const playlistId = Number(audienceValue);
      if (!Number.isFinite(playlistId)) return [];
      const rows = await executor
        .selectDistinct({ id: userCoursesTable.userId })
        .from(userCoursesTable)
        .innerJoin(usersTable, eq(userCoursesTable.userId, usersTable.id))
        .where(
          and(
            eq(userCoursesTable.playlistId, playlistId),
            eq(userCoursesTable.status, "active"),
            or(isNull(userCoursesTable.expiresAt), gt(userCoursesTable.expiresAt, new Date())),
            eq(usersTable.isActive, true),
          ),
        );
      return rows.map((r) => r.id);
    }
    default:
      return [];
  }
}

export function safeAppThumbnailUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() !== value) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return undefined;
  }
  try {
    const base = new URL("https://gab-app.invalid/");
    const resolved = new URL(value, base);
    if (resolved.origin !== base.origin) return undefined;
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return undefined;
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
  const result = await db.transaction(async (tx) => {
    let recipients: number[];
    if (input.recipientUserIds && input.recipientUserIds.length > 0) {
      recipients = input.recipientUserIds;
    } else if (input.audienceType) {
      recipients = await resolveAudience(
        input.audienceType,
        input.audienceValue ?? null,
        tx,
      );
    } else {
      recipients = [];
    }
    const exclude = new Set(input.excludeUserIds ?? []);
    const finalRecipients = [...new Set(recipients)].filter((id) => !exclude.has(id));

    const [created] = await tx
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
      return {
        notificationId: 0,
        recipientCount: 0,
        deduped: true,
        recipientUserIds: [] as number[],
      };
    }

    if (finalRecipients.length > 0) {
      await tx
        .insert(notificationRecipientsTable)
        .values(finalRecipients.map((userId) => ({ notificationId: created.id, userId })))
        .onConflictDoNothing();
      await tx
        .update(notificationsTable)
        .set({ recipientCount: finalRecipients.length })
        .where(eq(notificationsTable.id, created.id));
    }

    return {
      notificationId: created.id,
      recipientCount: finalRecipients.length,
      deduped: false,
      recipientUserIds: finalRecipients,
    };
  });

  if (!result.deduped && result.recipientCount > 0) {
    const thumbnailUrl = safeAppThumbnailUrl(input.metadata?.thumbnailUrl);
    void dispatchPush(result.notificationId, result.recipientUserIds, {
      title: input.title,
      body: input.body ?? "",
      url: input.targetPath ?? undefined,
      tag: input.dedupeKey ?? `notif-${result.notificationId}`,
      image: thumbnailUrl,
      actions:
        input.type === "video"
          ? [
              { action: "watch", title: "شاهد الآن" },
              { action: "later", title: "لاحقاً" },
            ]
          : undefined,
    });
  }

  return {
    notificationId: result.notificationId,
    recipientCount: result.recipientCount,
    deduped: result.deduped,
  };
}
