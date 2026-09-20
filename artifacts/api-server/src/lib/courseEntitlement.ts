import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db, userCoursesTable, usersTable } from "@workspace/db";

export interface EntitlementUser {
  accountType: string;
  subscriptionType: string;
  subscriptionStartedAt?: Date | string | null;
  subscriptionExpiresAt: Date | string | null | undefined;
  isActive: boolean;
  securityBlockedAt?: Date | string | null;
}

/** The timestamp at which a currently valid entitlement ends (or null for lifetime). */
export function effectiveEntitlementExpiry(
  user: EntitlementUser | null | undefined,
): Date | null {
  if (!user || user.subscriptionType === "lifetime") return null;
  return user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
}

/**
 * Paid content policy. Deliberately does not infer validity from a missing date:
 * monthly and annual subscriptions require both boundaries to be present.
 */
export function hasPaidEntitlement(
  user: EntitlementUser | null | undefined,
  now = new Date(),
): boolean {
  if (!user || !user.isActive || user.securityBlockedAt) return false;
  if (user.accountType !== "vip") return false;
  if (user.subscriptionType === "lifetime") return true;
  if (user.subscriptionType !== "monthly" && user.subscriptionType !== "annual") return false;
  if (!user.subscriptionStartedAt || !user.subscriptionExpiresAt) return false;
  const starts = new Date(user.subscriptionStartedAt);
  const expires = new Date(user.subscriptionExpiresAt);
  return Number.isFinite(starts.getTime()) && Number.isFinite(expires.getTime())
    && starts <= now && expires > now;
}

export async function getCourseEntitlement(
  userId: number,
  playlistId: number,
  now = new Date(),
): Promise<{ allowed: boolean; expiresAt: Date | null }> {
  const [user] = await db.select({
    accountType: usersTable.accountType,
    subscriptionType: usersTable.subscriptionType,
    subscriptionStartedAt: usersTable.subscriptionStartedAt,
    subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    isActive: usersTable.isActive,
    securityBlockedAt: usersTable.securityBlockedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!hasPaidEntitlement(user, now)) return { allowed: false, expiresAt: null };
  const [course] = await db.select({
    id: userCoursesTable.id,
    expiresAt: userCoursesTable.expiresAt,
  })
    .from(userCoursesTable)
    .where(and(
      eq(userCoursesTable.userId, userId),
      eq(userCoursesTable.playlistId, playlistId),
      eq(userCoursesTable.status, "active"),
      or(isNull(userCoursesTable.expiresAt), gt(userCoursesTable.expiresAt, now)),
    ))
    .orderBy(asc(userCoursesTable.expiresAt))
    .limit(1);
  return course
    ? { allowed: true, expiresAt: course.expiresAt }
    : { allowed: false, expiresAt: null };
}

export async function hasCourseEntitlement(
  userId: number,
  playlistId: number,
  now = new Date(),
): Promise<boolean> {
  return (await getCourseEntitlement(userId, playlistId, now)).allowed;
}

/** Batch course lookup for collection endpoints (one user query + one row query). */
export async function getAccessibleCourseIds(
  userId: number,
  playlistIds: number[],
  now = new Date(),
): Promise<Set<number>> {
  if (playlistIds.length === 0) return new Set();
  const [user] = await db.select({
    accountType: usersTable.accountType,
    subscriptionType: usersTable.subscriptionType,
    subscriptionStartedAt: usersTable.subscriptionStartedAt,
    subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    isActive: usersTable.isActive,
    securityBlockedAt: usersTable.securityBlockedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!hasPaidEntitlement(user, now)) return new Set();
  const rows = await db.select({
    playlistId: userCoursesTable.playlistId,
    expiresAt: userCoursesTable.expiresAt,
  }).from(userCoursesTable).where(and(
    eq(userCoursesTable.userId, userId),
    inArray(userCoursesTable.playlistId, playlistIds),
    eq(userCoursesTable.status, "active"),
  ));
  return new Set(rows
    .filter(row => row.expiresAt === null || row.expiresAt > now)
    .map(row => row.playlistId));
}