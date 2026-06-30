import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { and, inArray, isNull } from "drizzle-orm";

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
 * Sends a push to every ACTIVE subscription (failed_at IS NULL) owned by the
 * given users, soft-failing dead ones so they stop being retried and surface as
 * "broken" in the admin dashboard (and re-heal on the user's next login). Never
 * throws.
 *
 * Failure handling:
 *  - 404 / 410 (Gone)          → always soft-fail; the endpoint truly no longer exists.
 *  - 403 / 400 (VAPID/auth)    → a single stale-key subscription returns this, BUT so
 *    does a *server-side* VAPID misconfiguration — for which EVERY endpoint would
 *    return it. To avoid mass-marking every user broken during such an outage, we
 *    suppress 403/400 pruning ONLY when it looks like a global outage: the whole
 *    attempted batch was rejected AND the batch was large enough to be meaningful
 *    evidence (>= GLOBAL_OUTAGE_MIN_BATCH). A tiny all-rejected batch — e.g. one
 *    old user with a single stale-key sub, or an admin single-user test push — is
 *    far more likely to be a genuinely-broken endpoint, so we still prune it.
 *    Callers that target a single user on purpose (admin test push) can force
 *    pruning via `pruneRejectedEvenIfAllFail` so the user flips to "broken".
 *  - anything else             → left untouched (transient; retried next send).
 */
// Below this batch size, an all-403/400 result is treated as genuinely-broken
// per-subscription endpoints rather than a server-wide VAPID misconfiguration.
const GLOBAL_OUTAGE_MIN_BATCH = 3;

export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload,
  opts: { pruneRejectedEvenIfAllFail?: boolean } = {},
): Promise<{ attempted: number; success: number }> {
  if (!isPushConfigured() || userIds.length === 0) {
    return { attempted: 0, success: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(
      and(
        inArray(pushSubscriptionsTable.userId, userIds),
        isNull(pushSubscriptionsTable.failedAt),
      ),
    );

  if (subs.length === 0) return { attempted: 0, success: 0 };

  const data = JSON.stringify(payload);
  const goneIds: number[] = []; // 404/410 — definitely dead
  const rejectedIds: number[] = []; // 403/400 — VAPID/auth mismatch (maybe global)
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
        if (status === 404 || status === 410) goneIds.push(s.id);
        else if (status === 403 || status === 400) rejectedIds.push(s.id);
      }
    }),
  );

  const deadIds = [...goneIds];
  // Treat 403/400 as a likely *global* VAPID misconfig (and therefore skip
  // pruning) only when the ENTIRE batch was rejected AND that batch was large
  // enough to be meaningful evidence. A small all-rejected batch — or a caller
  // that deliberately targets one user (admin test push) — is instead treated
  // as genuinely-broken per-subscription endpoints and pruned.
  const allRejected = rejectedIds.length === subs.length;
  const looksGlobalOutage =
    allRejected && subs.length >= GLOBAL_OUTAGE_MIN_BATCH && !opts.pruneRejectedEvenIfAllFail;
  if (rejectedIds.length > 0 && !looksGlobalOutage) {
    deadIds.push(...rejectedIds);
  }

  if (deadIds.length > 0) {
    await db
      .update(pushSubscriptionsTable)
      .set({ failedAt: new Date() })
      .where(inArray(pushSubscriptionsTable.id, deadIds));
  }

  return { attempted: subs.length, success };
}
