---
name: Monorepo TS project references — stale declarations
description: Why web typecheck fails with phantom "property does not exist" after codegen or lib edits, and the fix.
---

# Stale lib declarations in the pnpm monorepo

After changing source in `lib/*` (e.g. `lib/db`, `lib/api-spec`) or running OpenAPI codegen
(`pnpm --filter @workspace/api-spec run codegen`), the web app's typecheck can fail with
phantom errors like `Property 'X' does not exist on type ...` even though the code is correct.

**Why:** web uses TypeScript **project references**, so `tsc` reads the *built* `dist/*.d.ts`
declaration files of the libs, not their source. Runtime (vite/tsx) resolves the libs' `.ts`
source via package `exports`, so the app *runs* fine without a rebuild — only typecheck is stale.

**How to apply:** after any codegen or `lib/*` source change, run `pnpm run typecheck:libs`
(which runs `tsc --build`) to regenerate the lib `dist` declarations before trusting/​running
the web typecheck. Then `pnpm --filter @workspace/web run typecheck`.
