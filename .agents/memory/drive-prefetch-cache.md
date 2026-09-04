---
name: Drive proxy streaming modes
description: Replit Autoscale uses short live-piped windows with bounded prefetch; suffix reads remain intact and VPS can opt into open-ended piping.
---

## Rule

On Replit Autoscale, serve open-ended browser ranges as live-piped 8 MiB windows
with a bounded next-window prefetch cache. Preserve suffix ranges exactly so
Safari can read a trailing MP4 `moov` atom. `DRIVE_STREAM_WINDOWED=false` is the
explicit escape hatch for a VPS that can safely sustain open-ended responses.

**Why:** Autoscale/reverse proxies can cut long 32–64 MiB responses mid-window,
especially for high-bitrate 1080p/4K files, leaving Safari buffering forever.
Buffering a whole chunk before sending also hurts first-byte latency, so current
windows are still live-piped; only the next window is buffered.

**How to apply:**
- Keep cache bytes bounded independently of concurrent live socket buffers.
- Abort the upstream Drive fetch when the client disconnects.
- Keep `X-Accel-Buffering: no`; VPS nginx must also disable proxy buffering.
- A seek may miss cache and live-fetch its first window, then resume forward prefetch.
- High-bitrate 4K still needs a lower rendition for weak connections; chunking cannot create bandwidth.
