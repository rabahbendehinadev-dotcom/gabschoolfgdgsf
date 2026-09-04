---
name: Adaptive HLS with Drive fallback
description: Adaptive HLS is the primary playback path; signed Drive MP4 range streaming is fallback only.
---

## Rule

Use token-gated adaptive HLS renditions in App Storage as the primary playback
path. Keep the original restricted Google Drive MP4 untouched and expose its
same-origin signed range stream only as a fallback when a part has not yet been
transcoded or HLS fails.

**Why:** Nearly every source MP4 has its `moov` atom at the tail and many sources
are high-bitrate 1080p/4K. Fixed-size Drive range windows cannot guarantee both
Safari metadata startup and uninterrupted playback: short windows intermittently
leave Safari at `0:00`, while long windows can be cut by Autoscale proxies or
outpace weak mobile connections. Adaptive 4-second segments remove that conflict.

**How to apply:**
- Generate downscaled H.264/AAC ladders offline; never transcode inside an Autoscale request.
- Discover completed parts from their storage marker so rollout does not depend on a production DB write.
- Keep playlists and segments same-origin, token-gated, and entitlement-checked; never expose Drive IDs or raw storage URLs.
- Preserve the Drive MP4 suffix-range behavior for fallback so Safari can read a trailing `moov`.
- Treat the bounded Drive prefetch/window cache as fallback resilience, not as the no-buffering solution.
