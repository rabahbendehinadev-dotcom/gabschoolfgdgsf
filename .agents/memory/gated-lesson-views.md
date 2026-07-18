---
name: Gated lesson/video views (client-side permission preservation)
description: How locked lessons and VideoDetail behave for non-subscribed users.
---

# Gated lesson/video views

## Current UX (restored user expectation)

All lesson cards/rows navigate to `/videos/:id` regardless of lock state.
`VideoDetail` calls `useGetVideo`; if server returns 403 it renders a **locked
preview page** (blurred thumbnail + lock/crown + upgrade button) using metadata
returned in the 403 body — never a full-screen redirect.

`CoursePlayer` continues to gate its in-page player (does not call `useGetVideo`
when `currentLocked`) to avoid unnecessary requests, but the sidebar list lets
users click any lesson and reach the standalone VideoDetail page.

## 403 response shape (GET /api/videos/:id)

When access is denied, the server returns:
```json
{ "message": "...", "preview": { "title", "thumbnailUrl", "accessType", "categoryName", "description" } }
```
`preview` never includes stream URLs, driveParts, objectParts, hlsParts, or
softwareLink — these are safe to expose (already visible in listing).

## Lock computation (client)
```
accessType = "visitor" → never locked
accessType = "vip"     → locked if !isVipUser
accessType = "normal"  → locked if !isLoggedIn || isDemo
```
Both `Videos.tsx/accessInfo` and `CourseDetail.tsx/computeLocked` implement
this — keep them in sync. `CoursePlayer/shouldFetch` uses the same logic.

**Why:** driveEmbedUrl used to leak in the list endpoint (old architecture).
That concern is resolved (GCS migration, list no longer returns stream URLs).
The 403 preview approach keeps security at the server boundary while giving
users the expected UX of seeing the lesson page before subscribing.
