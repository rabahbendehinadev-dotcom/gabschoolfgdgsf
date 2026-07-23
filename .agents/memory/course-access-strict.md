---
name: Course access strict control
description: How course access is enforced, what was the security bug, and the new audit/RBAC system.
---

## The bug that was fixed
`index.ts` had a migration that ran on EVERY server restart and granted playlist 5 (Flash & Decoding) to ALL users with `account_type = 'vip'`. This was the root cause of new accounts getting automatic course access after an admin activated their VIP status and the server restarted.

**Fix:** Removed the migration entirely. Added log message: `"[migrations] Course access: strict mode — no automatic grants on startup."`

## New DB columns
- `user_courses`: `granted_by TEXT`, `grant_source TEXT DEFAULT 'manual'`, `reason TEXT`, `expires_at TIMESTAMP`, `status TEXT DEFAULT 'active'`
- `admins`: `display_name TEXT`, `role TEXT DEFAULT 'super_admin'`, `last_login_at TIMESTAMP`, `last_login_ip TEXT`
- New table: `course_access_logs` (id, user_id, playlist_id, action, admin_id, admin_name, admin_role, grant_source, reason, ip, user_agent, extra_data, created_at)

## Role system
- `super_admin` — full access (grant, revoke, create admins)
- `subscription_manager` — can grant/revoke (not blocked by role check)
- `support` — read-only; attempt to grant/revoke → 403

Role is checked in `req.admin.role` (set by adminAuth middleware from DB).

## New API endpoints (all adminAuth protected)
- `POST /admin/users/:id/grant-course` — {playlistId, reason?, expiresAt?}
- `DELETE /admin/users/:id/revoke-course/:playlistId`
- `GET /admin/course-access-logs?userId=&playlistId=&limit=&offset=`
- `GET /admin/course-access-report` — {total, suspicious, tracked, rows}
- `GET /admin/admins` — list without password hashes
- `POST /admin/admins` — create; super_admin only
- `PATCH /admin/admins/:id` — update role/displayName; super_admin only

## Access check in videos.ts (unchanged but correct)
Course-linked videos check `user_courses` table exclusively (no VIP fallback).
Non-course videos: VIP for `accessType=vip`, VIP or `subscriptionType!='demo'` for normal.

## Admin panel path
`/gab-ctrl-9x` (obfuscated) — not `/admin`
