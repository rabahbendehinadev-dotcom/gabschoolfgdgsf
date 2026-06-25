---
name: React.Fragment + Replit metadata plugin warning
description: Why rendering an imported Fragment in this repo triggers a React "invalid prop on Fragment" console warning, and how to avoid it.
---

The Replit dev (Vite) metadata plugin injects a `data-replit-metadata` attribute
onto effectively every JSX element it transforms — including `<Fragment>` /
`<React.Fragment>`. React only allows `key` and `children` on a Fragment, so this
produces a repeated dev-console warning: "Invalid prop `%s` supplied to
`React.Fragment`. React.Fragment can only have `key` and `children` props."

**Why:** It's the build plugin adding the attribute, not your code — so the
warning shows even when the Fragment usage is correct. Dev-only and harmless, but
noisy and easy to misdiagnose as a real bug.

**How to apply:** When you need keyed siblings inside a `.map` (e.g. an item +
separator), avoid a keyed `<Fragment>`. Prefer `flatMap` returning an array of
keyed elements, or wrap the group in a real DOM element (e.g. a `<div>`). Plain
shorthand `<>...</>` without a key is fine when no key is required.
