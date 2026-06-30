---
name: Web Push global-outage soft-fail guard
description: How sendPushToUsers decides whether an all-failed push batch is a global VAPID outage (skip pruning 403/400) vs genuinely-broken endpoints (prune).
---

The 403/400 "suppress pruning during a global VAPID outage" guard must key on the
failure *shape*, not on "the whole batch was rejected":

- `looksGlobalOutage = success === 0 && (goneIds.length + rejectedIds.length === subs.length) && rejectedIds.length >= GLOBAL_OUTAGE_MIN_BATCH && !pruneRejectedEvenIfAllFail`
- 404/410 ("gone") endpoints are ALWAYS pruned regardless.

**Why:** the earlier version used `rejectedIds.length === subs.length`. A real
server-side VAPID misconfiguration rejects *every* endpoint with 403/400, but if
that same fan-out also contains a few genuinely-gone 404/410 endpoints,
`allRejected` flips to false and the code would soft-fail (mark broken) every
403/400 subscription — exactly the mass-marking the guard exists to prevent.

**How to apply:** any change to push soft-fail/pruning must preserve these three
conditions together (nothing delivered + all failures classified + enough 403/400
rejections). Admin single-user test push passes `pruneRejectedEvenIfAllFail: true`
to force a broken user to flip to "broken" regardless of the guard.
