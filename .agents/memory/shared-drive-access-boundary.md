---
name: Shared Drive access boundary
description: Why identical Drive video URLs can expose different viewer cohorts.
---

Google Drive iframe access is inherited from the Shared Drive containing the file. Moving or adding videos to another Shared Drive silently changes the effective viewer roster even when the player and URL format are identical.

**Why:** The production video library was spread across unrelated Shared Drives whose root member lists had very little overlap with the roster inherited by a known-working file.

**How to apply:** For restricted Drive playback, treat one canonical drive-level membership source (preferably a managed group) as the access boundary. Audit file `driveId` and inherited permissions before investigating URL parameters or player code.