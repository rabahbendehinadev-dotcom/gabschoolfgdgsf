/*
 * Minimal service worker — its ONLY job is to make the app installable (PWA).
 *
 * It intentionally caches NOTHING: every request goes straight to the network.
 * The mere presence of a `fetch` handler is what lets browsers expose the
 * native install prompt. This keeps the app's behaviour, authentication and
 * subscriptions completely unchanged (no offline cache, no stale content).
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
