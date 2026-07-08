---
name: International phone input country picker
description: react-phone-number-input's country picker is a native <select> overlay, not a searchable combobox — affects both real users and automated testing.
---

`react-phone-number-input`'s default `CountrySelect` renders a flag + chevron with an invisible native HTML `<select>` (full `<option>` list, value = ISO code like "GB") absolutely positioned on top for accessibility. It is NOT a custom searchable dropdown with a text filter box.

**Why:** Assuming a searchable combobox UI leads to wrong expectations/tests. Playwright automation that "clicks then types to search" behaves like rapid keypresses in a native select (jumps between options matching each keystroke), which can land on the wrong country (e.g. typing "United Kingdom" ending up on "Russia").

**How to apply:** When testing or automating country selection, use `select_option` (by label or ISO value) directly on the underlying `<select>` rather than simulating typed search. Real users get standard OS/browser native-select behavior (type-ahead jumps per keystroke, or scroll), which is expected UX for this library — no extra custom search UI needed unless explicitly requested.
