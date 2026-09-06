---
name: Trusted-device reset semantics
description: Distinguishes session logout, admin reset, explicit revoke, and replacement for trusted-device identities.
---

Normal logout revokes only the current authentication session and preserves the persistent device credential. Admin reset is different from explicit revoke: reset must retire the stored credential hash so the same browser can re-enrol with a rotated credential, while explicit revoke must keep the hash recognizable so that device remains denied.

**Why:** Treating reset and revoke identically either locks the reset browser out forever or lets an explicitly revoked device immediately reclaim the empty slot. Valid signed credentials that are no longer recognized must also be rotated rather than adopted by a new device row.

**How to apply:** Serialize every PHONE/COMPUTER slot mutation on the user lock, retain the partial unique trusted-category index, revoke old sessions atomically, and test logout/relogin, reset/re-enrolment, explicit revoke, and concurrent approvals together.