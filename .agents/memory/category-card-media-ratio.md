---
name: Category card media aspect ratio
description: Why the brand/category card image area uses a different aspect ratio on desktop vs mobile.
---

The CategoryCard media area is intentionally responsive: `aspect-[16/10]` on
mobile/tablet, `lg:aspect-[4/3]` (taller) on desktop. Image uses
`object-cover object-center`.

**Why:** With a single 16:10 ratio everywhere, the narrow multi-column desktop
cards make the media box very short (~184px), and `object-cover` crops
portrait-ish uploads into a thin "broken/cropped" strip. The user explicitly
asked for the desktop image area to be taller and show more of the image, while
keeping the mobile look unchanged (they consider mobile excellent). `object-cover`
is required (no letterboxing) so it always crops — `object-contain` was rejected.

**How to apply:** Do NOT "normalize" the card back to a single uniform aspect
ratio across breakpoints — the desktop/mobile split is deliberate. If asked to
show entire portrait uploads with zero crop, that requires `object-contain`
(letterboxing), which conflicts with this design — confirm with the user first.
Recommended upload spec for category images: 16:10, ~1280×800, subject centered.
