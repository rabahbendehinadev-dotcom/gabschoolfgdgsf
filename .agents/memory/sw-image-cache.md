---
name: Service worker image caching
description: Rules for the PWA sw.js cache-first image cache — what must be excluded and why
---

# Service worker image caching (sw.js)

The PWA service worker caches images cache-first (cache name `gab-img-vN`, trimmed to 400 entries). It intercepts ONLY `GET` requests with `request.destination === "image"` — API JSON, auth, and video streaming are never touched (video Range requests have destination "video"/"" so they can't be intercepted by this filter).

**Mandatory exclusions:**
- URLs containing `/community/media` — VIP-gated media must stay entitlement-checked on every load.
- URLs containing `/avatar` — avatars are a MUTABLE stable URL (`/api/users/:id/avatar`); cache-first would pin the old photo forever. Browser HTTP cache (24h) handles them.

**Why:** `/api/storage/objects/<uuid>` thumbnails are immutable UUID objects (served with 30-day immutable Cache-Control) so forever-caching is safe; avatars and gated media are the two exceptions.

**How to apply:** when adding any new image-serving route whose content can change under a stable URL, or whose access is entitlement-gated, add an exclusion in `sw.js` and bump `IMG_CACHE` version to purge already-cached entries. Admin uploads (thumbnails/covers/tool images) are compressed client-side via `lib/imageCompress.ts` (max 1280px WebP, fallback to original); payment proofs are intentionally NOT compressed (evidentiary fidelity).
