# Memory Index

- [Accent theming via --accent + color-mix](accent-theming-css-var.md) — per-record dynamic colors & hover states; sanitize the color; Wouter Link focus-ring targets the anchor, not the inner card.
- [Shared presigned-upload endpoint](shared-upload-endpoint.md) — upload-URL route is intentionally unauthenticated; regular users upload subscription payment proofs through it, so don't lock it behind admin auth.
- [Pre-existing typecheck errors](preexisting-typecheck.md) — api-server + web have baseline typecheck failures unrelated to most work; confirm your own edited lines are clean instead of expecting green.
- [Gated lesson/video views](gated-lesson-views.md) — locked lessons must NOT mount the player iframe or call useGetVideo; gate both on accessInfo so client mirrors the server 403 and avoids leaking driveParts/softwareLink.
- [Category-lessons two entry points](category-lessons-entrypoints.md) — category lessons render in BOTH Home.tsx (brand cards section, the one users click) and Videos.tsx CategoryDetail; change both (shared CoursePlayer) or it looks unapplied.
- [Category card media aspect ratio](category-card-media-ratio.md) — CategoryCard media is 16:10 on mobile, taller 4:3 on desktop (lg) on purpose; don't normalize to one ratio. object-cover always crops.
- [Replit proxy client IP](replit-proxy-client-ip.md) — edge strips client X-Forwarded-For; `req.ip` with `trust proxy:true` is the real, non-spoofable IP; don't set a fixed hop count.
- [Wouter Link onClick interception](wouter-link-onclick.md) — Link wrapper guards modifier/middle clicks & defaultPrevented before navigating; user onClick runs only on plain left-click, so preventDefault() makes a Link select inline while modifier-click still opens href.
- [framer-motion vs Tailwind transform](framer-tailwind-transform-conflict.md) — framer's inline transform clobbers Tailwind rotate/-translate/scale on the same element; split positioning (plain wrapper) from animation (inner motion.*), or pass transforms as framer props.
- [DOM onto angled photo screen](dom-onto-angled-photo-screen.md) — overlay live content on a 3D-angled device PNG's glass via homography→matrix3d, corners as image-box fractions, sized from a ResizeObserver; matrix3d on plain wrapper, framer only on inner child.
