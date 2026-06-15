---
name: Projecting live DOM onto an angled device-photo screen
description: How to overlay an animated DOM layer (e.g. a terminal) onto the glass of a 3D-perspective device PHOTO so it looks like on-screen content, responsively.
---

# Projecting live DOM onto an angled device-photo screen

> **Outcome in the Cours Online hero: this technique was ultimately REMOVED.**
> After several iterations the user firmly decided the hero devices must stay
> CLEAN — no DOM/animation layer projected onto any device screen. The iPhone
> shows its baked lock screen; the iPad uses a generated clean tablet image
> (`hero_tablet_clean.png`, no baked text). Codes (`MatrixRain`) and locks
> (`FallingLocks`) live ONLY in the background. Do NOT re-add screen overlays to
> the hero device screens. The recipe below is kept only as a general technique
> for other contexts.

When a hero uses a photorealistic device render (PNG shown at a 3D angle) and
you need *live, animated* content "inside" the screen (scrolling terminal, video,
UI), you cannot just absolutely-position a flat overlay — the screen is a
perspective quad, not an axis-aligned rect. Use a **2D projective transform
(homography) baked into a CSS `matrix3d`** that maps a rectangle onto the four
screen-glass corners.

**Recipe (see `artifacts/web/src/pages/public/Home.tsx`):**
- Store the glass corners as **fractions of the image box** (e.g.
  `IPHONE_SCREEN_CORNERS` / `TABLET_SCREEN_CORNERS`, order TL, TR, BL, BR). Getting
  them slightly wrong makes the overlay spill onto the metal bezel or off the
  device. **Do NOT eyeball them** — measure empirically: overlay a percent grid +
  candidate quad onto the actual PNG with PIL/ImageDraw, save to /tmp, and view it;
  iterate until the quad hugs the glass.
- **Glare/reflection extends the glass — measure the FULL screen rectangle, not
  where the visible content stops.** A baked screenshot often has a bright diagonal
  reflection over one part of the glass with little/no readable content there. The
  true screen edge runs *under* that reflection out to the aluminium bezel. If you
  stop the quad where the legible code ends, an **opaque** overlay covers only part
  of the screen and the baked reflection (and any faint baked content) shows beside
  it. For an opaque overlay that must hide baked content, size the quad to the full
  glass; only inset conservatively when the overlay is translucent.
- **A quad that covers only PART of the screen reads as a floating panel, not the
  device's display.** Symptom: user says the overlay "floats above / outside" the
  phone. Cause: the bottom corners stop partway down (e.g. mid-screen) so an opaque
  overlay fills only the top, and the baked lower glass shows below it. Fix: extend
  the quad to the FULL glass (top-left corner → just below the home indicator) AND
  build the overlay as a full-bleed screen UI (wallpaper + status bar + clock +
  content + home indicator) that fills edge-to-edge, so it reads as the screen.
- **Clipping does not save a wrong quad.** `overflow:hidden` only clips to the
  quad you defined; if the quad exceeds the glass, content still spills. Fix the
  corners first, then rely on clipping. Put `overflow:hidden` + matching
  `borderRadius` on the **outer matrix3d wrapper** (clips reliably even under the
  3D transform) so siblings like a glow/blur are contained too, not just the
  terminal's own children.
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
