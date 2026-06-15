---
name: Projecting live DOM onto an angled device-photo screen
description: How to overlay an animated DOM layer (e.g. a terminal) onto the glass of a 3D-perspective device PHOTO so it looks like on-screen content, responsively.
---

# Projecting live DOM onto an angled device-photo screen

When a hero uses a photorealistic device render (PNG shown at a 3D angle) and
you need *live, animated* content "inside" the screen (scrolling terminal, video,
UI), you cannot just absolutely-position a flat overlay — the screen is a
perspective quad, not an axis-aligned rect. Use a **2D projective transform
(homography) baked into a CSS `matrix3d`** that maps a rectangle onto the four
screen-glass corners.

**Recipe (see `artifacts/web/src/pages/public/Home.tsx`):**
- Store the glass corners as **fractions of the image box** (`SCREEN_CORNERS`,
  order TL, TR, BL, BR). Tune them by screenshot iteration; getting them slightly
  wrong makes the overlay spill onto the metal bezel and look broken.
- Measure the rendered image box with a `ResizeObserver` (offsetWidth/Height) so
  the projection is **fully responsive**; convert fractions → px each resize.
- Compute the homography rect→quad (adjugate / basisToPoints / general 2D
  projection) and emit `matrix3d(...)` with `transform-origin: 0 0`. The overlay
  element is `width:w; height:h` (the full image box) and the matrix squishes that
  whole box onto the glass quad, so nothing renders outside the screen.
- Put `matrix3d` on a **plain wrapper div** and animate only opacity/scale on an
  inner `motion.*` child — never animate `transform` on the matrix3d element
  (framer would clobber the matrix). See `framer-tailwind-transform-conflict.md`.
- Keep the overlay inside the SAME float/entrance transform chain as the `<img>`
  (wrap both in one floating container) so it tracks the device as it animates.
- Guard rendering on `w > 0 && h > 0` to avoid a degenerate matrix on first paint.

**Why:** a homography is the exact (and only) affine-free mapping of a rectangle
to an arbitrary convex quad; matrix3d can carry it, giving pixel-accurate,
GPU-composited results that survive responsive resizes and ancestor transforms.
