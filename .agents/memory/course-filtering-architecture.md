---
name: Course content filtering architecture
description: How courseId/playlistId filtering works end-to-end for separating course content
---

## Rule
Category and video filtering MUST happen at the DB level, not client-side.
Never fall back to "show all" when `courseSectionIds` is empty — that's the bug.

## Architecture
- `categories.linkedPlaylistId` → FK to playlists.id (the "new" model)
- `playlists.categoryId` → FK to categories.id (legacy single-category model, still supported in admin)
- Public API filters by `linkedPlaylistId` only (new model preferred)

## Endpoints
- `GET /api/categories?playlistId=X` → categories where `linkedPlaylistId=X`
- `GET /api/videos?playlistId=X` → resolves category IDs via `linkedPlaylistId`, filters at DB
- `GET /api/videos?playlistId=X&categoryId=Y` → validates Y belongs to X, returns 403 if not

## Frontend
- `useGetCategories({ playlistId: courseId })` → course-scoped categories
- `useGetVideos({ playlistId: courseId, ... })` → course-scoped videos
- Client-side filtering is NOT used

## Admin workflow for linking categories to courses
Admin creates/edits categories at `/gab-ctrl-9x/categories?courseId=X`.
The form auto-sets `linkedPlaylistId=X` from URL context. Existing categories
without `linkedPlaylistId` can be re-edited from the course-specific admin page.

**Why:** Without DB-level filtering, switching courseId in URL leaks content across courses.
