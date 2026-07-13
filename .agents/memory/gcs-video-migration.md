---
name: GCS video migration (Drive → App Storage presigned)
description: How video bytes moved off the Drive proxy onto direct presigned GCS streaming; invariants to preserve
---

Videos migrated from Google Drive proxy streaming to Replit App Storage (GCS): admin copies Drive bytes → `PRIVATE_OBJECT_DIR/videos/{id}/part-{i}.mp4`, clients get presigned GET URLs (4h TTL, 50min server cache) and stream DIRECTLY from storage.googleapis.com — Range/206 fully supported, no Express proxy in the hot path.

**Invariants:**
- Drive file IDs / Drive URLs / objectPaths must NEVER reach the client (paid content). Public payload carries only presigned URLs.
- `objectParts` null ⇒ legacy Drive-proxy fallback still works; migration is per-video and reversible (PATCH with changed drive source clears objectParts + deletes objects).
- Object paths are DETERMINISTIC per video/part. Therefore concurrent-migration losers must NOT delete "their" copies (same paths as the winner's). Migrate route uses conditional `UPDATE … WHERE object_parts IS NULL` + re-reads the row before rollback deletion.
- **DEV AND PROD SHARE ONE BUCKET, with overlapping video ids** (dev seed ids 2-12 vs prod real ids 10+). ALL bucket mutations (delete, copy/overwrite, auto-migration) must be gated to NODE_ENV === "production". A dev-side failure-cleanup delete once wiped prod objects for videos 10-12 → "تعذر تشغيل الفيديو" in production. `deleteVideoObjects` is a no-op in dev; auto-migration + admin migrate-storage are production-only. NEVER delete on failure at deterministic paths — orphans are harmless, deleted prod bytes break playback.
- NEVER auto-reset `object_parts` by comparing counts against raw `drive_parts` length: resolveVideoParts FILTERS entries with empty urls, so valid-parts count < raw JSON count for some videos ⇒ a `obj < drv` reset query re-migrates the same ~7GB forever on every restart (infinite loop, saturates egress, causes buffering).
- Content-type must be forced to video/mp4 on upload (octet-stream breaks iPhone Safari).
- 50min URL cache < 4h TTL ⇒ served URLs always have ≥3h life; client onRetry refetch covers expiry.
- Integrity can be audited any time with `artifacts/api-server/scripts/verify-gcs-integrity.ts` (compares GCS object sizes vs Drive sizes; needs /tmp/prod_videos.json exported from prod DB).

**Why:** the Drive proxy on autoscale was the root cause of 4 days of student buffering complaints; direct GCS streaming removes the server from video delivery entirely.

**How to apply:** never reintroduce a server proxy for migrated videos; keep the presigned branch first in GET /videos/:id; schema changes reach prod only via Publish.
