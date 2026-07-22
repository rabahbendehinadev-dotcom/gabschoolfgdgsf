# Memory Index

- [Admin French/LTR light v4](admin-french-ltr-v4.md) — admin panel is light theme + French + LTR (dark sidebar rejected); still-Arabic admin pages need root dir="rtl" guard.

- [S3 adapter write pitfall](s3-adapter-write-pitfall.md) — createWriteStream "finish" fires before MinIO upload completes, hiding errors; use putBuffer/upload.done(); img-optimize worker notes.

- [VPS Dokploy ops](vps-dokploy-ops.md) — Dokploy env panel edits may not reach swarm; fix via docker service update, but redeploys revert it; VPS videos stream LIVE from Drive by owner decision.
- [GCS video migration](gcs-video-migration.md) — ALL video bytes (MP4 + HLS segments) proxied through server; NO presigned storage.googleapis.com URLs ever reach the browser; Drive IDs/objectPaths never reach client; deterministic paths ⇒ race losers must not delete.
- [Connector lookup dev filter](connector-lookup-dev-filter.md) — connectors v2 API with connector_names filter returns 0 items in dev for prod-scoped connections; list all + filter client-side.

- [Accent theming via --accent + color-mix](accent-theming-css-var.md) — per-record dynamic colors & hover states; sanitize the color; Wouter Link focus-ring targets the anchor, not the inner card.
- [Shared presigned-upload endpoint](shared-upload-endpoint.md) — upload-URL route is intentionally unauthenticated; regular users upload subscription payment proofs through it, so don't lock it behind admin auth.
- [Pre-existing typecheck errors](preexisting-typecheck.md) — api-server + web have baseline typecheck failures unrelated to most work; confirm your own edited lines are clean instead of expecting green.
- [PWA install (manual button)](pwa-install.md) — beforeinstallprompt never fires in the Replit dev-preview iframe, so the install button hides there; verify visuals by temporarily forcing render.
- [db schema change needs lib/db rebuild](db-schema-typecheck-rebuild.md) — after editing lib/db schema, consumer typecheck reads stale .d.ts; run `tsc -b lib/db --force` (project references).
- [GIS custom-button overlay](gis-custom-button-overlay.md) — restyle Google Sign-In by layering the real GIS button transparently on top; keep its target node always mounted; dev 403 origin error is expected, gate only on script load.
- [Stale/orphan workflow process](stale-workflow-process.md) — if a workflow restart doesn't reflect on-disk edits, an older orphan process tree may still hold the port; ps + kill it, then restart.
- [Google Sign-In (GIS ID-token)](google-signin-gis.md) — no redirect URI; needs Authorized JS origins not redirect URIs; client secret unused; client id is public; after codegen/schema run `tsc --build` so artifact typecheck sees new exports.
- [Fragment + Replit metadata warning](fragment-metadata-warning.md) — Vite metadata plugin adds data-* to Fragment → React "invalid prop" warning; use flatMap/keyed elements or a DOM wrapper, not a keyed <Fragment>.
- [Gated lesson/video views](gated-lesson-views.md) — VideoDetail handles 403 with locked preview; route ordering in App.tsx critical (/:id before /); ApiError.data holds parsed body, not response.data.
- [wouter v3 route ordering](wouter-route-ordering.md) — in Switch, put /path/:id BEFORE /path or prefix-match may render wrong component; also guard redirect effects with bootstrapped to avoid firing during auth load.
- [Category-lessons two entry points](category-lessons-entrypoints.md) — category lessons render in BOTH Home.tsx (brand cards section, the one users click) and Videos.tsx CategoryDetail; change both (shared CoursePlayer) or it looks unapplied.
- [Category card media aspect ratio](category-card-media-ratio.md) — CategoryCard media is 16:10 on mobile, taller 4:3 on desktop (lg) on purpose; don't normalize to one ratio. object-cover always crops.
- [Replit proxy client IP](replit-proxy-client-ip.md) — edge strips client X-Forwarded-For; `req.ip` with `trust proxy:true` is the real, non-spoofable IP; don't set a fixed hop count.
- [Wouter Link onClick interception](wouter-link-onclick.md) — Link wrapper guards modifier/middle clicks & defaultPrevented before navigating; user onClick runs only on plain left-click, so preventDefault() makes a Link select inline while modifier-click still opens href.
- [framer-motion vs Tailwind transform](framer-tailwind-transform-conflict.md) — framer's inline transform clobbers Tailwind rotate/-translate/scale on the same element; split positioning (plain wrapper) from animation (inner motion.*), or pass transforms as framer props.
- [DOM onto angled photo screen](dom-onto-angled-photo-screen.md) — overlay live content on a 3D-angled device PNG's glass via homography→matrix3d, corners as image-box fractions, sized from a ResizeObserver; matrix3d on plain wrapper, framer only on inner child.
- [Mobile native chrome](mobile-bottom-nav-shell.md) — bottom nav + compact header switch at `lg` (not md), keep all 4 spots in lockstep; public routes share ONE persistent PublicLayout (nested Switch + catch-all) so layoutId pill animates.
- [Community feed pagination](community-feed-pagination.md) — server cursor=offset + hard limit cap (30); client MUST use useInfiniteQuery cursor accumulation, not limit-growth, or load-more silently re-fetches the same 30.
- [Web Push outage guard](webpush-global-outage-guard.md) — 403/400 "skip prune" guard must key on success===0 + all-failures-classified + rejectedCount>=3, NOT rejected===batch, so a few 404/410 don't mass-mark everyone broken.
- [Web Push stale-VAPID heal](webpush-stale-vapid-heal.md) — old subs bound to old VAPID key 403 (not 404/410) → silent fail; client byte-compares key & resubscribes, server prunes 403 except large all-rejected batches (global-outage guard + single-user override).
- [Mandatory push opt-in gate](mandatory-push-gate.md) — mandatory-but-never-trap state machine (default=uncloseable, denied/iOS=dismissible, unsupported/no-VAPID=hidden); enablePushSubscription returns null for denial AND failure so re-read Notification.permission; push routes use userAuthNoIpLimit for VIP.
- [Per-user query cache scoping](query-cache-user-scoping.md) — generated Orval query keys aren't scoped by user id; AuthProvider clears queryClient on login/logout so per-user data (notifications) can't leak across accounts.
- [Mobile video player UX](mobile-video-player-ux.md) — iOS DIV has no requestFullscreen (req?.call no-ops silently → catch never runs); tier to video.webkitEnterFullscreen→theater. Clear `waiting` on loadedmetadata/canplay or the play button stays hidden; tap=play when paused.
- [Drive video streaming prod debug](video-drive-streaming-prod-debug.md) — large Drive media MUST be range-windowed on autoscale (a full-file response is cut off → iPhone "تعذر تشغيل الفيديو"); clamp every Range to a bounded window. Dev/prod DBs separate; prod logs only after DEPLOY.
- [Private Drive video streaming](drive-video-streaming.md) — server proxies private Drive bytes via OAuth connector + tokenized same-origin streamParts (no Google UI); force video/mp4 (octet-stream breaks iPhone Safari); public schema must never leak Drive URLs.
- [Screenshot harness can't play video](screenshot-no-video.md) — app_preview never loads <video> (sandboxed, no net) → always shows error/poster; verify playback via Playwright testing skill, not screenshots.
- [Intl phone country picker](intl-phone-native-select.md) — react-phone-number-input's picker is a native `<select>` overlay, not a searchable combobox; use select_option by label/ISO code in tests, not typed search.
- [Drive proxy streaming modes](drive-prefetch-cache.md) — default pipes ranges live to EOF (buffering whole chunks caused stalls); DRIVE_STREAM_WINDOWED=true restores capped windows+prefetch for Replit Autoscale.
- [Course content filtering architecture](course-filtering-architecture.md) — filtering MUST be DB-level (linkedPlaylistId); client-side fallback to "show all" is the leak; admin links categories via course-specific URL.
- [VIP expiry enforcement pattern](vip-expiry-enforcement.md) — gate VIP via isActiveVip(), never accountType==="vip"; optionalUserAuth doesn't block expired users; NULL expiry = active.
- [Video watermark protection](video-watermark-protection.md) — watermark = viewer identity (never post author); visibility-pause must exempt PiP; getDisplayMedia patch needs cleanup-restore.
- [SW image cache](sw-image-cache.md) — sw.js caches destination==="image" cache-first; MUST exclude /community/media (gated) and /avatar (mutable stable URL); bump gab-img-vN on rule changes.
