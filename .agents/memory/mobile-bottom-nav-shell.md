---
name: Mobile native chrome (bottom nav + persistent shell)
description: How the mobile/tablet bottom navigation and persistent public layout fit together; breakpoint + shell conventions to keep in lockstep.
---

# Mobile native chrome

Public web app (artifacts/web) has a native-app-style bottom navigation (`BottomNav.tsx`) shown only on phones + tablets, plus a compact header on the same range.

## Breakpoint convention: `lg`, not `md`
The mobile↔desktop chrome switch happens at the **`lg`** breakpoint, not `md`:
- `BottomNav` is `lg:hidden`.
- `Navbar` header links/actions are `hidden lg:flex`; the hamburger row + dropdown are `lg:hidden`; header height/logo shrink below `lg`.
- `PublicLayout` reserves bottom space with `pb-[calc(70px_+_env(safe-area-inset-bottom))] lg:pb-0`.

**Why:** product wants the native bottom bar on phones AND tablets, desktop unchanged.
**How to apply:** when touching nav/header/layout responsiveness, gate on `lg` and keep all four spots in lockstep — mixing in `md:` produces a tablet state showing BOTH the desktop top links and the bottom bar, or content hidden behind the fixed nav.

## Persistent public shell
All public routes render inside ONE `PublicLayout` via a nested `<Switch>` in `PublicRoutes`, reached through a trailing catch-all `<Route><PublicRoutes/></Route>` in the outer router. Auth (`/login`, `/register`, `/complete-phone`) and admin (`/gab-ctrl-9x*`) routes stay in the outer `<Switch>` BEFORE the catch-all.

**Why:** keeps Navbar/Footer/BottomNav mounted across public navigations, so the header doesn't replay its entry animation on every tab tap and the BottomNav framer `layoutId="bottomnav-active-pill"` slides between tabs.
**How to apply:** add new public pages inside the nested Switch (NOT as their own `<PublicLayout>` wrapper); keep auth/admin routes above the catch-all so they aren't swallowed.

## Safe area + notes
- Bottom nav uses inline `paddingBottom: env(safe-area-inset-bottom)` (index.html already has `viewport-fit=cover`).
- `/notifications` is a placeholder page (no backend) with an empty state; the حسابي tab points to `/dashboard` when logged in, `/login` otherwise.
