/*
 * Service worker.
 *
 * Three jobs:
 *  1. Make the app installable (PWA) — the presence of a `fetch` handler
 *     lets browsers expose the native install prompt.
 *  2. Cache IMAGES (thumbnails, covers, avatars) cache-first so they render
 *     instantly on repeat views instead of re-downloading every time.
 *     ONLY image requests are intercepted — API JSON, auth, and video
 *     streaming always go straight to the network, unchanged.
 *  3. Receive Web Push messages and show notifications, then deep-link the
 *     user into the app on click.
 */
var IMG_CACHE = "gab-img-v2";
var MAX_IMG_ENTRIES = 400;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop stale image caches from older SW versions.
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((n) => n.indexOf("gab-img-") === 0 && n !== IMG_CACHE)
            .map((n) => caches.delete(n)),
        );
      } catch (_e) {
        /* cache cleanup is best-effort */
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Intercept ONLY image loads (<img>, CSS backgrounds, posters). Everything
  // else — API calls, auth, video/audio streams, navigations — is untouched
  // and goes straight to the network exactly as before.
  if (req.method !== "GET" || req.destination !== "image") return;

  // VIP-gated community media must stay entitlement-checked on every load.
  if (req.url.indexOf("/community/media") !== -1) return;

  // Avatars live at a stable URL whose CONTENT changes when the user updates
  // their picture — cache-first would pin the old photo forever. Let the
  // browser's normal HTTP cache (24h) handle them instead.
  if (req.url.indexOf("/avatar") !== -1) return;

  event.respondWith(imageCacheFirst(req));
});

async function imageCacheFirst(req) {
  let cache;
  try {
    cache = await caches.open(IMG_CACHE);
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
  } catch (_e) {
    return fetch(req);
  }

  const res = await fetch(req);
  // Cache successful responses (incl. opaque cross-origin ones, e.g. external
  // thumbnail hosts). Errors are never cached so retries reach the network.
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone();
    cache
      .put(req, copy)
      .then(() => trimImageCache(cache))
      .catch(() => {
        /* quota errors are non-fatal */
      });
  }
  return res;
}

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_IMG_ENTRIES) return;
  // Cache keys are ordered oldest-first; evict the overflow.
  const excess = keys.length - MAX_IMG_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

// A push arrived: render a system notification. Payload shape (sent by the
// server): { title, body, url?, tag?, image?, actions? }. Everything is defensive so a malformed
// payload never throws inside the SW.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = {};
  }

  const title = payload.title || "GAB School";
  let image;
  if (typeof payload.image === "string") {
    try {
      if (payload.image.startsWith("/")) {
        image = new URL(payload.image.replace(/^\/+/, ""), self.registration.scope).href;
      } else {
        const candidate = new URL(payload.image);
        if (candidate.protocol === "https:") image = candidate.href;
      }
    } catch (_e) {
      image = undefined;
    }
  }
  const actions = Array.isArray(payload.actions)
    ? payload.actions
        .filter(
          (item) =>
            item &&
            typeof item.action === "string" &&
            typeof item.title === "string",
        )
        .slice(0, 2)
    : undefined;
  const options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/" },
    dir: "rtl",
    lang: "ar",
    badge: "./apple-touch-icon.png",
    icon: "./apple-touch-icon.png",
    image,
    actions,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking a notification focuses an existing app tab (navigating it to the
// deep link) or opens a new one. The target is resolved against the SW scope so
// app-relative paths (e.g. "/community") work even when the app is served under
// a sub-path.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "later") return;

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
