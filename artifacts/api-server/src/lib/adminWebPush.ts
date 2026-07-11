import webpush from "web-push";
import { db, adminPushSubscriptionsTable } from "@workspace/db";
import { isNull, inArray } from "drizzle-orm";
import { isPushConfigured, getVapidPublicKey, type PushPayload } from "./webPush";

export { isPushConfigured, getVapidPublicKey };
export type { PushPayload };

/**
 * Send a push notification to every admin device that has an active
 * subscription. Dead endpoints (404/410/403/400) are marked failed so they
 * are skipped on the next send and surface as "broken" in the UI.
 * Never throws — push is always best-effort.
 */
export async function sendPushToAdmins(
  payload: PushPayload,
): Promise<{ attempted: number; success: number }> {
  if (!isPushConfigured()) return { attempted: 0, success: 0 };

  const subs = await db
    .select()
    .from(adminPushSubscriptionsTable)
    .where(isNull(adminPushSubscriptionsTable.failedAt));

  if (subs.length === 0) return { attempted: 0, success: 0 };

  const data = JSON.stringify(payload);
  const deadIds: number[] = [];
  let success = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
        success += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410 || status === 403 || status === 400) {
          deadIds.push(s.id);
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    await db
      .update(adminPushSubscriptionsTable)
      .set({ failedAt: new Date() })
      .where(inArray(adminPushSubscriptionsTable.id, deadIds));
  }

  return { attempted: subs.length, success };
}
