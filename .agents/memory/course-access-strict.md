---
name: Course access strict control
description: How course access is enforced, what was the security bug, and the new audit/RBAC system.
---

## Stream-level course gate (authorizeStreamRequest)
`authorizeStreamRequest` (used by /videos/:id/stream/:part and HLS endpoints) now
re-checks `user_courses` for course-linked videos BEFORE the VIP/subscription check.
Added `playlistId` + `categoryLinkedPlaylistId` (via left join with categories) to
the SELECT inside that function. Course videos require explicit DB entry even at byte-streaming level.

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

## Effective access rule
Course-linked content requires both a currently valid paid subscription and an
active, unexpired matching `user_courses` row. This applies to course/video
lists, details, streams, HLS, and direct R2 URL issuance. R2 URL expiry is
capped by the earliest subscription/course expiry.

## Production compatibility
Production can contain legacy subscription rows with missing dates and can lack
a deterministic plan-to-course mapping.

**Why:** Legacy monthly/annual periods must be reconstructed from the original
paid activation, never from the current date. The reliable precedence is the
stored subscription start, then the earliest historical course grant. Generic
account creation is not activation evidence. Guessing a date or course scope can
grant access beyond what an admin intended.

**How to apply:** If a legacy monthly/annual expiry is missing, calculate it as
one clamped calendar month/year after the original activation. Use the same
account-level activation for every course so later grants cannot reopen an
expired period. At `now >= end`, deny access. Truly ambiguous dates remain
denied. In the admin inconsistency report, a reconstructed legacy subscription
with exactly one active, existing course uses that assignment as its legacy
scope without requiring a modern plan. Zero, multiple, duplicate, or dangling
course relationships remain flagged and read-only during reconciliation.

## Admin panel path
`/gab-ctrl-9x` (obfuscated) — not `/admin`
