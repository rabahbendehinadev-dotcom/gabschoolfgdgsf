# Memory Index

- [Accent theming via --accent + color-mix](accent-theming-css-var.md) — per-record dynamic colors & hover states; sanitize the color; Wouter Link focus-ring targets the anchor, not the inner card.
- [Shared presigned-upload endpoint](shared-upload-endpoint.md) — upload-URL route is intentionally unauthenticated; regular users upload subscription payment proofs through it, so don't lock it behind admin auth.
- [Pre-existing typecheck errors](preexisting-typecheck.md) — api-server + web have baseline typecheck failures unrelated to most work; confirm your own edited lines are clean instead of expecting green.
- [Replit proxy client IP](replit-proxy-client-ip.md) — edge strips client X-Forwarded-For; `req.ip` with `trust proxy:true` is the real, non-spoofable IP; don't set a fixed hop count.
- [Wouter Link onClick interception](wouter-link-onclick.md) — Link wrapper guards modifier/middle clicks & defaultPrevented before navigating; user onClick runs only on plain left-click, so preventDefault() makes a Link select inline while modifier-click still opens href.
- [framer-motion vs Tailwind transform](framer-tailwind-transform-conflict.md) — framer's inline transform clobbers Tailwind rotate/-translate/scale on the same element; split positioning (plain wrapper) from animation (inner motion.*), or pass transforms as framer props.
- [DOM onto angled photo screen](dom-onto-angled-photo-screen.md) — overlay live content on a 3D-angled device PNG's glass via homography→matrix3d, corners as image-box fractions, sized from a ResizeObserver; matrix3d on plain wrapper, framer only on inner child.
