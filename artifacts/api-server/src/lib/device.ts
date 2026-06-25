/**
 * Best-effort device-type classification from a User-Agent string.
 * Returns a stable English key ("mobile" | "tablet" | "desktop" | "unknown");
 * the admin UI maps these to Arabic labels for display.
 */
export function deviceTypeFromUA(ua?: string | null): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  // Tablets first (some tablet UAs also contain "android" without "mobile").
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/.test(s)) {
    return "tablet";
  }
  if (/mobile|iphone|ipod|blackberry|opera mini|windows phone|webos/.test(s)) {
    return "mobile";
  }
  return "desktop";
}
