---
name: Category-lessons display has TWO entry points
description: Where the public site renders a category's lessons, so display changes don't appear to "do nothing".
---

# Category lessons render in two places

When changing how a category's lessons are displayed in the public web app, you
must update BOTH entry points or the change appears to have no effect:

1. `artifacts/web/src/pages/public/Home.tsx` — the "ماركات الهواتف المدعومة"
   section. Clicking a brand card sets `activeCategory`, which swaps the WHOLE
   Home page to a focused single-category watch view (a "الرجوع إلى كل الماركات"
   back button + title + CoursePlayer); the hero, brands grid, features, and
   pricing are hidden while a category is active so other brands don't show.
   **This is the entry point users actually click** from the landing page.
2. `artifacts/web/src/pages/public/Videos.tsx` — `CategoryDetail`, reached via
   `/videos?categoryId=ID`.

Both now render the shared `CoursePlayer` (big player + side playlist) for the
selected category.

**Why:** A redesign that only touched `Videos.tsx` once looked completely
unapplied to the user, because they browse categories from the Home page, which
had its own separate inline lesson grid.

**How to apply:** Treat `CoursePlayer` as the single source of truth for the
category watch view and feed it from both pages (`lessons` + an `accessInfo`
helper). The two pages each define their own identical `accessInfo` gating
function — keep them in sync. Note: `Home` drives the view with its own
`activeCategory` state (no navigation to `/videos`), but syncs it with browser
history: `openCategory` does `pushState({brandView:id})`, a `popstate` listener
restores `activeCategory` from `history.state`, the in-page back button calls
`history.back()`, and initial state hydrates from `history.state?.brandView`.
Don't revert this to pure state — without it the browser Back button leaves the
site. Entering a category scrolls to top; returning scrolls to `#courses`.
