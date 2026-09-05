---
name: Direct private R2 video
description: Accepted architecture for newly uploaded course videos after successful production playback.
---

Newly uploaded course videos should transfer directly between the browser and the private R2 bucket: multipart presigned PUT for admin uploads and short-lived presigned GET after the existing lesson entitlement checks. Do not route their media bytes through the VPS, and do not expose permanent/public object URLs.

**Why:** The Video 64 production pilot eliminated buffering and remained stable on both iPhone/mobile and desktop. The owner explicitly accepted the short-lived direct bearer URL tradeoff for this architecture.

**How to apply:** Keep legacy Google Drive videos on their existing path and preserve the Video 64 pilot behavior. Use server-owned random keys, one-time persisted upload sessions, private bucket access, and database object keys rather than stored presigned URLs for new R2 uploads.