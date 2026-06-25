---
name: db schema change requires lib/db rebuild for consumer typecheck
description: After editing lib/db schema, consumer typecheck reads stale declarations until lib/db is rebuilt.
---

After changing a Drizzle schema in `lib/db/src/schema/*`, a per-package typecheck
of a consumer (e.g. `pnpm --filter @workspace/api-server run typecheck`) can still
report the OLD table shape ("Property 'x' does not exist", insert overload errors).

**Why:** consumer tsconfigs use TS project `references` to `../../lib/db`, and
`lib/db` is `composite` + `emitDeclarationOnly` (outputs `lib/db/dist/*.d.ts`).
The per-package typecheck resolves the referenced project via its stale built
`.d.ts`, not the edited source. `drizzle-kit push` (which reads source) succeeding
does NOT update these declarations.

**How to apply:** after a schema edit, rebuild lib/db declarations before relying
on consumer typecheck:
`pnpm exec tsc -b lib/db/tsconfig.json --force`
(or run the root `pnpm run typecheck`, whose `typecheck:libs` = `tsc --build`
rebuilds libs first). Then re-run the consumer typecheck.
