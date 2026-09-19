# Solutions techniques: deployment and operations

## Database rollout

The module is additive: `solutions`, `solution_images`, and `solution_taxonomies`.
It does not modify users, subscriptions, courses, Community, videos, or their data.
No sample solutions are seeded.

Schema source: `lib/db/src/schema/solutions.ts`. The isolated, transactional,
idempotent SQL is `lib/db/solutions-migration.sql`; it creates only module tables
and indexes. The metadata full-text GIN index is included in this SQL.

Before deployment, identify the actual database provider and target:

- **Replit-managed database:** use the normal Publish schema-diff flow after
  reviewing the additive development schema changes. Do not enable “overwrite
  production data,” use force-push, or add a startup migration hook.
- **This project's external VPS database:** the API's existing additive,
  idempotent startup migration path creates these tables and indexes before the
  server starts listening. This is required because Replit Publish does not
  manage the Dokploy PostgreSQL database. The standalone SQL remains available
  for an authorized operator to review or apply manually.

For a deliberately selected development connection:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/solutions-migration.sql
```

Verify the three tables and `solutions_discovery_idx`,
`solutions_filters_idx`, `solution_images_solution_idx`, and
`solutions_search_idx` exist. Re-run the module integration test against
development, then smoke-test empty listing, draft creation, and publication.
If rolling back application code, leave these isolated tables intact; do not
drop stored drafts or private media. This implementation made no production
database changes before this production fix. The startup migration does not
reset, replace, or delete existing production rows.

## AI configuration

Set server-only environment variables:

| Variable | Purpose |
| --- | --- |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Provisioned OpenAI-compatible integration endpoint |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Provisioned integration credential; never expose to the browser |
| `SOLUTIONS_AI_MODEL` | Optional text-and-vision model override; default `gpt-5.4-mini` |

Generation uses the OpenAI SDK with text and persisted screenshots as image
inputs, JSON output, and strict server-side Zod validation. Raw notes are saved
before model calls; failures preserve notes and images and expose a retryable
error. Unsupported generated download URLs are rejected. No external download
URLs are fetched. Model output is always a draft requiring human technical
review; AI never publishes or chooses a publicly disclosed cover.

Generation and publication use PostgreSQL's opaque MVCC row version for
optimistic concurrency, not JavaScript timestamps. Microsecond timestamps and
same-millisecond edits therefore do not cause false conflicts or missed edits.

## Storage and access

The existing storage provider and `PRIVATE_OBJECT_DIR` are reused. Server-side
uploads validate actual raster bytes with Sharp and re-encode to WebP under
`PRIVATE_OBJECT_DIR/solutions`. Database records contain metadata, not blobs.
Private storage must not have a bucket-wide public-read policy or an external
static-server mapping that bypasses the application.

The shared object resolver, parser, signer, normalization/ACL helpers, public
search, and generic downloader deny the Solutions namespace by default, including
encoded aliases. Only the dedicated Solutions adapter opts into resolving it.
This also blocks payment-proof, avatar, Community, thumbnail, optimizer, and
video/HLS helper paths from disclosing or copying private screenshots. Payment
submission rejects reserved references, and previously persisted malicious
payment/avatar references cannot be read. Generic storage routes also block the
namespace. Private image endpoints
require either `manage_solutions` admin permission or a valid entitled member
session; fetch them with existing authorization/device headers as blobs.
Only the explicitly selected cover of a published solution is publicly served.
Visitors receive an allowlisted teaser without content, raw notes, resources,
private screenshot identifiers, or storage paths. Active VIP/paid subscription
rules are reused without the Community-admin entitlement exception.

Super admins have full management access; Support admins need
`manage_solutions` explicitly. Upload and AI rate limits are per admin and
process-local. A multi-instance deployment should replace these with a shared
rate-limit store. Deleted image bytes remain private and inaccessible; configure
a deliberate orphan-media retention/cleanup policy rather than deleting
unrelated objects.

## Tests

```sh
pnpm --filter @workspace/api-server test:solutions
NODE_ENV=development pnpm --filter @workspace/api-server exec tsx scripts/test-solutions-integration.ts
```

The integration script needs the development database, configured private
storage, and the provisioned AI integration. It starts its own ephemeral test
server, exercises real text+vision generation, creates uniquely named fixtures,
and removes its fixtures afterward. It covers publication with microsecond
timestamps and rejection of stale versions even when timestamps are identical.
Never run it against production.

Browser regression script (requires Chromium available to Playwright):

```sh
NODE_ENV=development pnpm --filter @workspace/api-server exec playwright test scripts/solutions-browser.spec.ts --reporter=line --workers=1
```

Verification during implementation: nine Solutions unit tests, 21 Device
Security tests, three Community regression tests, and the real API integration
passed. Both application builds passed; repository-wide typechecks retain
pre-existing errors outside this module. Browser verification exercised genuine
admin login, clipboard/picker/drop uploads, removal/reordering, cover selection,
save/reload, real AI generation, editing, preview, explicit publication, visitor
search, and the locked detail page. The last run stopped on an ambiguous CTA
test selector; its selector was corrected but not rerun. Later browser mobile
assertions were therefore not reached. A separate 390px app-preview screenshot
confirmed the public library layout without runtime errors.