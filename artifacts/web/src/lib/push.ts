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
 * Requests permission (if still "default"), subscribes through the active
 * service worker, and returns a serialized subscription ready to POST to the
 * server. Returns null when unsupported, denied, or the VAPID key is missing.
 * Must be invoked from a user gesture so the permission prompt is allowed.
 */
export async function enablePushSubscription(
  vapidPublicKey: string,
): Promise<PushSubscriptionInput | null> {
  try {
    if (!isPushSupported() || !vapidPublicKey) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

    return {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };
  } catch {
    return null;
  }
}
