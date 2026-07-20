---
name: S3 adapter createWriteStream "finish" fires before upload completes
description: Why awaiting the write stream's finish event on the S3/MinIO adapter silently swallows upload errors, and what to use instead.
---

# S3 adapter write pitfall

**Rule:** Never treat the S3 adapter's `createWriteStream` "finish" event as upload completion. For buffer-sized payloads, use `S3File.putBuffer(buf, {contentType, metadata})`, which awaits the actual `PutObjectCommand`.

**Why:** The adapter's `createWriteStream` returns a PassThrough feeding an `@aws-sdk/lib-storage` Upload. "finish" fires when the local stream flushes — before bytes reach MinIO. Upload errors arrive later via `pass.destroy(err)`, after a finish-based promise already resolved, so failed uploads get logged as successes. (Multipart PUT is atomic, so no partial data — but failures are silent and mis-counted.)

**How to apply:** Any server-side code that writes a complete in-memory buffer to storage on the S3 provider should call `putBuffer`. Streaming producers that genuinely need a Writable must arrange to await `upload.done()` instead of "finish".

Related: the background image optimizer (imageOptimize.ts) recompresses DB-referenced stored images in place (≤1280px WebP q82), tags metadata `gab-optimized=1` for idempotency, skips >25MB / non-image contentTypes to protect RAM, and runs only in production or with ENABLE_IMAGE_OPTIMIZE=true. e2e test: `artifacts/api-server/scripts/test-image-optimize.ts`.
