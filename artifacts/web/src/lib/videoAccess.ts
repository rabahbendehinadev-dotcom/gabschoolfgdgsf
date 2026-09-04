type AccessUser = {
  accountType?: string | null;
  subscriptionType?: string | null;
  subscriptionExpiresAt?: string | null;
};

export function isActiveVip(user: AccessUser | null | undefined, now = new Date()): boolean {
  if (user?.accountType !== "vip") return false;
  return !user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now;
}

export function hasActiveSubscription(
  user: AccessUser | null | undefined,
  now = new Date(),
): boolean {
  if (!user || user.subscriptionType === "demo") return false;
  return !user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now;
}

export function isVideoLocked(
  accessType: string | null | undefined,
  user: AccessUser | null | undefined,
  now = new Date(),
): boolean {
  if ((accessType || "normal") === "visitor") return false;
  const vip = isActiveVip(user, now);
  if (accessType === "vip") return !vip;
  return !vip && !hasActiveSubscription(user, now);
}