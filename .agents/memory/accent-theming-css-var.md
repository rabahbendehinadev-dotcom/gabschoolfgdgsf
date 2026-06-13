---
name: Per-item accent theming via --accent CSS var + color-mix
description: How dynamic per-record accent colors and hover states are driven in the web artifact, and the Wouter Link focus-ring gotcha.
---

# Per-item accent theming (category cards, and any DB-driven accent UI)

When a component needs a per-record dynamic accent color (e.g. each course category has its
own `accentColor`), drive it through a CSS custom property set inline, not through Tailwind
arbitrary-value classes:

- Set `style={{ ["--accent" as string]: color } as React.CSSProperties}` on the element root.
- Static accent styles (gradients, glows, icon color) go in inline `style` using
  `color-mix(in srgb, <color> N%, transparent)` — works for hex/rgb/hsl and degrades safely.
- Hover/focus/active states that depend on the accent go in a real CSS rule (a
  `@layer components` block in `artifacts/web/src/index.css`) referencing `var(--accent)` +
  `color-mix()`.

**Why:** Tailwind v4 arbitrary classes like `hover:shadow-[...color-mix(...var(--accent)...)]`
are unreliable to generate, and `group-hover` cannot change inline styles. Plain CSS rules that
read `var(--accent)` are guaranteed to apply and keep the dynamic color out of the class string.
`color-mix()` is well-supported in the Replit preview browsers (modern Chromium/Safari/Firefox).

**How to apply:** always sanitize the DB-provided color before injecting it into a CSS string
(accept only `#hex` / `rgb()/rgba()` / `hsl()/hsla()`, else fall back to a known palette color) —
malformed values silently invalidate the decorative declarations.

## Wouter Link focus ring gotcha
The focusable element is the `<a>` that `<Link>` renders, NOT the inner card element. A
`.card:focus-visible` rule will never fire for keyboard users. Pass a className to `<Link>`
(wouter forwards it to the anchor) and target `.link-class:focus-visible .card { ... }`. Also
give the Link `block h-full` so an inner `h-full` card actually stretches to the grid row height.
