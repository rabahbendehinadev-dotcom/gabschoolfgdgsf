---
name: Drive proxy streaming modes (pipe vs windowed+prefetch)
description: Default Drive proxy now pipes ranges live to EOF; windowed chunks + prefetch cache are an opt-in fallback for response-cutting platforms (Replit Autoscale).
---

## Current default: live piping (2026-07-20)
`streamDriveFile` pipes the Drive response body straight to the client
(`pipeline(Readable.fromWeb(resp.body), res)`), serving open-ended ranges to EOF.

**Why:** the old code buffered a whole 32 MB chunk (`await resp.arrayBuffer()`)
before sending the FIRST byte → multi-second time-to-first-byte at every range
request → constant "plays a second then stalls" on the VPS.

**How to apply:**
- Backpressure is automatic through `pipeline`; memory per stream ≈ socket buffers.
- Client disconnect aborts the upstream Drive fetch via AbortController on `res close`.
- `DRIVE_STREAM_WINDOWED=true` restores the old capped-window + prefetch behavior —
  REQUIRED if ever deployed on Replit Autoscale again (it cuts off long responses).
- Any nginx in front must keep `proxy_buffering off` on the API path.

## Legacy windowed mode (below) — only active with DRIVE_STREAM_WINDOWED=true

## The Problem
`MAX_CHUNK = 8 MB` ≈ 1 minute of video at typical mobile bitrates. When the browser
finishes playing that chunk it requests the next one. The server must:
1. Validate token
2. Query DB (2 round-trips: video access type + user subscription)
3. Call Drive API for the next range

Total latency: ~1–2 s → visible freeze every ~1 minute of playback.

## The Fix (in `googleDrive.ts`)
`prefetchMap: Map<"fileId:startByte", PrefetchEntry>` — when serving chunk [start, end],
immediately kick off an async background fetch for chunk [end+1, end+1+8MB].
Next browser request hits the cache → instant response, zero Drive latency.

**Why:** eliminates Drive round-trip latency at chunk boundaries for unmigrated videos.

**How to apply:**
- Bounded to 15 entries × 8 MB = 120 MB max RAM.
- Each entry auto-expires after 3 min (`PREFETCH_TTL_MS`).
- Suffix-range requests (`bytes=-N`, moov atom reads) bypass the cache.
- Seeking causes a cache miss → live fetch → prefetch forward again.
- This is a FALLBACK for unmigrated videos. GCS presigned URLs (post-migration) need no proxy at all.
