---
name: GCS video migration (Drive → App Storage presigned)
description: How video bytes moved off the Drive proxy onto direct presigned GCS streaming; invariants to preserve
---

Videos migrated from Google Drive proxy streaming to Replit App Storage (GCS): admin copies Drive bytes → `PRIVATE_OBJECT_DIR/videos/{id}/part-{i}.mp4`, clients get presigned GET URLs (4h TTL, 50min server cache) and stream DIRECTLY from storage.googleapis.com — Range/206 fully supported, no Express proxy in the hot path.

**Invariants:**
- Drive file IDs / Drive URLs / objectPaths must NEVER reach the client (paid content). Public payload carries only presigned URLs.
- `objectParts` null ⇒ legacy Drive-proxy fallback still works; migration is per-video and reversible (PATCH with changed drive source clears objectParts + deletes objects).
- Object paths are DETERMINISTIC per video/part. Therefore concurrent-migration losers must NOT delete "their" copies (same paths as the winner's). Migrate route uses conditional `UPDATE … WHERE object_parts IS NULL` + re-reads the row before rollback deletion.
- Content-type must be forced to video/mp4 on upload (octet-stream breaks iPhone Safari).
- 50min URL cache < 4h TTL ⇒ served URLs always have ≥3h life; client onRetry refetch covers expiry.

**Why:** the Drive proxy on autoscale was the root cause of 4 days of student buffering complaints; direct GCS streaming removes the server from video delivery entirely.

**How to apply:** never reintroduce a server proxy for migrated videos; keep the presigned branch first in GET /videos/:id; schema changes reach prod only via Publish.
