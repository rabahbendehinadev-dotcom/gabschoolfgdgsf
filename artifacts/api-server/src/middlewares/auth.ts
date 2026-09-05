import { Request, Response, NextFunction } from "express";
import { verifyToken, verifyAdminToken } from "../lib/auth";
import { getClientIp } from "../lib/ipPolicy";
import { db, usersTable, adminsTable, adminSessionsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { isActiveCommunitySubscriber } from "../lib/vipUtils";
import { credentialFromRequest, credentialHash, isRequestIpAllowed, validateDeviceCredential, validateSecuritySession } from "../lib/deviceSecurity";
import { canManageSecurity, parseAdminPermissions } from "../lib/adminSecurity";

function hasMatchingDeviceCredential(req: Request, expectedHash: string): boolean {
  const credential = credentialFromRequest(req);
  return !!credential && validateDeviceCredential(credential) && credentialHash(credential) === expectedHash;
}

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
        communityRole: string;
      };
      admin?: {
        id: number;
        username: string;
        email: string | null;
        displayName: string | null;
        role: string;
        permissions: string[];
      };
      userCreatedAt?: Date;
      securitySessionId?: string;
      securityDeviceId?: number;
    }
  }
}

async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
  _enforceIpPolicy: boolean,
  requireCommunitySubscription = false,
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
  if (!user || !user.isActive || user.securityBlockedAt) {
    res.status(401).json({ message: "Account not found or deactivated" });
    return;
  }

  const clientIp = getClientIp(req);

  const securitySession = await validateSecuritySession(payload.userId, payload.deviceId, payload.sessionId);
  if (!securitySession || !hasMatchingDeviceCredential(req, securitySession.device.credentialHash)) {
    res.status(401).json({ message: "Session or trusted device is no longer valid" });
    return;
  }
  if (!await isRequestIpAllowed(user.id, clientIp)) {
    res.status(403).json({ message: "تعذر الوصول لأسباب أمنية. يرجى التواصل مع الإدارة." });
    return;
  }

  const communityAdmin = user.communityRole === "admin";
  if (
    user.subscriptionExpiresAt &&
    new Date(user.subscriptionExpiresAt) < new Date() &&
    !(requireCommunitySubscription && communityAdmin)
  ) {
    res.status(403).json({ message: "Your subscription has expired. Please renew to continue accessing content." });
    return;
  }

  if (requireCommunitySubscription && !isActiveCommunitySubscriber(user)) {
    res.status(403).json({
      message: "هذا المحتوى مخصص للمشتركين",
      code: "COMMUNITY_SUBSCRIPTION_REQUIRED",
    });
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
    communityRole: user.communityRole,
  };
  req.userCreatedAt = user.createdAt;
  req.securitySessionId = payload.sessionId;
  req.securityDeviceId = payload.deviceId;

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

export function communitySubscriberAuth(req: Request, res: Response, next: NextFunction) {
  return authenticateUser(req, res, next, true, true);
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
  if (!user || !user.isActive || user.securityBlockedAt) {
    res.status(401).json({ message: "Account not found or deactivated" });
    return;
  }
  const clientIp = getClientIp(req);
  const securitySession = await validateSecuritySession(payload.userId, payload.deviceId, payload.sessionId);
  if (!securitySession || !hasMatchingDeviceCredential(req, securitySession.device.credentialHash)) {
    res.status(401).json({ message: "Session or trusted device is no longer valid" });
    return;
  }
  if (!await isRequestIpAllowed(user.id, clientIp)) {
    res.status(403).json({ message: "تعذر الوصول لأسباب أمنية. يرجى التواصل مع الإدارة." });
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
    communityRole: user.communityRole,
  };
  req.userCreatedAt = user.createdAt;
  req.securitySessionId = payload.sessionId;
  req.securityDeviceId = payload.deviceId;
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
  const securitySession = user && !user.securityBlockedAt
    ? await validateSecuritySession(payload.userId, payload.deviceId, payload.sessionId)
    : null;
  const requestIpAllowed = user ? await isRequestIpAllowed(user.id, getClientIp(req)) : false;
  if (user && user.isActive && securitySession && hasMatchingDeviceCredential(req, securitySession.device.credentialHash) && requestIpAllowed) {
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
      communityRole: user.communityRole,
    };
    req.userCreatedAt = user.createdAt;
    req.securitySessionId = payload.sessionId;
    req.securityDeviceId = payload.deviceId;
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
  const [adminSession] = await db.select({ id: adminSessionsTable.id }).from(adminSessionsTable)
    .where(and(
      eq(adminSessionsTable.adminId, payload.adminId),
      eq(adminSessionsTable.token, token),
      gt(adminSessionsTable.expiresAt, new Date()),
    )).limit(1);
  if (!admin || !(admin as any).isActive || !adminSession) {
    res.status(401).json({ message: "Admin not found" });
    return;
  }

  req.admin = {
    id: admin.id,
    username: admin.username,
    email: (admin as any).email ?? null,
    displayName: (admin as any).displayName ?? null,
    role: (admin as any).role ?? "super_admin",
    permissions: parseAdminPermissions((admin as any).permissions),
  };
  next();
}

export function securityManageAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.admin || !canManageSecurity(req.admin)) {
    res.status(403).json({ message: "Security management permission required" });
    return;
  }
  next();
}
