---
name: Wouter Link onClick interception
description: How wouter v3 Link decides whether to navigate, and how to make a Link act as an inline selector while keeping href as a real fallback.
---

# Wouter Link onClick interception

To make a card that is a wouter `<Link href=...>` act as an *inline selector*
(set state, no navigation) while keeping the href as a real fallback:

```tsx
<Link href={realHref} onClick={onSelect ? (e) => { e.preventDefault(); onSelect(); } : undefined}>
```

**Why this works (wouter v3 internals):** wouter's Link renders an `<a>` whose
onClick is wouter's OWN wrapper, not your function directly. That wrapper:
1. returns early (lets native anchor behavior happen) if the click has a
   modifier key (ctrl/meta/shift/alt), is not the primary button, or has a
   `target` — so **ctrl/cmd/middle-click still opens `href` in a new tab
   automatically**;
2. otherwise calls your `onClick`, then navigates only
   `if (!event.defaultPrevented)`.

So your `preventDefault()` runs only for plain left-clicks and cleanly
suppresses navigation. You do NOT need your own modifier-key guards — wouter
already does them before your handler runs (a code reviewer may wrongly claim
the modifier fallback is broken; it isn't, because of this ordering).

**How to apply:** Put an optional `onSelect` prop on shared card components
(e.g. `CategoryCard`). When absent, the Link navigates normally (e.g. the
/videos page); when present, it selects inline (e.g. the homepage). Keep
`href` pointing at the real destination so the fallback stays meaningful.
