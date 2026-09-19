/** Reserved private namespace. Shared by every generic storage consumer.
 * Decode repeatedly to reject nested encodings before any provider resolves paths.
 */
export function isProtectedSolutionStoragePath(value: string): boolean {
  let decoded = value;
  for (let i = 0; i <= value.length; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { return true; }
  }
  return decoded.split(/[\\/?&#=]/).some(part => part.toLowerCase() === "solutions" || part === "..");
}