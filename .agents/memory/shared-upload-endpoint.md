---
name: Shared presigned-upload endpoint is intentionally unauthenticated
description: Why the object-storage upload URL route must not be locked behind adminAuth.
---

# Storage upload URL route is shared between admin and regular users

The api-server's presigned-upload route (`POST /storage/uploads/request-url`, called from the
client as `/api/storage/n-url`) has NO `adminAuth`/`userAuth` middleware, and that is deliberate.

**Why:** regular (non-admin) users upload subscription **payment proofs** from the public
`Subscribe.tsx` page through this same endpoint. Admin features (category images, video
thumbnails) reuse it too. Locking it behind `adminAuth` would break the subscription flow.

**How to apply:** if a reviewer/architect flags the upload endpoint as "should be admin-only",
do NOT add `adminAuth` to it — that violates the don't-touch-auth/subscriptions constraint.
Per-feature authorization lives on the *feature* routes (e.g. `/admin/categories` is admin-only),
not on the shared upload-URL route. SVG is rendered via `<img>` (no script execution) so it is an
accepted upload type for category images.
