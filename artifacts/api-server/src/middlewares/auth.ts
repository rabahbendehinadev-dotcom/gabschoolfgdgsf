import { Request, Response, NextFunction } from "express";
import { verifyToken, verifyAdminToken } from "../lib/auth";
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
      };
      admin?: {
        id: number;
        username: string;
      };
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

  const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";

  if (user.ipAddress && user.ipAddress !== clientIp) {
    res.status(403).json({ message: "Access denied: This account is linked to a different IP address. Please contact admin to reset." });
    return;
  }

  if (!user.ipAddress) {
    await db.update(usersTable).set({ ipAddress: clientIp }).where(eq(usersTable.id, user.id));
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
  };

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
