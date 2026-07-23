---
name: Admin Course Permissions System
description: admin_course_permissions table + enforcement for per-admin course grants
---

## Root Cause of "غير معروف" Bug
The detail endpoint `/admin/users/:id/detail` selected grantedBy, grantSource, reason, expiresAt, status 
from DB but the `courses.map()` at line ~1206 only returned `{playlistId, title, grantedAt}` — 
dropping all attribution fields. Fix: return all fields in the map.

## admin_course_permissions Table
- Created via migration in `artifacts/api-server/src/index.ts`
- Schema in `lib/db/src/schema/adminCoursePermissions.ts`
- UNIQUE constraint on (admin_id, playlist_id)
- super_admin bypasses all permission checks automatically

## Backend Enforcement Pattern
`hasAdminCoursePermission(adminId, role, playlistId, field)` in admin.ts:
- Returns true immediately for super_admin role
- Checks admin_course_permissions table for others
- Used in grant-course (POST) and revoke-course (DELETE) endpoints → returns 403 if not permitted

## Frontend Filtering
UserDetailModal fetches `/api/admin/my-permissions/courses` → `{ all: boolean, playlistIds: number[] }`
- `all: true` for super_admin → shows all playlists in grant modal
- `all: false` → filters available playlists to permitted ones only

## grantedBy Storage
Now stores `displayName ?? username` (not just username) via `adminDisplayName(req)` helper.
Also stores `adminId` and `adminRole` in user_courses table (new columns: admin_id, admin_role).

## Old Records Display
`grantedBy = null` → shows "عملية قديمة — المسؤول غير مسجل" in CourseAccess tab
`grantedBy = "name"` → shows "name — Role" (role from adminRole field if present)

## Permissions Endpoints
- GET /admin/my-permissions/courses → my permitted playlist IDs
- GET /admin/admins/:id/course-permissions → course perms for an admin
- POST /admin/admins/:id/course-permissions → add perm (upsert by conflict)
- DELETE /admin/admins/:id/course-permissions/:playlistId → remove perm
