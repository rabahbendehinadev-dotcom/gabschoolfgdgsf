/**
 * Shared VIP entitlement helpers.
 *
 * IMPORTANT: optionalUserAuth does NOT block expired users. Any route that
 * gates content on VIP status must call isActiveVip() — never compare
 * accountType === "vip" directly. The same applies to the stream endpoint
 * which queries the DB directly without going through a middleware.
 */

export interface VipCheckable {
  accountType: string;
  isActive: boolean;
  subscriptionExpiresAt: Date | string | null | undefined;
}

/**
 * Returns true only when the user is currently an active, non-expired VIP.
 * Accepts both req.user objects (Date) and raw DB rows (Date | string | null).
 */
export function isActiveVip(user: VipCheckable | null | undefined): boolean {
  if (!user || !user.isActive) return false;
  if (user.accountType !== "vip") return false;
  const exp = user.subscriptionExpiresAt;
  if (exp && new Date(exp) < new Date()) return false;
  return true;
}

/**
 * Convenience: compute whether a VIP subscription has expired.
 * Works on any object with accountType + subscriptionExpiresAt.
 */
export function isSubscriptionExpired(user: {
  accountType: string;
  subscriptionExpiresAt: Date | string | null | undefined;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.accountType !== "vip") return false;
  const exp = user.subscriptionExpiresAt;
  if (!exp) return false;
  return new Date(exp) < new Date();
}
