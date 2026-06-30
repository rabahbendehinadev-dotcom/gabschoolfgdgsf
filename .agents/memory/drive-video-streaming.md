---
name: Private Drive video streaming (in-platform)
description: How course videos are streamed from private Google Drive without any Google UI; gotchas for MIME, tokens, and public schema.
---

# Private Drive video streaming

Course videos live in a PRIVATE Google Drive. The old Drive `/preview` iframe
needed the *viewer's* Google login, which iPhone Safari blocks (3rd-party
cookies) → "Impossible d'accéder à votre compte Google". So playback is now
fully server-proxied; the student's browser NEVER contacts Google.

## The contract (do not regress)
- The public API must NOT expose raw Drive URLs. The public `Video` and
  `PlaylistVideo` schemas have NO `driveEmbedUrl`/`driveParts`. The detail
  endpoint returns `streamParts: [{label,url}]` where each `url` is a
  same-origin tokenized `/api/videos/:id/stream/:part?token=...`.
  **Why:** any Drive URL/file-id reaching the client re-introduces the Google
  login surface and defeats the whole rebuild.
- Admin schemas (`AdminVideo`/`CreateVideoInput`/`UpdateVideoInput`) DO keep
  `driveEmbedUrl`/`driveParts` — that's the upload form where admins paste Drive
  links. Don't strip those.

## Stream endpoint
- `GET /api/videos/:id/stream/:part` has NO auth middleware on purpose — the
  signed token in `?token=` IS the auth (kind `"course-video"`, carries
  userId/videoId/part, 6h). It still does a FRESH entitlement re-check against
  usersTable on every request, so a downgraded/expired user stops streaming.
- OAuth access token is fetched from the Replit connector at runtime and cached
  only to expiry-60s (cache the token string, never a googleapis client object,
  so refresh keeps working).

## MIME gotcha (the iPhone-Safari killer)
Private Drive `alt=media` often returns `application/octet-stream`. iPhone
Safari's `<video>` refuses to play that. `streamDriveFile` only trusts an
explicit `video/*` upstream content-type and otherwise forces `video/mp4`.
**How to apply:** if Safari shows a black/un-playable player but Chrome works,
check the Content-Type being sent, not the bytes.

## orval query gotcha
The generated `useGetVideo` makes `queryKey` REQUIRED the moment you pass a
`query` options object (e.g. `{ enabled }`). Pass
`queryKey: getGetVideoQueryKey(id)` alongside it or typecheck fails.
