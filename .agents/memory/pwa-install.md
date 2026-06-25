---
name: PWA install (manual button)
description: How the web artifact is made installable and why the install button looks "missing" in the Replit preview.
---

The web artifact is an installable PWA with a **manual** install button (no auto banner).

- `beforeinstallprompt` does NOT fire inside the Replit dev-preview iframe (nor in the
  headless screenshot browser). The `InstallAppButton` therefore renders `null` there by
  design (`!canInstall && !isIOS`). It only appears on a real top-level HTTPS visit
  (published app or the dev domain opened in its own tab) on Chromium browsers.
  **How to apply:** to verify the button/iOS-modal visuals during development, temporarily
  force `supported = true` + open the iOS dialog, screenshot, then revert. Do not conclude
  it's broken just because the preview hides it.

- Installability uses a deliberately **minimal service worker** (`public/sw.js`) whose
  `fetch` handler is a no-op (never calls `respondWith`) — it caches nothing, so it cannot
  serve stale content or affect auth/API/subscription requests. Its only job is to satisfy
  Chrome's "has a SW with a fetch handler" install criterion.
  **Why:** a caching SW would risk stale app shells and break the strict "don't change
  functionality" constraint.

- Manifest + apple-touch-icon links are injected at runtime from `import.meta.env.BASE_URL`
  (not hard-coded in index.html) so they stay correct across deep-linked SPA routes and any
  base path. The web artifact's `BASE_PATH` is `/` in both dev and prod.
