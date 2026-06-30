/*
 * Minimal service worker.
 *
 * Two jobs:
 *  1. Make the app installable (PWA) — the mere presence of a `fetch` handler
 *     lets browsers expose the native install prompt. It caches NOTHING: every
 *     request goes straight to the network, so behaviour, auth and
 *     subscriptions stay completely unchanged (no offline cache, no stale data).
 *  2. Receive Web Push messages and show notifications, then deep-link the user
 *     into the app on click. Push is strictly additive: if it is never used the
 *     app works exactly as before.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op on purpose: we do NOT call event.respondWith(), so the browser
  // performs its normal network request. This handler exists only to satisfy
  // the PWA installability requirement.
});

// A push arrived: render a system notification. Payload shape (sent by the
// server): { title, body, url?, tag? }. Everything is defensive so a malformed
// payload never throws inside the SW.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = {};
  }

  const title = payload.title || "GAB School";
  const options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/" },
    dir: "rtl",
    lang: "ar",
    badge: "./apple-touch-icon.png",
    icon: "./apple-touch-icon.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking a notification focuses an existing app tab (navigating it to the
// deep link) or opens a new one. The target is resolved against the SW scope so
// app-relative paths (e.g. "/community") work even when the app is served under
// a sub-path.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const scope = self.registration.scope;
  const rawTarget = (event.notification.data && event.notification.data.url) || "/";
  // App paths are stored leading-slash app-relative (e.g. "/community"). Strip the
  // leading slash so the path resolves UNDER the SW scope (which may be a deployed
  // sub-path) rather than the origin root. Anything that resolves outside the
  // scope (e.g. an absolute external URL) is rejected back to the scope root.
  const resolved = new URL(String(rawTarget).replace(/^\/+/, ""), scope).href;
  const targetUrl = resolved.startsWith(scope) ? resolved : scope;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch (_e) {
              /* navigation may be blocked across some browsers — ignore */
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
