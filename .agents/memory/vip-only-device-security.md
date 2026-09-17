---
name: VIP-only device security
description: Defines who receives trusted-device enforcement and how VIP status transitions preserve login access.
---

Trusted-device limits, device credentials, IP reputation blocks, and Security-page account blocks apply only to active, non-expired VIP users. Other users still require a valid authentication session but must not be denied because of device state.

**Why:** Reusing protected device rows for unrestricted users either preserved Device Security outside VIP or left stale PHONE/COMPUTER slots that locked users out when VIP was renewed.

**How to apply:** Unprotected logins use records excluded from VIP slots and Admin Security calculations. On a non-active-VIP login, retire old protected slots under the user-row lock. Re-read VIP status after locking before any transition mutation.