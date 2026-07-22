---
name: Admin panel French/LTR light theme v4
description: Admin panel design direction and RTL-guard pattern for not-yet-converted pages
---

# Admin panel v4 — Light ERP · French · LTR

**Rule:** The admin panel (`/gab-ctrl-9x`) uses the v4 LIGHT design system (white sidebar, page bg #F6F8FB, orange #F97316 sparingly), French strings, and `dir="ltr"`. The user explicitly REJECTED a dark/black sidebar — do not reintroduce it.

**Why:** User chose ERP-grade calm look (Odoo/SAP Fiori/Linear/Stripe) with French as the admin language; the public site stays Arabic/RTL (`body { direction: rtl }` globally).

**How to apply:**
- The admin shell (`AdminLayout`) sets `dir="ltr"` — so every admin page inherits LTR.
- Pages already converted to French/LTR: AdminLayout, Users, UserDetailModal (plus ActivityLog, AdminLogin, Plans which set their own `dir="ltr"`).
- Pages STILL Arabic must keep an explicit `dir="rtl"` on their root element or their Arabic text renders mis-aligned under the LTR shell (guard added to Dashboard, Payments, Subscriptions, Playlists, ChangePassword; others already had it). When converting one of these pages to French, remove its `dir="rtl"` at the same time.
- Design tokens live as `ad-*` classes in `artifacts/web/src/index.css` (section "ADMIN DESIGN SYSTEM · v4"). Reuse them; don't invent parallel inline systems.
- LTR flip checklist for remaining conversions: search/eye icons + input padding side, sticky table action columns (`right:0` + `borderLeft`), drawer `translateX(-100%)` from left, active-nav bar at `left:0`, `localeCompare("fr")`, French timeAgo.
