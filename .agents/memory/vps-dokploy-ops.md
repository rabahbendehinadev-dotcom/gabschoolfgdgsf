---
name: VPS Dokploy operations
description: How the Hostinger VPS (Dokploy + Docker Swarm) deployment actually receives env/config, and the owner's video-source decision
---

# VPS Dokploy operations (online.gab-school.com)

- **Dokploy env panel edits did NOT reach the running swarm service** in at least one incident (panel showed new values, containers kept old ones). Working fix: `docker service update --env-add KEY=value online-minio-zcvr9e` (service name is misleading — it is the API server, not MinIO).
- **Why:** panel save/deploy linkage is unreliable or user edits a different scope; always verify with `docker inspect <container> | grep ENV` after any deploy.
- **Any Dokploy redeploy resets service env to the panel values** — env fixed via `docker service update` is lost unless the panel is corrected first. Before every deploy: confirm panel has `STORAGE_PROVIDER=s3` + S3_* vars + real `GOOGLE_CLIENT_ID` (long .apps.googleusercontent.com) + `GOOGLE_CLIENT_SECRET` + `GOOGLE_DRIVE_REFRESH_TOKEN` + `DISABLE_VIDEO_AUTO_MIGRATE=true`.
- Stale swarm task containers can keep serving traffic after `service update` (two `.1.*` containers at once); `docker rm -f` the old one if it lingers.
- **Owner decision (2026-07-20): videos stream LIVE from Google Drive on the VPS — no auto-migration to MinIO.** `DISABLE_VIDEO_AUTO_MIGRATE=true` gates it; `object_parts`/`hls_parts` were cleared in the VPS DB (safe: MinIO never had the video objects; Replit DB still has them). Quality selector only exists for HLS videos, so Drive-live = original quality, no menu — owner accepted this tradeoff.
- Drive streaming on VPS needed Google Drive API **enabled in the OAuth client's GCP project** (error was "Drive API has not been used in project ... or it is disabled", not invalid credentials).
- MinIO on VPS holds only image uploads (`gabschool/private/uploads/*`); reachable solely via dokploy-network DNS `minio:9000`.
