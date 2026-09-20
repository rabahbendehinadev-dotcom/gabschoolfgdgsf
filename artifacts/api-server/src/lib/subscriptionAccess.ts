import { eq } from "drizzle-orm";
import { hasPaidEntitlement, resolveSubscriptionPeriod } from "./courseEntitlement";
import {
  db, usersTable, userCoursesTable, planCoursesTable, subscriptionPlansTable,
  courseAccessLogsTable,
} from "@workspace/db";

const DAY = 24 * 60 * 60 * 1000;

export type EntitlementUser = {
  id: number; username: string; email: string; fullName?: string | null; phone?: string | null;
  accountType: string; isActive: boolean; subscriptionType: string;
  subscriptionStartedAt: Date | null; subscriptionExpiresAt: Date | null;
  securityBlockedAt?: Date | null;
};

export function entitlementState(user: EntitlementUser, now = new Date(), activationDate?: Date | null) {
  const period = resolveSubscriptionPeriod(user, activationDate);
  const missing: string[] = [];
  if (user.subscriptionType !== "lifetime") {
    if (!period.start) missing.push("MISSING_START_DATE");
    if (!period.end) missing.push("MISSING_END_DATE");
  }
  const expired = !!period.end && period.end <= now;
  const blocked = !user.isActive || !!user.securityBlockedAt;
  const invalid = user.subscriptionType === "demo" || user.accountType !== "vip";
  const active = hasPaidEntitlement(user, now, activationDate);
  return {
    active, expired, blocked, invalid, missing,
    status: blocked ? "blocked" : invalid ? "invalid" : expired ? "expired" : active ? "active" : "missing_data",
    start: period.start, end: period.end,
    daysRemaining: period.end ? Math.ceil((period.end.getTime() - now.getTime()) / DAY) : null,
  };
}

/** Reconcile only what can be derived from the user's current, named plan. */
export async function reconcileCourseAccess(
  userId: number,
  actor: { adminId?: number; adminName?: string; adminRole?: string; ip?: string; userAgent?: string } = {},
  now = new Date(),
) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  const rows = await db.select().from(userCoursesTable).where(eq(userCoursesTable.userId, userId));
  const activation = rows.map(r => r.grantedAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const state = entitlementState(user, now, activation);
  const [plan] = await db.select({ id: subscriptionPlansTable.id })
    .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.type, user.subscriptionType)).limit(1);
  const scope = plan ? await db.select({ playlistId: planCoursesTable.playlistId })
    .from(planCoursesTable).where(eq(planCoursesTable.planId, plan.id)) : [];
  const expected = new Set(scope.map(r => r.playlistId));
  const ambiguous = !plan || scope.length === 0 || scope.length !== new Set(scope.map(r => r.playlistId)).size;
  const changes: Array<{ playlistId: number; action: "grant" | "revoke"; reason: string }> = [];
  const seen = new Set<number>();

  // A missing/ambiguous plan is read-only: never guess by revoking access.
  if (ambiguous) return { user, state, plan, expected: [...expected], rows, changes: [], ambiguous: true };
  for (const row of rows) {
    const duplicate = seen.has(row.playlistId);
    seen.add(row.playlistId);
    const shouldBeActive = state.active && !!plan && expected.has(row.playlistId) && !duplicate;
    if (shouldBeActive && row.status !== "active") {
      await db.update(userCoursesTable).set({ status: "active" }).where(eq(userCoursesTable.id, row.id));
      changes.push({ playlistId: row.playlistId, action: "grant", reason: "reconciled_restore" });
    } else if (!shouldBeActive && row.status === "active") {
      const reason = duplicate ? "duplicate_enrollment" : !state.active ? `subscription_${state.status}` : "outside_plan_scope";
      await db.update(userCoursesTable).set({ status: state.expired ? "expired" : "revoked" }).where(eq(userCoursesTable.id, row.id));
      changes.push({ playlistId: row.playlistId, action: "revoke", reason });
    }
  }
  if (state.active && plan) {
    for (const playlistId of expected) {
      if (!seen.has(playlistId)) {
        await db.insert(userCoursesTable).values({
          userId, playlistId, grantedBy: actor.adminName ?? "subscription-reconciliation",
          adminId: actor.adminId, adminRole: actor.adminRole, grantSource: "subscription",
          reason: "reconciled_plan", status: "active",
        });
        changes.push({ playlistId, action: "grant", reason: "reconciled_plan" });
      }
    }
  }
  if (changes.length) {
    const adminName = actor.adminName ?? "subscription-reconciliation";
    await db.insert(courseAccessLogsTable).values(changes.map(c => ({
      userId, playlistId: c.playlistId, action: c.action, adminId: actor.adminId,
      adminName, adminRole: actor.adminRole, grantSource: "subscription",
      reason: c.reason, ip: actor.ip, userAgent: actor.userAgent,
    })));
  }
  return { user, state, plan, expected: [...expected], rows, changes, ambiguous: false };
}

export function soonThreshold(type: string) { return type === "annual" ? 30 : 7; }