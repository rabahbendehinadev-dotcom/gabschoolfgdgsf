---
name: Web Push stale-VAPID self-heal & broken-state pruning
description: Why old PWA users silently stop receiving push, and the client heal + server soft-fail rules that fix it
---

# Web Push stale-VAPID self-heal

**Root cause of "old users get no push when phone locked":** the browser keeps a
`PushSubscription` bound to whatever `applicationServerKey` it was created with.
If the app's VAPID public key later changes (or the sub predates correct config),
the client happily re-saves that *stale-key* endpoint. Server `webpush.send` to it
returns **403/400** (NOT 404/410), so naive pruning (which only handles 404/410)
never expires it → permanent silent failure.

## Client rule (push.ts)
Never trust "permission granted" or a cached sub. Byte-compare the live
subscription's `options.applicationServerKey` against the current VAPID key; on
mismatch (or null sub) `unsubscribe()` + resubscribe and return the dead
`staleEndpoint` so the caller can DELETE it server-side. `ensureFreshSubscription`
is silent + granted-only (for login/gate auto-heal); `resubscribePush` is forced
(for the manual "إعادة تفعيل الإشعارات" button). Save the fresh sub BEFORE
deleting the stale endpoint so a mid-way failure is recoverable next gate run.

## Server rule (webPush.ts sendPushToUsers)
- Send only to subs with `failedAt IS NULL`.
- 404/410 → always mark `failedAt` (truly gone).
- 403/400 → **per-subscription stale key vs global VAPID misconfig is ambiguous**,
  because a server-wide bad key makes EVERY endpoint 403. So suppress pruning only
  when it *looks global*: the whole batch was rejected AND batch size
  >= `GLOBAL_OUTAGE_MIN_BATCH` (=3). A tiny all-rejected batch (one old user with a
  single stale sub) is pruned. Callers that intentionally target one user
  (admin test-push) pass `{ pruneRejectedEvenIfAllFail: true }` to force pruning.

**Why the threshold + override (not just "skip when allRejected"):** the original
"mark nothing when allRejected" guard meant an admin single-user test push (subs
== 1, all 403) never flipped the user to `broken` — defeating the admin
health/test workflow this feature exists for. One sub failing 403 is not evidence
of a global outage; you need several. **How to apply:** keep both mechanisms when
touching this logic — don't collapse back to a bare allRejected check.

## Admin pushState derivation (admin.ts)
active sub present → `enabled`; no active sub but a historical (failed) one exists
→ `broken`; permission granted + no sub → `missing`; permission denied → `denied`;
else `none`. `broken` only ever appears once `failedAt` is stamped, so the
server-side pruning rules above are what make the admin badge truthful.
