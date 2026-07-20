---
name: Pre-existing typecheck errors (not a green baseline)
description: Known unrelated typecheck failures so they aren't mistaken for regressions.
---

# Typecheck is not green at baseline

Both `@workspace/api-server` and `@workspace/web` have pre-existing typecheck errors unrelated
to most feature work. Treat these as baseline noise, not regressions introduced by your change:

- api-server: codebase-wide `TS2872 "This kind of expression is always truthy"` from the
  convention `error instanceof Error ? error.message : "Unknown error" || "..."` in nearly every
  route's catch block; plus `subscriptionStartedAt`/`string|string[]` errors in `admin.ts`,
  `videoStorage.ts`, `auth.ts`.
- web: `Users.tsx` `phone`, `Videos.tsx` `softwareLink`, `Dashboard.tsx` `monthly` — schema/UI
  drift in pages unrelated to categories.

FIXED (July 2026, no longer baseline): the `TS2308` ambiguity in `lib/api-zod/src/index.ts` —
orval emits 5 names in BOTH `generated/api` (zod consts) and `generated/types` (plain types);
resolved by explicitly re-exporting the zod versions from `./generated/api` after the two
`export *` lines. This unblocked `dist/*.d.ts` emission (noEmitOnError was silently keeping
consumer typechecks on a stale dist → phantom TS2305 "no exported member"). If codegen adds
new colliding names, extend that explicit re-export list, then `tsc -b lib/api-zod --force`.

**How to apply:** when judging whether your change is type-clean, confirm your *own* edited lines
produce no errors and that any reported errors also appear in files you never touched. Don't fix
these codebase-wide patterns as part of unrelated work (and never edit auth routes to do so).
