---
name: Google Sign-In (GIS ID-token flow)
description: How Google login is wired here and the Google Cloud config it requires
---

This project's Google Sign-In uses the **Google Identity Services (GIS) ID-token
flow**, not the OAuth authorization-code/redirect flow.

- Frontend renders the official GIS button (`google.accounts.id.initialize` +
  `renderButton`) which returns a `credential` (JWT ID token) to a JS callback.
- Backend (`POST /auth/google`) verifies it with `OAuth2Client.verifyIdToken`
  using `audience: GOOGLE_CLIENT_ID`.

**Why it matters:**
- There is **no callback/redirect URI**. Do not configure "Authorized redirect
  URIs" in Google Cloud — they are unused. Configure **Authorized JavaScript
  origins** instead (scheme+host, no path, no trailing slash).
- `GOOGLE_CLIENT_SECRET` is **not needed** by this flow. Only the Client ID is.
- The Client ID is a **public** value (served to the browser via
  `/auth/google/config` and embedded in the button), so it's fine as a plain
  shared env var rather than a secret.

**How to apply / debug:**
- Browser console `GSI_LOGGER: The given origin is not allowed for the given
  client ID` + a 403 means the current origin isn't in Authorized JavaScript
  origins. Add the exact dev domain (`$REPLIT_DEV_DOMAIN`) and the production
  domain. Each Replit dev domain change requires re-adding the origin.
- Google login uses the same persistent trusted-device credential as password
  login. The generated request transport attaches it independently from the
  Google ID token, auth session, and IP address.
- Never replace every Google HTTP 403 with one frontend message. Preserve the
  API's machine-readable security code and localized message; 403 can represent
  several distinct security decisions.

**Why:** A status-only frontend override once displayed an obsolete
maximum-device warning even though the API returned the newer trusted-device
reason. This hid the real denial cause and made correct server behavior appear
broken.
