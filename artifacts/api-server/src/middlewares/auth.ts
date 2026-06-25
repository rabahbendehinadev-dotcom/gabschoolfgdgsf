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
      };
      admin?: {
        id: number;
        username: string;
      };
      userCreatedAt?: Date;
    }
  }
}

export async function userAuth(req: Request, res: Response, next: NextFunction) {
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
  if (user.accountType === "vip") {
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
