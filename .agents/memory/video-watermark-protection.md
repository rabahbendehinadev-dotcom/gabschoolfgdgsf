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

## Platform limits (PWA)
No native Android/iOS apps exist: FLAG_SECURE and native iOS screen-recording detection are impossible. iPhone native fullscreen (`webkitEnterFullscreen`) bypasses DOM overlays, so the watermark is invisible there unless container-fullscreen/theater mode is used — burned-in (server-side) watermarking is the only complete fix.
