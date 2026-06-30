import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

/**
 * Web Push is strictly best-effort and layered on top of the DB notification
 * feed. If VAPID keys are not configured (e.g. local dev), every push call
 * becomes a no-op and in-app notifications keep working unchanged.
 */

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured === null) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      const subject = process.env.VAPID_SUBJECT || "mailto:notifications@gabschool.app";
      try {
        webpush.setVapidDetails(subject, pub, priv);
        configured = true;
      } catch {
        configured = false;
      }
    } else {
      configured = false;
    }
  }
  return configured;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Sends a push to every subscription owned by the given users. Prunes
 * subscriptions the push service reports as gone (404/410). Never throws.
 */
export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload,
): Promise<{ attempted: number; success: number }> {
  if (!isPushConfigured() || userIds.length === 0) {
    return { attempted: 0, success: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, userIds));

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
        if (status === 404 || status === 410) deadIds.push(s.id);
      }
    }),
  );

  if (deadIds.length > 0) {
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, deadIds));
  }

  return { attempted: subs.length, success };
}
