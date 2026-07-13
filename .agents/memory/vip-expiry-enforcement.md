---
name: VIP expiry enforcement pattern
description: How to gate VIP content correctly — isActiveVip() helper, optionalUserAuth gap, NULL date behaviour, and frontend pattern.
---

## Rule
Always call `isActiveVip(user)` from `artifacts/api-server/src/lib/vipUtils.ts` when deciding whether a user may access VIP content. Never compare `accountType === "vip"` directly.

**Why:** `optionalUserAuth` middleware does NOT reject expired users — only `userAuth` does (checks `subscriptionExpiresAt` at line ~74). Routes that use `optionalUserAuth` (e.g. GET `/videos/:id`) and the stream endpoint (no middleware at all) silently let expired VIPs through unless `isActiveVip()` is called explicitly.

**How to apply:**
- Server routes: `const isVipUser = isActiveVip(req.user);` (works with `req.user` and raw DB rows because `VipCheckable` accepts `Date | string | null | undefined`).
- Frontend: use `user.subscriptionIsExpired` (returned by `buildUserPayload()` in every auth response) AND `subscriptionExpiresAt > now` as a double-check for client-side gating.

## NULL subscriptionExpiresAt behaviour
`isActiveVip()` treats NULL/undefined `subscriptionExpiresAt` as **active** (returns `true`) so that lifetime + annual subscribers with no end date are never wrongly blocked. Monthly/annual users added before the field was populated (e.g. bulk-created May 5 2026 cohort) will appear active until Task #18 backfill sets their dates.

## Frontend UserProfile type
`subscriptionIsExpired?: boolean` is in `lib/api-client-react/src/generated/api.schemas.ts`. After editing that file, run `tsc -b lib/api-client-react --force` to regenerate `dist/*.d.ts` (the web package reads the compiled output, not the source).

## Test user
Dev DB user id=21: `subscriptionType=monthly`, `subscriptionStartedAt=2026-05-05`, `subscriptionExpiresAt=2026-06-05` — confirms as `isExpired=true, daysSinceExpiry=38` via `/api/admin/users/expired`.
