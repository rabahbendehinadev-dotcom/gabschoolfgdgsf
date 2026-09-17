---
name: Device Security Admin permission
description: Defines the independent permission boundary for the Admin Device Security module.
---

Device Security access requires the `manage_device_security` permission. `manage_users` and the retired `security_manage` key do not grant access. Super Admin always bypasses the permission check.

**Why:** Trusted-device approval, replacement, reset, session invalidation, and IP-exception management are higher-risk operations than ordinary user administration and must be delegated separately.

**How to apply:** Hide and client-block the Device Security page without permission, but treat the server guard on every Device Security endpoint as authoritative. Include permissions in Admin login/session refresh data so revoked access takes effect for active sessions.