---
name: Admin section authorization
description: Defines the authorization contract for delegated Admin accounts across UI and API surfaces.
---

For non-Super Admin accounts, each saved permission must control the matching login destination, sidebar entries, direct page routes, and Admin API endpoints. Super Admin keeps full access. New or unclassified Admin APIs default to Super Admin only.

**Why:** Hiding one sidebar item is not authorization. A delegated Admin previously received the complete panel and could call unrelated APIs because most routes checked only whether an Admin was logged in.

**How to apply:** Any new Admin section must be added to both the client page-access map and the server API-access map. Shared reference endpoints may allow an explicit set of permissions; never grant broad access based on role names such as Support.