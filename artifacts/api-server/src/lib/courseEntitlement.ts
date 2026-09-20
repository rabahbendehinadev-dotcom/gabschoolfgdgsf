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

export interface ResolvedSubscriptionPeriod {
  start: Date | null;
  end: Date | null;
}

export interface CanonicalUserEntitlement {
  user: EntitlementUser;
  activationAt: Date | null;
  period: ResolvedSubscriptionPeriod;
  paid: boolean;
}

function parsed(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addCalendar(start: Date, type: "monthly" | "annual"): Date {
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  if (type === "monthly") result.setUTCMonth(result.getUTCMonth() + 1);
  else result.setUTCFullYear(result.getUTCFullYear() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Resolve the canonical calendar period. activationDate is historical evidence
 * (normally user_courses.granted_at), never generic account creation. */
export function resolveSubscriptionPeriod(
  user: EntitlementUser,
  activationDate?: Date | string | null,
): ResolvedSubscriptionPeriod {
  const start = parsed(user.subscriptionStartedAt) ?? parsed(activationDate);
  const explicitEnd = parsed(user.subscriptionExpiresAt);
  if (explicitEnd) return { start, end: explicitEnd };
  if (!start) return { start: null, end: null };
  if (user.subscriptionType === "monthly") {
    return { start, end: addCalendar(start, "monthly") };
  }
  if (user.subscriptionType === "annual") {
    return { start, end: addCalendar(start, "annual") };
  }
  return { start, end: null };
}

export function renewSubscriptionPeriod(
  type: string,
  currentEnd: Date | null,
  now = new Date(),
): { start: Date; end: Date } {
  const start = currentEnd && currentEnd > now ? new Date(currentEnd) : new Date(now);
  const end = addCalendar(start, type === "monthly" ? "monthly" : "annual");
  return { start: currentEnd && currentEnd > now ? start : new Date(now), end };
}

/** The timestamp at which a currently valid entitlement ends (or null for lifetime). */
export function effectiveEntitlementExpiry(
  user: EntitlementUser | null | undefined,
  activationDate?: Date | string | null,
): Date | null {
  if (!user) return null;
  return resolveSubscriptionPeriod(user, activationDate).end;
}

/**
 * Paid content policy. Deliberately does not infer validity from a missing date:
 * monthly and annual subscriptions require both boundaries to be present.
 */
export function hasPaidEntitlement(
  user: EntitlementUser | null | undefined,
  now = new Date(),
  activationDate?: Date | string | null,
): boolean {
  if (!user || !user.isActive || user.securityBlockedAt) return false;
  if (user.accountType !== "vip") return false;
  if (user.subscriptionType === "lifetime") return true;
  if (user.subscriptionType !== "monthly" && user.subscriptionType !== "annual") return false;
  const { start: starts, end: expires } = resolveSubscriptionPeriod(user, activationDate);
  if (!starts || !expires) return false;
  return starts <= now && now < expires;
}

export async function getCanonicalUserEntitlement(
  userId: number,
  now = new Date(),
  includeCourseHistory = true,
): Promise<CanonicalUserEntitlement | null> {
  const [user] = await db.select({
    accountType: usersTable.accountType,
    subscriptionType: usersTable.subscriptionType,
    subscriptionStartedAt: usersTable.subscriptionStartedAt,
    subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    isActive: usersTable.isActive,
    securityBlockedAt: usersTable.securityBlockedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  const [history] = includeCourseHistory ? await db.select({ grantedAt: userCoursesTable.grantedAt })
    .from(userCoursesTable)
    .where(eq(userCoursesTable.userId, userId))
    .orderBy(asc(userCoursesTable.grantedAt))
    .limit(1) : [undefined];
  const activationAt = parsed(user.subscriptionStartedAt) ?? parsed(history?.grantedAt);
  const period = resolveSubscriptionPeriod(user, activationAt);
  return { user, activationAt, period, paid: hasPaidEntitlement(user, now, activationAt) };
}

export async function getCourseEntitlement(
  userId: number,
  playlistId: number,
  now = new Date(),
): Promise<{ allowed: boolean; expiresAt: Date | null }> {
  const canonical = await getCanonicalUserEntitlement(userId, now, true);
  const [course] = await db.select({
    id: userCoursesTable.id,
    expiresAt: userCoursesTable.expiresAt,
    grantedAt: userCoursesTable.grantedAt,
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
  if (!course || !canonical?.paid) {
    return { allowed: false, expiresAt: null };
  }
  const subscriptionExpiry = canonical!.period.end;
  const courseExpiry = course.expiresAt;
  const expiresAt = subscriptionExpiry && courseExpiry
    ? new Date(Math.min(subscriptionExpiry.getTime(), courseExpiry.getTime()))
    : subscriptionExpiry ?? courseExpiry;
  return { allowed: true, expiresAt };
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
  const canonical = await getCanonicalUserEntitlement(userId, now, true);
  if (!canonical?.paid) return new Set();
  const rows = await db.select({
    playlistId: userCoursesTable.playlistId,
    expiresAt: userCoursesTable.expiresAt,
    grantedAt: userCoursesTable.grantedAt,
  }).from(userCoursesTable).where(and(
    eq(userCoursesTable.userId, userId),
    inArray(userCoursesTable.playlistId, playlistIds),
    eq(userCoursesTable.status, "active"),
  ));
  return new Set(rows
    .filter(row => row.expiresAt === null || row.expiresAt > now)
    .map(row => row.playlistId));
}