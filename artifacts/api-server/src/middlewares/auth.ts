import { Request, Response, NextFunction } from "express";
import { verifyToken, verifyAdminToken } from "../lib/auth";
import { applyVipIpPolicy, getClientIp, VIP_IP_LIMIT_MESSAGE } from "../lib/ipPolicy";
import { db, usersTable, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        accountType: string;
        subscriptionType: string;
        subscriptionExpiresAt: Date | null;
        ipAddress: string | null;
        isActive: boolean;
        phone: string | null;
        profileImage: string | null;
      };
      admin?: {
        id: number;
        username: string;
      };
      userCreatedAt?: Date;
    }
  }
}

async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
  enforceIpPolicy: boolean,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (!user || !user.isActive) {
    res.status(401).json({ message: "Account not found or deactivated" });
    return;
  }

  const clientIp = getClientIp(req);

  // IP restriction applies to VIP accounts only (max 2 IPs / 24h window).
  // Normal & demo accounts are never IP-restricted, so skip the locking
  // transaction entirely for them (runs on every authenticated request).
  //
  // Benign per-user endpoints (notifications: reading the feed, registering a
  // push device, reporting permission state) opt out via `userAuthNoIpLimit`.
  // A VIP's mobile IP rotates often, so enforcing the 2-IP limit there would
  // (a) block them from enabling notifications and (b) burn their device slots
  // on transient IPs, locking them out of paid content.
  if (enforceIpPolicy && user.accountType === "vip") {
    const ipPolicy = await applyVipIpPolicy(user.id, clientIp);
    if (!ipPolicy.allowed) {
      res.status(403).json({ message: VIP_IP_LIMIT_MESSAGE });
      return;
    }
  }

  if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    res.status(403).json({ message: "Your subscription has expired. Please renew to continue accessing content." });
    return;
  }

  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    accountType: user.accountType,
    subscriptionType: user.subscriptionType,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    ipAddress: user.ipAddress || clientIp,
    isActive: user.isActive,
    phone: user.phone ?? null,
    profileImage: user.profileImage ?? null,
  };
  req.userCreatedAt = user.createdAt;

  next();
}

/** Authenticated access WITH the VIP IP policy enforced (content endpoints). */
export function userAuth(req: Request, res: Response, next: NextFunction) {
  return authenticateUser(req, res, next, true);
}

/**
 * Authenticated access WITHOUT the VIP IP policy — for benign per-user
 * endpoints (notifications) that must not be blocked by mobile IP rotation.
 * JWT auth, account-active and subscription-expiry checks still apply.
 */
export function userAuthNoIpLimit(req: Request, res: Response, next: NextFunction) {
  return authenticateUser(req, res, next, false);
}

/**
 * Authenticated access that populates req.user even for expired subscriptions.
 * Use ONLY for identity/profile endpoints (e.g. GET /auth/me) where the client
 * needs to read subscriptionIsExpired to show a renewal prompt.
 * Never use this to guard content that should be blocked for expired users.
 */
export async function userAuthAllowExpired(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (!user || !user.isActive) {
    res.status(401).json({ message: "Account not found or deactivated" });
    return;
  }
  const clientIp = getClientIp(req);
  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    accountType: user.accountType,
    subscriptionType: user.subscriptionType,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    ipAddress: user.ipAddress || clientIp,
    isActive: user.isActive,
    phone: user.phone ?? null,
    profileImage: user.profileImage ?? null,
  };
  req.userCreatedAt = user.createdAt;
  next();
}

export async function optionalUserAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) { next(); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (user && user.isActive) {
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      accountType: user.accountType,
      subscriptionType: user.subscriptionType,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      ipAddress: user.ipAddress,
      isActive: user.isActive,
      phone: user.phone ?? null,
      profileImage: user.profileImage ?? null,
    };
    req.userCreatedAt = user.createdAt;
  }
  next();
}

export async function adminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Admin authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid or expired admin token" });
    return;
  }

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, payload.adminId)).limit(1);
  if (!admin) {
    res.status(401).json({ message: "Admin not found" });
    return;
  }

  req.admin = { id: admin.id, username: admin.username };
  next();
}
