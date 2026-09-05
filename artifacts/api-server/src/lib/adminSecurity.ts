/** Permissions are stored as JSON array or comma/space-separated legacy text. */
export function parseAdminPermissions(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  } catch { /* legacy text format */ }
  return value.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
}

export function canManageSecurity(admin: { role: string; permissions?: string[] | null }): boolean {
  return admin.role === "super_admin" || (admin.permissions ?? []).includes("security_manage");
}