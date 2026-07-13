/**
 * One-time backfill: set subscriptionStartedAt + subscriptionExpiresAt for VIP
 * users that have both fields NULL. Uses created_at as a proxy for the start date.
 *
 * Duration map:
 *   monthly  → 30 days
 *   annual   → 365 days
 *   lifetime → no end date (skipped)
 *   demo     → no end date (skipped)
 *
 * Run:  npx tsx scripts/backfill-subscription-dates.ts [--dry-run]
 */
import { db, usersTable } from "@workspace/db";
import { and, isNull, inArray, eq } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

const DURATION_DAYS: Record<string, number | null> = {
  monthly: 30,
  annual: 365,
  lifetime: null,
  demo: null,
};

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      subscriptionType: usersTable.subscriptionType,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.subscriptionStartedAt),
        isNull(usersTable.subscriptionExpiresAt),
        inArray(usersTable.subscriptionType, ["monthly", "annual"]),
      ),
    );

  console.log(`Found ${users.length} users needing backfill`);

  let updated = 0;
  for (const u of users) {
    const durationDays = DURATION_DAYS[u.subscriptionType];
    if (durationDays === null || durationDays === undefined) continue;

    const startedAt = u.createdAt;
    const expiresAt = new Date(startedAt);
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    console.log(
      `  id=${u.id} (${u.username}) type=${u.subscriptionType} ` +
        `started=${startedAt.toISOString().slice(0, 10)} ` +
        `expires=${expiresAt.toISOString().slice(0, 10)}`,
    );

    if (!DRY_RUN) {
      await db
        .update(usersTable)
        .set({ subscriptionStartedAt: startedAt, subscriptionExpiresAt: expiresAt })
        .where(eq(usersTable.id, u.id));
      // Note: use per-row update in production to avoid race conditions
    }
    updated++;
  }

  console.log(`\nDone. ${DRY_RUN ? "Would update" : "Updated"} ${updated} users.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
