---
name: GIS custom-button overlay
description: How to fully restyle Google's Sign-In button without breaking the credential flow, and the two traps that make it falsely show "unavailable".
---

# Custom-styled Google Sign-In button (GIS) overlay technique

To give Google's Sign-In a fully custom look while keeping the genuine Google
Identity Services (GIS) ID-token credential flow untouched: render your own
presentational button, then layer the REAL GIS-rendered button transparently on
top of it (`opacity-0`, scaled up to cover the visual button, higher z-index) so
the actual user gesture lands on Google's element. Never re-implement the OAuth
call yourself.

## Trap 1 — the GIS target node must be mounted unconditionally
`google.accounts.id.renderButton(el, ...)` needs `el` to already exist in the DOM
when it runs. Do NOT gate the mount of that `<div ref>` on a "ready"/success
state that only flips true *after* renderButton succeeds. That is a deadlock:
node not mounted → renderButton sees a null ref → never marks ready → node never
mounts. Mount the GIS target whenever the client ID is present; layer
loader/error/disabled visuals *over* it instead of replacing it.

**Why:** burned multiple iterations on a false "unavailable" state where the ref
was null because its branch only rendered in the "ready" state.

## Trap 2 — unauthorized origin makes renderButton fail in dev
In the dev preview the JS origin is usually NOT in the Google Cloud "authorized
JavaScript origins" yet, so GIS logs a 403 (`GSI_LOGGER: The given origin is not
allowed...`) and renderButton throws / inserts no child — even though it works in
production once the domain is added. So:
- Treat only **script-load failure** (the GIS `<script>` itself failing) as the
  real "unavailable" signal.
- Do NOT require renderButton to succeed or to insert a child node before showing
  the button. Wrap the renderButton call in try/catch (non-fatal).

**How to apply:** any time you wrap or restyle GIS, keep the target mounted, flip
"ready" on script load (not on render result), and remember the dev 403 is a
pending user-side Google Cloud origins config, not a bug in the code.
