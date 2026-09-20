/** Permissions are stored as JSON array or comma/space-separated legacy text. */
export function parseAdminPermissions(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  } catch { /* legacy text format */ }
  return value.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
}

export const ADMIN_PERMISSIONS = [
  "manage_solutions",
  "manage_users",
  "manage_subscriptions",
  "manage_content",
  "manage_community",
  "view_analytics",
  "send_notifications",
  "manage_plans",
  "manage_tools",
  "manage_device_security",
] as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
export type AdminAccessRequirement = AdminPermission | readonly AdminPermission[] | "super_admin";

type AdminIdentity = { role: string; permissions?: string[] | null };

export function hasAdminPermission(admin: AdminIdentity, permission: AdminPermission): boolean {
  return admin.role === "super_admin" || (admin.permissions ?? []).includes(permission);
}

export function canManageSecurity(admin: AdminIdentity): boolean {
  return hasAdminPermission(admin, "manage_device_security");
}

export function requiredAdminAccessForApi(method: string, requestPath: string): AdminAccessRequirement | null {
  const path = requestPath.split("?")[0];

  // Account/session utilities are available to every authenticated Admin.
  if (
    path === "/admin/change-password" ||
    path === "/admin/push/vapid-key" ||
    path === "/admin/push/status" ||
    path === "/admin/push/subscribe"
  ) return null;

  if (path.startsWith("/admin/security/")) return "manage_device_security";
  if (path === "/admin/solutions" || path.startsWith("/admin/solutions/")) return "manage_solutions";
  if (path === "/admin/hero-banners" || path.startsWith("/admin/hero-banners/")) return "manage_content";
  if (path === "/admin/stats") return "view_analytics";
  if (path === "/admin/subscriptions" || path.startsWith("/admin/payments")) return "manage_subscriptions";
  if (
    path === "/admin/users/expired" ||
    /^\/admin\/users\/[^/]+\/(?:subscription|reconcile-course-access)$/.test(path)
  ) return "manage_subscriptions";
  if (/^\/admin\/users\/[^/]+\/revoke-course\/[^/]+$/.test(path)) return "manage_content";
  if (
    path.startsWith("/admin/users") ||
    path === "/admin/activity-logs" ||
    path === "/admin/my-permissions/courses"
  ) return "manage_users";
  if (path.startsWith("/admin/course-access-")) return "manage_content";
  if (path.startsWith("/admin/admins") || path === "/admin/admin-audit-log") return "super_admin";
  if (
    path.startsWith("/admin/r2/") ||
    path.startsWith("/admin/videos") ||
    path.startsWith("/admin/categories") ||
    path.startsWith("/admin/images/") ||
    path === "/admin/upload-thumbnail"
  ) return "manage_content";
  if (path.startsWith("/admin/playlists")) {
    return method.toUpperCase() === "GET"
      ? ["manage_content", "manage_users", "manage_plans"]
      : "manage_content";
  }
  if (path.startsWith("/admin/subscription-plans")) return "manage_plans";
  if (path.startsWith("/admin/notifications") || path === "/admin/push/test") return "send_notifications";
  if (path.startsWith("/admin/community/")) return "manage_community";
  if (path.startsWith("/admin/tools") || path.startsWith("/admin/tool-categories")) return "manage_tools";

  // New Admin endpoints must be classified explicitly before Support accounts can use them.
  return "super_admin";
}

export function canAccessAdminApi(admin: AdminIdentity, method: string, requestPath: string): boolean {
  if (admin.role === "super_admin") return true;
  const requirement = requiredAdminAccessForApi(method, requestPath);
  if (requirement === null) return true;
  if (requirement === "super_admin") return false;
  if (Array.isArray(requirement)) {
    return requirement.some((permission) => hasAdminPermission(admin, permission));
  }
  return hasAdminPermission(admin, requirement as AdminPermission);
}