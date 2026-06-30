---
name: Drive video streaming prod debug
description: How to diagnose course-video (private Google Drive) streaming failures that only reproduce in the published deployment.
---

# Diagnosing course-video streaming failures in production

The in-platform player streams PRIVATE Drive bytes through the Express
`/api/videos/:id/stream/:part` route, using the google-drive OAuth connector
(`streamDriveFile` + `getDriveAccessToken` in api-server `lib/googleDrive.ts`).

## Key non-obvious facts
- **Dev and prod use SEPARATE databases.** The dev DB has `SAMPLE_ID_x`
  placeholder Drive ids; only the PROD DB has real Drive file ids. So streaming
  CANNOT be reproduced in dev — you must test against prod data (query the prod
  DB read-only, or run an isolated harness against the live connector).
- **Connector identity differs by environment.** The token fetch uses
  `REPL_IDENTITY` ("repl ") in the workspace and `WEB_REPL_RENEWAL` ("depl ") in
  the deployment. A test that passes in the workspace only proves the
  `REPL_IDENTITY` path; the deployment path is a separate variable.
- **`JWT_SECRET` is NOT set**, so it falls back to the hardcoded default in
  `lib/auth.ts`. That default is shared by dev and prod, so a course-video
  stream token minted locally validates in prod too (useful for live testing).
- The google-drive connection can be inspected with `listConnections('google-drive')`;
  `metadata.assignments` lists the repl ids it is bound to, and `environment`
  shows production vs development.

## The trap that caused repeated frustration
Before this work the stream route + Drive helper returned bare
`res.status(4xx|5xx).end()` with **no logging**, so a real prod failure surfaced
to the user only as the generic client message "تعذر تشغيل الفيديو" and produced
**nothing in the deployment logs**. You cannot diagnose what isn't logged.

**Why:** the player is a native `<video>`; it cannot show server JSON, so the
ONLY place the real reason can appear is server logs — and those logs must be in
the DEPLOYED build. An old published build logs nothing no matter what you add now.

**How to apply:** every failure path in the stream flow now logs a `[video-stream]`
line (TOKEN ERROR / DRIVE ERROR + reason / DENY 4xx with which check failed /
STREAM ERROR / OK with content-length+range). When prod playback fails: ensure
the build with this logging is REPUBLISHED, reproduce, then read deployment logs
to get the exact reason instead of guessing.

## CONFIRMED root cause (June 2026) + fix
Logs showed `[video-stream] OK: streaming` repeatedly for the SAME file with
`clientRange: bytes=0-<size-1>` and `contentLength` = the FULL file (e.g. 376 MB).
The server was healthy (Drive 206 every time); the failure was the **response
size**: piping a multi-hundred-MB body through the autoscale proxy over a mobile
(LTE) connection is terminated before it finishes, so the native `<video>` shows
the generic error and then retries the whole file in a loop.

**Fix:** in `streamDriveFile`, clamp EVERY request to a bounded window
(`MAX_CHUNK = 2 MiB`). Parse the client Range; for forward/open-ended ranges cap
`end = start + MAX_CHUNK - 1`; forward suffix ranges (`bytes=-N`, small tail reads
for the MP4 `moov` atom) as-is. Always send a Range to Drive so it returns 206 +
the true `Content-Range` (with the real total), letting `<video>` learn the full
size and fetch the next window. Each response is now small and fast, and seeking
still works.

**Why it wasn't caught earlier:** dev/prod DBs are separate (dev has no real Drive
ids) and the isolated workspace test only ever requested small ranges, so the
full-file code path never ran until a real iPhone hit production.
