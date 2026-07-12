---
name: Drive proxy pre-fetch cache
description: Why "plays 1 min then freezes" happens and how the prefetch cache fixes it for unmigrated Drive-proxied videos.
---

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
