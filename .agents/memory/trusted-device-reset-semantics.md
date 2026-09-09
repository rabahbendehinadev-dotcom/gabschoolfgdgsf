---
name: Trusted-device reset semantics
description: Distinguishes session logout, admin reset, explicit revoke, and replacement for trusted-device identities.
---

Normal logout revokes only the current authentication session and preserves the persistent device credential. Admin reset is different from explicit revoke: reset must retire the stored credential hash so the same browser can re-enrol with a rotated credential, while explicit revoke must keep the hash recognizable so that device remains denied.

Ignoring a blocked-device alert resolves it out of the active alert queue into history while preserving its credential hash and denied authorization state. Sharing-risk levels and frequent-change badges are presentation-only summaries; they must never feed back into login authorization.

One physical PHONE/COMPUTER family may contain multiple browser credentials, but a new browser is never auto-merged from fingerprints or IP. It remains blocked until an authorized Admin explicitly attaches it to the existing family. Full device replacement remains a separate action that revokes every browser and session in the old family.

**Why:** Treating reset and revoke identically either locks the reset browser out forever or lets an explicitly revoked device immediately reclaim the empty slot. Browser-exposed fingerprints are forgeable and cannot safely prove two browsers are on one physical device. Concurrent stale Admin actions can otherwise create conflicting families or leave a category without a trusted device.

**How to apply:** Serialize every PHONE/COMPUTER family mutation on the user lock and enforce one trusted family per category in transaction policy rather than a one-row unique index. Require expected-state checks, audit browser attachment, revoke whole-family sessions on reset/replacement, and test logout/relogin, browser attachment, reset/re-enrolment, explicit revoke, ignore, and concurrent Admin actions together.