---
name: Mobile video player UX (tap-to-play & fullscreen)
description: iOS/Android gotchas for the custom <video> player — fullscreen tiering and the waiting-spinner that hides the play button.
---

# Mobile custom-<video> player gotchas

These bit the in-platform CourseVideoPlayer; they generalize to any custom HTML5 video UI.

## iOS Safari fullscreen
- A plain element (e.g. the player container `<div>`) has **no** `requestFullscreen` and **no** `webkitRequestFullscreen` in iOS Safari. Only the `<video>` element supports fullscreen, via `video.webkitEnterFullscreen()`.
- **Trap:** `await req?.call(el)` where `req` is undefined **silently no-ops** (no throw) — so a `try/catch` that expected to fall back to `webkitEnterFullscreen` in the `catch` NEVER runs, and the button appears dead on iPhone.
- **Fix pattern (tiered):** (1) `if (typeof el.requestFullscreen/webkit/ms === "function")` → use container fullscreen (desktop + Android Chrome), optional landscape orientation lock; (2) else `video.webkitEnterFullscreen()` (iPhone) — play first if paused; (3) else in-page **Theater Mode** (own state → `position:fixed; inset:0; height:100dvh; z-index:9999`, lock `body.overflow`, Escape exits) for in-app webviews with no fullscreen API.
- Native iOS video fullscreen does NOT fire `fullscreenchange`, so `isFullscreen` stays false during it — that's fine; the native UI owns the screen. Keep `theater` as a separate state from `isFullscreen`.

## Tap-to-play / the perpetual spinner
- If `waiting` starts `true` and is only cleared on `play`/`playing`, a paused-but-ready video shows the buffering spinner forever and the center Play button (gated on `!waiting`) never appears → taps feel dead.
- **Fix:** clear `waiting` on `loadedmetadata` + `loadeddata` + `canplay`; `onWaiting` still re-shows the spinner during mid-playback buffering.
- The touch gesture layer's single-tap should call `togglePlay()` immediately when `video.paused` (YouTube-mobile feel), not just toggle controls. Keep double-tap-seek gated to `!paused` so the first tap on a paused video always plays.
