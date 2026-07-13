---
name: Video watermark protection
description: Durable rules for the anti-leak watermark and best-effort capture protections in the video players.
---

## Watermark identity rule
The moving watermark must always show the **viewer's** identity (username + email + user ID from auth context), never the post author's name. Author-name watermarks are useless for tracing leaks.
**Why:** the whole point is identifying who leaked a recording; community player originally watermarked the post author by mistake.

## Visibility-pause must exempt PiP
Pausing video on `visibilitychange`/`document.hidden` kills Picture-in-Picture (tab is hidden by design while PiP plays). Guard with `document.pictureInPictureElement === video || video.webkitPresentationMode === "picture-in-picture"` before pausing.

## getDisplayMedia guard
Monkey-patching `navigator.mediaDevices.getDisplayMedia` to detect in-browser capture is safe across effect re-runs ONLY if the cleanup restores the bound original. It cannot detect OS-level recorders — the watermark is the real defense there; be honest about this limit.

## Direct GCS presigned URL — never expose to browser
GCS `storage.googleapis.com` presigned URLs must NEVER be returned in API responses to the frontend. Download-manager browser extensions intercept any external media URL they see in network traffic. Always use `/api/videos/:id/stream-object/:part?token=...` server proxy instead; it streams GCS bytes through the server with `Content-Disposition: inline` so the storage URL is invisible to extensions.
**Why:** The `getSignedVideoURL()` presigned URL was previously returned directly in `streamParts`, allowing Video DownloadHelper and similar extensions to list the full MP4 file for download.
**How to apply:** `streamParts` building in `GET /videos/:id` must always produce same-origin `/api/videos/...` paths — never `storage.googleapis.com` URLs. The `streamGcsObjectToResponse()` function in `videoStorage.ts` handles Range requests and correct headers.

## Platform limits (PWA)
No native Android/iOS apps exist: FLAG_SECURE and native iOS screen-recording detection are impossible. iPhone native fullscreen (`webkitEnterFullscreen`) bypasses DOM overlays, so the watermark is invisible there unless container-fullscreen/theater mode is used — burned-in (server-side) watermarking is the only complete fix.
