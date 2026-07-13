---
name: VIP expiry enforcement pattern
description: How to gate VIP content correctly — isActiveVip() helper, optionalUserAuth gap, NULL date behaviour, and frontend pattern.
---

## Rule
Always call `isActiveVip(user)` from `artifacts/api-server/src/lib/vipUtils.ts` when deciding whether a user may access VIP content. Never compare `accountType === "vip"` directly.

**Why:** `optionalUserAuth` middleware does NOT reject expired users — only `userAuth` does (checks `subscriptionExpiresAt`). Routes that use `optionalUserAuth` (e.g. GET `/videos/:id`) and the stream endpoint (no middleware at all) silently let expired VIPs through unless `isActiveVip()` is called explicitly.

**How to apply:**
- Content-gating routes: use `userAuth` middleware + `isActiveVip(req.user)`.
- Profile/identity routes (`/auth/me`): use `userAuthAllowExpired` so expired users still get their payload with `subscriptionIsExpired: true` and can show a renewal prompt.
- Frontend: use `user.subscriptionIsExpired` (returned by `buildUserPayload()` in every auth response) AND `subscriptionExpiresAt > now` as a double-check.

## NULL subscriptionExpiresAt behaviour
`isActiveVip()` treats NULL/undefined `subscriptionExpiresAt` as **active** (returns `true`) so that lifetime subscribers with no end date are never wrongly blocked. Monthly/annual users with NULL dates (e.g. bulk-created May 2026 cohort) will appear active until a backfill sets their dates.

## Frontend UserProfile type
`subscriptionIsExpired?: boolean` is in `lib/api-client-react/src/generated/api.schemas.ts`. After editing that file, run `tsc -b lib/api-client-react --force` to regenerate `dist/*.d.ts` (the web package reads the compiled output, not the source).

