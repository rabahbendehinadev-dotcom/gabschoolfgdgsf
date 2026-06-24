---
name: Gated lesson/video views (client-side permission preservation)
description: How locked lessons must behave in the public web UI so client gating mirrors the server 403.
---

# Gated lesson/video views

When rendering any lesson/video player in `artifacts/web` (e.g. CoursePlayer,
VideoDetail, LessonCard), locked content must NOT mount the player iframe and
must NOT call the single-video endpoint (`useGetVideo`). Gate both on the
client's `accessInfo(video)` result (`videoLocked`) before rendering/fetching —
show a locked/subscribe overlay instead.

**Why:** The list endpoint (`/videos`) returns `driveEmbedUrl` for ALL videos,
but the single endpoint (`/videos/:id`) is the one that enforces the real 403
gating (vip/normal) and returns the sensitive extras (`driveParts`,
`softwareLink` for VIP). If a locked lesson mounts the player or fetches the
detail, you'd both leak playable URLs and fire requests the server will reject.
Keeping the iframe/fetch behind the same `accessInfo` check makes the client UI
consistent with the server's permission model.

**How to apply:** Compute `accessInfo` once; for locked lessons render the
locked pane only; pass `query.enabled = !locked` to `useGetVideo` (TanStack v5
also requires a `queryKey` in that options object — use
`getGetVideoQueryKey(id)`). Never widen access logic here without matching a
server-side change.
