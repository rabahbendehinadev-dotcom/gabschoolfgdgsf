import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { VIP_IP_WINDOW_MS } from "./ipPolicy";

const RESET_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Auto-reset expired VIP IP windows without any admin action.
 * Clears the IP slots for VIP users whose 24h window has elapsed so they can
 * re-enter from a new device. Idempotent and safe to run repeatedly.
 */
export async function resetExpiredVipIps(): Promise<void> {
  const cutoff = new Date(Date.now() - VIP_IP_WINDOW_MS);
  try {
    await db
      .update(usersTable)
      .set({ ipAddress: null, ipAddress2: null, ipFirstSeenAt: null })
      .where(
        and(
          eq(usersTable.accountType, "vip"),
          isNotNull(usersTable.ipFirstSeenAt),
          lt(usersTable.ipFirstSeenAt, cutoff),
        ),
      );
  } catch (err) {
    console.error("[ip-reset] Failed to reset expired VIP IPs:", err);
  }
}

export function startIpResetScheduler(): void {
  // Run once at startup, then on a fixed interval.
  void resetExpiredVipIps();
  setInterval(() => {
    void resetExpiredVipIps();
  }, RESET_INTERVAL_MS);
  console.log("[ip-reset] VIP IP auto-reset scheduler started (hourly).");
}
