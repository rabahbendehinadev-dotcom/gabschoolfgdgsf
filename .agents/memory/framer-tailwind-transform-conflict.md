---
name: framer-motion vs Tailwind transform conflict
description: Why Tailwind transform utilities silently break on framer-motion elements, and how to combine absolute centering/rotation with framer animation.
---

# framer-motion vs Tailwind transform conflict

framer-motion controls an element's CSS `transform` via inline style. That
inline `transform` **clobbers Tailwind transform utilities on the SAME
element** — e.g. `-translate-x-1/2` (centering), `rotate-*`, `scale-*`. The
classic symptom: an absolutely-centered `motion.div` with `left-1/2
-translate-x-1/2` is no longer centered once framer animates it, and a
`rotate-[-5deg]` class is ignored.

**Why:** both Tailwind and framer write to the single `transform` property;
framer's inline style wins, so the Tailwind transform is dropped entirely (it
is not merged).

**How to apply — two options:**
1. Split across elements: a plain wrapper `<div>` holds the Tailwind
   positioning/centering (`absolute left-1/2 -translate-x-1/2 ...`), and a
   child `motion.*` holds the framer transforms. This is what `FloatDevice`
   in `Home.tsx` does (wrapper centers; inner `motion.div` does entrance
   scale/rotate; nested `motion.img` does the y-float).
2. Or move the transform values into framer itself: pass `rotate`, `x`, `y`,
   `scale` in the `initial`/`animate`/`style` objects instead of as Tailwind
   classes (e.g. `rotate` as a numeric prop, not `rotate-[-5deg]`).

Non-transform Tailwind utilities (width, z-index, opacity classes, etc.) are
unaffected and can stay on the motion element.
