import type { Request } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const VIP_IP_WINDOW_MS = 24 * 60 * 60 * 1000;

export const VIP_IP_LIMIT_MESSAGE =
  "لقد وصلت إلى الحد الأقصى للأجهزة المسموح بها (جهازان خلال 24 ساعة). سجّل الدخول من جهاز سبق أن دخلت منه، أو انتظر إعادة الضبط التلقائي بعد 24 ساعة، أو تواصل مع الأدمن.";

/**
 * Resolve the real client IP.
 *
 * Express `trust proxy` is enabled, and the Replit edge proxy strips any
 * client-supplied X-Forwarded-For and replaces it with the true client chain,
 * so `req.ip` is the genuine, non-spoofable client address. We deliberately do
 * NOT read the raw X-Forwarded-For header here (its leftmost value would be
 * client-controllable on a hypothetical direct connection).
 */
export function getClientIp(req: Request): string {
  return req.ip || "unknown";
}

type IpUserFields = {
  accountType: string;
  ipAddress: string | null;
  ipAddress2: string | null;
  ipFirstSeenAt: Date | null;
};

function isWindowExpired(firstSeen: Date | null, now = Date.now()): boolean {
  return !!firstSeen && now - new Date(firstSeen).getTime() > VIP_IP_WINDOW_MS;
}

/**
 * Window-aware view of a VIP user's IP usage, used for admin display.
 * Non-VIP users are never IP-restricted, so they always report zero usage.
 * Expired windows report as empty even if the row has not been cleared yet.
 */
export function effectiveIpState(user: IpUserFields): {
  ipAddress: string | null;
  ipAddress2: string | null;
  ipFirstSeenAt: Date | null;
  ipCount: number;
} {
  if (user.accountType !== "vip" || isWindowExpired(user.ipFirstSeenAt)) {
    return { ipAddress: null, ipAddress2: null, ipFirstSeenAt: null, ipCount: 0 };
  }
  const ipCount = (user.ipAddress ? 1 : 0) + (user.ipAddress2 ? 1 : 0);
  return {
    ipAddress: user.ipAddress,
    ipAddress2: user.ipAddress2,
    ipFirstSeenAt: user.ipFirstSeenAt,
    ipCount,
  };
}

/**
 * Enforce the VIP IP policy for a single access (login or authenticated request).
 *
 * Rules:
 * - Only accountType === "vip" is restricted. Everyone else is allowed and no IP is recorded.
 * - A VIP may use at most 2 distinct IPs within a fixed 24h window that starts at first access.
 * - A 3rd distinct IP within the window is denied.
 * - Once the window expires it resets lazily here (and via the background scheduler).
 *
 * Runs inside a transaction with a row lock so concurrent logins from different
 * IPs cannot race past the 2-IP limit or clobber each other's slots.
 */
export async function applyVipIpPolicy(
  userId: number,
  clientIp: string,
): Promise<{ allowed: boolean; ipCount: number }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .for("update");

    if (!user) return { allowed: false, ipCount: 0 };
    if (user.accountType !== "vip") return { allowed: true, ipCount: 0 };

    const now = new Date();
    let ip1 = user.ipAddress;
    let ip2 = user.ipAddress2;
    let firstSeen = user.ipFirstSeenAt;

    if (isWindowExpired(firstSeen, now.getTime())) {
      ip1 = null;
      ip2 = null;
      firstSeen = null;
    }

    // Defensive self-heal for legacy rows: a VIP may have IP slots filled but no
    // window start (set before this system existed, or via direct DB edit).
    // Without a window start the row would never auto-reset, so start it now.
    if (!firstSeen && (ip1 || ip2)) {
      firstSeen = now;
    }

    let allowed: boolean;
    if (clientIp === ip1 || clientIp === ip2) {
      allowed = true;
    } else if (!ip1) {
      ip1 = clientIp;
      firstSeen = now;
      allowed = true;
    } else if (!ip2) {
      ip2 = clientIp;
      if (!firstSeen) firstSeen = now;
      allowed = true;
    } else {
      allowed = false;
    }

    const changed =
      ip1 !== user.ipAddress ||
      ip2 !== user.ipAddress2 ||
      firstSeen !== user.ipFirstSeenAt;

    if (changed) {
      await tx
        .update(usersTable)
        .set({ ipAddress: ip1, ipAddress2: ip2, ipFirstSeenAt: firstSeen })
        .where(eq(usersTable.id, userId));
    }

    const ipCount = (ip1 ? 1 : 0) + (ip2 ? 1 : 0);
    return { allowed, ipCount };
  });
}
