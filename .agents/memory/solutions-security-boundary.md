---
name: Solutions storage and concurrency
description: Non-obvious cross-feature disclosure and timestamp concurrency constraints for Solutions.
---

Keep Solutions media isolated at the shared storage boundary, not only its dedicated HTTP routes.

**Why:** Generic payment-proof and avatar readers accept stored object references. A member who knows a screenshot UUID could otherwise republish private bytes through those unrelated public readers, including after expiry.

**How to apply:** Any new generic storage reader, signer, optimizer, copier, or ACL updater must deny the Solutions namespace. Only the dedicated authorized adapter may resolve it. Preserve regression coverage for both newly submitted and previously persisted malicious references.

Use opaque PostgreSQL row versions rather than JavaScript Date equality for Solutions optimistic concurrency.

**Why:** PostgreSQL timestamps retain microseconds that JavaScript truncates, producing false conflicts; same-millisecond edits can also evade timestamp comparisons.

**How to apply:** Preserve row-version checks on asynchronous AI completion and publication. Test unchanged microsecond timestamps and concurrent updates with identical timestamps.

Treat strict-schema AI output as nondeterministic even when JSON mode is enabled; retry one schema-invalid response automatically, but never relax validation.

**Why:** The same complete notes and screenshots produced one invalid nested shape and then a valid complete article. A one-click composer should absorb this provider variance without accepting unsafe data or requiring a manual retry.

**How to apply:** Retry only JSON parsing/schema failures once with the same evidence and a stricter reminder. Keep URL provenance, image ownership, row-version, and publish-review checks unchanged.