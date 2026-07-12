---
name: Connector lookup fails with connector_names filter in dev
description: Why the connectors v2 API returns 0 items in development and how to query it
---

The connectors credential proxy (`/api/v2/connection?include_secrets=true&connector_names=google-drive`) returns **0 items in the development environment** when the connection is production-scoped — even though the connection shows `status: added`. Querying WITHOUT the `connector_names` filter returns the connection (env=production) WITH its access token; filter client-side by `item.connector_name`.

**Why:** the `connector_names` filter appears to also filter by current environment; the unfiltered listing does not. Cost a full debugging session ("Google Drive is not connected", itemCount: 0) while streaming worked fine in prod.

**How to apply:** in any server-side connector token fetch, list all connections and pick by `connector_name` client-side. If runtime still says "not connected" after that, `proposeIntegration` with the connection id re-binds the repl. The code_execution sandbox `listConnections()` has the same blind spot in dev.
