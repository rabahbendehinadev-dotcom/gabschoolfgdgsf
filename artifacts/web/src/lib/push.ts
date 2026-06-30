import type { PushSubscriptionInput } from "@workspace/api-client-react/src/generated/api.schemas";

/**
 * Web Push helpers. Everything degrades gracefully: where push is unsupported
 * (e.g. the Replit dev-preview iframe, iOS without an installed PWA, or a browser
 * with permission denied) these functions return safe values instead of throwing,
 * so in-app notifications keep working unchanged.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * A fresh, server-ready subscription plus the endpoint of any *old* subscription
 * we had to replace (so the caller can prune the dead row server-side). Returns
 * `staleEndpoint: null` when nothing was replaced or the endpoint is unchanged.
 */
export type FreshSubscription = {
  sub: PushSubscriptionInput;
  staleEndpoint: string | null;
};

function serializeSubscription(subscription: PushSubscription): PushSubscriptionInput | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };
}

/**
 * True only when the live browser subscription was created against the CURRENT
 * VAPID public key. This is the crux of the old-user fix: a subscription bound to
 * a stale applicationServerKey looks valid to the browser but can never be
 * delivered to (the push service rejects the server's VAPID signature), so it
 * must be torn down and recreated. `options.applicationServerKey` is an
 * ArrayBuffer | null; older subscriptions report `null` and are treated as stale.
 */
function subscriptionMatchesKey(subscription: PushSubscription, vapidPublicKey: string): boolean {
  const existing = subscription.options?.applicationServerKey;
  if (!existing) return false;
  const want = urlBase64ToUint8Array(vapidPublicKey);
  const got = new Uint8Array(existing);
  if (got.length !== want.length) return false;
  for (let i = 0; i < want.length; i++) {
    if (got[i] !== want[i]) return false;
  }
  return true;
}

async function subscribeWithKey(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
}

/**
 * Silent self-heal used on every login when permission is ALREADY granted.
 * Guarantees the returned subscription is bound to the current VAPID key:
 *   - no subscription          → subscribe fresh
 *   - subscription, wrong key  → unsubscribe (capture old endpoint) + subscribe fresh
 *   - subscription, right key  → reuse as-is
 * Never prompts. Returns null when unsupported, not granted, or the key is missing.
 */
export async function ensureFreshSubscription(
  vapidPublicKey: string,
): Promise<FreshSubscription | null> {
  try {
    if (!isPushSupported() || !vapidPublicKey) return null;
    if (Notification.permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    let staleEndpoint: string | null = null;

    if (subscription && !subscriptionMatchesKey(subscription, vapidPublicKey)) {
      staleEndpoint = subscription.endpoint;
      try {
        await subscription.unsubscribe();
      } catch {
        /* ignore — we recreate below regardless */
      }
      subscription = null;
    }

    if (!subscription) {
      subscription = await subscribeWithKey(registration, vapidPublicKey);
    }

    const sub = serializeSubscription(subscription);
    if (!sub) return null;
    return {
      sub,
      staleEndpoint: staleEndpoint && staleEndpoint !== sub.endpoint ? staleEndpoint : null,
    };
  } catch {
    return null;
  }
}

/**
 * Forced re-subscribe for the manual "إعادة تفعيل الإشعارات" button. Requests
 * permission if needed, ALWAYS tears down any existing subscription first, then
 * subscribes fresh against the current key. Must be invoked from a user gesture.
 */
export async function resubscribePush(
  vapidPublicKey: string,
): Promise<FreshSubscription | null> {
  try {
    if (!isPushSupported() || !vapidPublicKey) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    let staleEndpoint: string | null = null;
    if (existing) {
      staleEndpoint = existing.endpoint;
      try {
        await existing.unsubscribe();
      } catch {
        /* ignore */
      }
    }

    const subscription = await subscribeWithKey(registration, vapidPublicKey);
    const sub = serializeSubscription(subscription);
    if (!sub) return null;
    return {
      sub,
      staleEndpoint: staleEndpoint && staleEndpoint !== sub.endpoint ? staleEndpoint : null,
    };
  } catch {
    return null;
  }
}

/**
 * Requests permission (if still "default") then returns a fresh, key-correct
 * subscription via {@link ensureFreshSubscription}. Returns null when
 * unsupported, denied, or the VAPID key is missing. Must be invoked from a user
 * gesture so the permission prompt is allowed.
 */
export async function enablePushSubscription(
  vapidPublicKey: string,
): Promise<FreshSubscription | null> {
  try {
    if (!isPushSupported() || !vapidPublicKey) return null;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    return ensureFreshSubscription(vapidPublicKey);
  } catch {
    return null;
  }
}
