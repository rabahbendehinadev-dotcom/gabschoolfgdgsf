---
name: Mandatory push opt-in gate
description: The "mandatory yet never-trap" push-notification gate — which states block vs. dismiss vs. hide, and the permission-detection gotcha.
---

# Mandatory push opt-in gate

A post-login client gate (NotificationGate) forces users to decide on Web Push,
but must NEVER trap a user who physically cannot enable. The state machine maps
each situation to exactly one of: uncloseable / dismissible / hidden.

- **default** (undecided) → UNCLOSEABLE modal (no X, no backdrop click, no Esc). Only escape is granting.
- **denied** → DISMISSIBLE recovery modal with browser-settings steps + an "I enabled it" recheck. The recheck must NOT call `Notification.requestPermission()` again (it's a no-op while denied and feels broken); only re-read permission and subscribe once it is already `granted`.
- **iOS Safari & not standalone** → DISMISSIBLE install guide (user literally can't enable until they add to home screen).
- **unsupported browser OR no VAPID key configured** → HIDDEN (render nothing; in-app notifications still work).
- **already enabled** (server has a live subscription) or **this device already granted** → silently ensure-subscribe + HIDDEN.

**Why:** the product wants it mandatory, but iOS-not-installed / unsupported / VIP users could otherwise be locked out of the whole app behind an uncloseable modal.

## Permission-detection gotcha
`enablePushSubscription()` returns `null` for BOTH a permission denial AND a
silent failure (missing key, subscribe throw). After it returns null you MUST
re-read `Notification.permission` to branch: `denied` → recovery flow; still
`default` → user dismissed the OS prompt, keep the mandatory modal + a toast.

## "Don't nag every login" + one-time 7-day reminder
- Soft states (iOS / denied) persist a local dismissal so they don't reappear each login.
- Server computes `shouldRemind = !enabled && reminderSeenAt == null && accountAge >= 7d`. It overrides the local dismissal exactly once; dismissing then calls the reminder-ack endpoint so it never fires again.
- `enabled` is derived from a live `push_subscriptions` row with `failedAt IS NULL` — the only real proof you can reach the user. Permission/supported columns are telemetry only and can be stale across devices, so don't gate on them.

## VIP IP-policy vs push routes
Push status/subscription/reminder routes use `userAuthNoIpLimit` (JWT + active +
expiry enforced, only the VIP per-IP lock skipped). **Why:** a VIP on a rotating
mobile IP would otherwise get 403'd while trying to report push state / save a
subscription, which would trap them in the uncloseable modal.

## Robustness
Wrap every `localStorage` read/write in try/catch. A throw (Safari private mode,
locked-down browser) inside a dismiss handler would run before `setMode("hidden")`
and trap the user in an otherwise-dismissible modal.
