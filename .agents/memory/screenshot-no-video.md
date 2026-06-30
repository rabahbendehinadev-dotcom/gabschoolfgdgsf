---
name: app_preview screenshots can't play <video>
description: Why the screenshot tool always shows a video player's error/poster state, and how to actually verify playback.
---

The `app_preview` screenshot tool's headless browser is sandboxed to `localhost`
with no external network and does not load/play `<video>` media. A custom HTML5
player will therefore fire `onError` (or just never load metadata) and render its
**error / poster / spinner** state in every screenshot — even when the source is
fine.

Confirmed: a same-origin test mp4 served from Vite `public/` returned HTTP 200 +
`video/mp4` + 206 on Range via `curl`, yet the screenshot still showed the player's
error state. So a screenshot proves layout/RTL/error-UI render correctly, but it
**cannot** verify play/seek/controls/gestures.

**Why:** the capture browser blocks media; nothing to do with the player code.

**How to apply:** use screenshots only to check the player's static chrome
(layout, controls markup, error/empty states). To verify real playback, fullscreen,
PiP, seeking, and gestures, drive a real browser via the `testing` skill (Playwright)
or test manually — not the screenshot tool.
