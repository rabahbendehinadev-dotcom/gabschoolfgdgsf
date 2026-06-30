---
name: Per-user query cache & account switching
description: Generated Orval query keys are NOT scoped by user id; per-user data must be cleared on login/logout to avoid cross-account leaks.
---

# Per-user query cache is not user-scoped

The Orval-generated TanStack Query hooks key queries only by endpoint + params
(e.g. `getGetNotificationsQueryKey({limit})`, `getGetUnreadNotificationCountQueryKey()`).
They do NOT include the logged-in user id. So per-recipient data (notifications,
unread count, anything personal) cached under user A can momentarily render for
user B after an account switch on the same device, before refetch completes.

**Rule:** any new per-user query relies on the cache being wiped on auth
transitions. `AuthProvider.setAuth` (login) and `logout` both call
`queryClient.clear()` for exactly this reason. Do not remove those clears, and do
not assume the generated key isolates users.

**Why:** architect review flagged this as a real privacy leak — notifications
carry actor/community-snippet context that must never cross accounts.

**How to apply:** if you add a personal/per-user endpoint, no extra key work is
needed *as long as* the clear-on-auth-change mechanism stays in place. If you ever
need to keep some cache across logout, scope that specific key by `user.id`
instead of weakening the global clear.

Related: Web Push deep-links are stored as leading-slash app-relative paths
(`/community`). The service worker must strip the leading slash and resolve
against `self.registration.scope` (not origin root) so links work under a
deployed sub-path, and must reject anything resolving outside the scope (external
open-redirect guard). Admin custom target paths are validated to be internal
(`/`-prefixed, no `//`, no scheme, no backslash/whitespace) on both client and server.
