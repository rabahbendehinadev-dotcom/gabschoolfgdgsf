---
name: Locale preference precedence
description: Defines when browser language versus the saved account locale controls the student UI.
---

Use the browser's first supported AR/FR/EN language until the student explicitly chooses a language. Persist an explicit-selection marker with the account locale; only an explicitly selected server preference may override browser detection on another session or device.

**Why:** Existing accounts are backfilled with Arabic as the database default. Treating that default as a deliberate preference would force Arabic for French/English first-time visitors and violate automatic detection.

**How to apply:** Any locale migration, auth payload, or preference sync must preserve the distinction between a fallback/default locale and a manually selected locale.