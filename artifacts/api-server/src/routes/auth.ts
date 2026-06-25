import { Router, type IRouter } from "express";
import { db, usersTable, adminsTable, subscriptionPlansTable, activityLogsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";

import { hashPassword, comparePassword, generateToken, generateAdminToken } from "../lib/auth";
import { applyVipIpPolicy, getClientIp, VIP_IP_LIMIT_MESSAGE } from "../lib/ipPolicy";
import { deviceTypeFromUA } from "../lib/device";
import { userAuth } from "../middlewares/auth";

import {
  RegisterBody,
  LoginBody,
  AdminLoginBody,
  ChangePasswordBody,
  GoogleLoginBody,
  UpdateMyPhoneBody,
} from "@workspace/api-zod";
import { OAuth2Client } from "google-auth-library";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function sanitizeUsername(base: string): string {
  let u = base.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  if (u.length < 3) u = "user" + u;
  return u.slice(0, 80);
}

async function generateUniqueUsername(base: string): Promise<string> {
  const root = sanitizeUsername(base);
  let candidate = root;
  for (let i = 0; i < 50; i++) {
    const [exists] = await db.select().from(usersTable)
      .where(eq(usersTable.username, candidate)).limit(1);
    if (!exists) return candidate;
    candidate = `${root}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 100);
  }
  return `${root}${Date.now()}`.slice(0, 100);
}

async function logActivity(userId: number | null, username: string | null, action: string, details?: string, ip?: string, ua?: string | null) {
  try {
    await db.insert(activityLogsTable).values({
      userId,
      username,
      action,
      details: details || null,
      ipAddress: ip || null,
      deviceType: ua ? deviceTypeFromUA(ua) : null,
      userAgent: ua || null,
    });
  } catch (_) { }
}

/**
 * Best-effort heuristic that flags abnormal account access by inspecting the
 * user's prior `user_login` rows over the last 24h. Logs `frequent_ip_change`
 * / `frequent_device_change` only when the *current* login introduces a new
 * IP/device that pushes the distinct count to the threshold (>=3), so it does
 * not re-fire on every subsequent login from the same set. Never throws and
 * never blocks login.
 */
async function detectSuspiciousAccess(
  userId: number,
  username: string | null,
  ip: string,
  ua?: string | null,
) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ ipAddress: activityLogsTable.ipAddress, deviceType: activityLogsTable.deviceType })
      .from(activityLogsTable)
      .where(
        and(
          eq(activityLogsTable.userId, userId),
          eq(activityLogsTable.action, "user_login"),
          gte(activityLogsTable.createdAt, since),
        ),
      );

    const priorIps = new Set(recent.map((r) => r.ipAddress).filter(Boolean) as string[]);
    const priorDevices = new Set(recent.map((r) => r.deviceType).filter(Boolean) as string[]);

    const currentDevice = ua ? deviceTypeFromUA(ua) : null;
    const isNewIp = !!ip && !priorIps.has(ip);
    const isNewDevice = !!currentDevice && !priorDevices.has(currentDevice);

    const totalIps = new Set([...priorIps, ...(ip ? [ip] : [])]).size;
    const totalDevices = new Set([...priorDevices, ...(currentDevice ? [currentDevice] : [])]).size;

    if (isNewIp && totalIps >= 3) {
      await logActivity(userId, username, "frequent_ip_change", `عدد عناوين IP المختلفة خلال 24 ساعة: ${totalIps}`, ip, ua);
    }
    if (isNewDevice && totalDevices >= 3) {
      await logActivity(userId, username, "frequent_device_change", `عدد الأجهزة المختلفة خلال 24 ساعة: ${totalDevices}`, ip, ua);
    }
  } catch (_) {
    /* best-effort: detection must never break login */
  }
}

const router: IRouter = Router();

router.post("/auth/register", async (req, res) => {
  try {
    const body = RegisterBody.parse(req.body);
    const existing = await db.select().from(usersTable)
      .where(eq(usersTable.email, body.email)).limit(1);

    if (existing.length > 0) {
      res.status(400).json({ message: "Email already registered" });
      return;
    }

    const existingUsername = await db.select().from(usersTable)
      .where(eq(usersTable.username, body.username)).limit(1);

    if (existingUsername.length > 0) {
      res.status(400).json({ message: "Username already taken" });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    const [demoPlan] = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.type, "demo")).limit(1);
    let subscriptionExpiresAt: Date | undefined;
    if (demoPlan?.durationDays) {
      subscriptionExpiresAt = new Date();
      subscriptionExpiresAt.setDate(subscriptionExpiresAt.getDate() + demoPlan.durationDays);
    }

    const rawPhone = body.phone || "";
    const digitsOnly = rawPhone.replace(/\D/g, "");
    const normalizedPhone = digitsOnly.startsWith("0")
      ? "213" + digitsOnly.slice(1)
      : digitsOnly;

    const [user] = await db.insert(usersTable).values({
      username: body.username,
      email: body.email,
      passwordHash,
      phone: normalizedPhone || null,
      accountType: "normal",
      subscriptionType: "demo",
      subscriptionExpiresAt,
    }).returning();

    const token = generateToken({ userId: user.id });
    const regIp = getClientIp(req);
    await logActivity(user.id, user.username, "user_registered", `New user registered: ${user.username} (${user.email})`, regIp, req.headers["user-agent"]);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        accountType: user.accountType,
        subscriptionType: user.subscriptionType,
        subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
        isActive: user.isActive,
        phone: user.phone ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const body = LoginBody.parse(req.body);
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.email, body.email)).limit(1);

    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const valid = await comparePassword(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ message: "Account is deactivated. Contact admin." });
      return;
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers["user-agent"];

    // IP restriction applies to VIP accounts only (max 2 IPs / 24h window).
    // Normal & demo accounts are never IP-restricted, so skip the locking
    // transaction entirely for them.
    if (user.accountType === "vip") {
      const ipPolicy = await applyVipIpPolicy(user.id, clientIp);
      if (!ipPolicy.allowed) {
        await logActivity(user.id, user.username, "frequent_ip_change", "تجاوز الحد المسموح لعناوين IP لحساب VIP — تم رفض الدخول", clientIp, userAgent);
        res.status(403).json({ message: VIP_IP_LIMIT_MESSAGE });
        return;
      }
    }

    const token = generateToken({ userId: user.id });
    await detectSuspiciousAccess(user.id, user.username, clientIp, userAgent);
    await logActivity(user.id, user.username, "user_login", `Login from IP: ${clientIp}`, clientIp, userAgent);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        accountType: user.accountType,
        subscriptionType: user.subscriptionType,
        subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
        isActive: user.isActive,
        phone: user.phone ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Login failed" });
  }
});

router.post("/auth/admin-login", async (req, res) => {
  try {
    const body = AdminLoginBody.parse(req.body);
    const [admin] = await db.select().from(adminsTable)
      .where(eq(adminsTable.username, body.email)).limit(1);

    if (!admin) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const valid = await comparePassword(body.password, admin.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = generateAdminToken({ adminId: admin.id });

    res.json({
      token,
      admin: { id: admin.id, username: admin.username },
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Admin login failed" });
  }
});

router.get("/auth/me", userAuth, async (req, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    accountType: user.accountType,
    subscriptionType: user.subscriptionType,
    subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
    isActive: user.isActive,
    phone: user.phone ?? null,
    createdAt: req.userCreatedAt?.toISOString() || new Date().toISOString(),
  });
});

router.patch("/auth/me/phone", userAuth, async (req, res) => {
  try {
    const body = UpdateMyPhoneBody.parse(req.body);
    const digitsOnly = body.phone.replace(/\D/g, "");

    // Algerian mobile numbers: 0[5/6/7]xxxxxxxx (local) or 213[5/6/7]xxxxxxxx (international).
    const isLocal = /^0[567]\d{8}$/.test(digitsOnly);
    const isIntl = /^213[567]\d{8}$/.test(digitsOnly);
    if (!isLocal && !isIntl) {
      res.status(400).json({ message: "رقم الهاتف غير صحيح. استعمل رقمًا جزائريًا مثل 0512345678 أو +213512345678" });
      return;
    }

    const normalizedPhone = isLocal ? "213" + digitsOnly.slice(1) : digitsOnly;

    const [updated] = await db.update(usersTable)
      .set({ phone: normalizedPhone })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    res.json({
      id: updated.id,
      username: updated.username,
      email: updated.email,
      accountType: updated.accountType,
      subscriptionType: updated.subscriptionType,
      subscriptionExpiresAt: updated.subscriptionExpiresAt?.toISOString() || null,
      isActive: updated.isActive,
      phone: updated.phone ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update phone" });
  }
});

router.get("/auth/google/config", (_req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null });
});

router.post("/auth/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      res.status(503).json({ message: "Google sign-in is not configured" });
      return;
    }

    const body = GoogleLoginBody.parse(req.body);

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: body.credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      res.status(401).json({ message: "Invalid Google credential" });
      return;
    }

    if (!payload || !payload.email || payload.email_verified === false) {
      res.status(401).json({ message: "Google account email is not verified" });
      return;
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const fullName = payload.name || null;
    const profileImage = payload.picture || null;
    const clientIp = getClientIp(req);
    const userAgent = req.headers["user-agent"];

    const [existing] = await db.select().from(usersTable)
      .where(eq(usersTable.email, email)).limit(1);

    let user;
    if (existing) {
      if (!existing.isActive) {
        res.status(401).json({ message: "Account is deactivated. Contact admin." });
        return;
      }

      if (existing.accountType === "vip") {
        const ipPolicy = await applyVipIpPolicy(existing.id, clientIp);
        if (!ipPolicy.allowed) {
          await logActivity(existing.id, existing.username, "frequent_ip_change", "تجاوز الحد المسموح لعناوين IP لحساب VIP — تم رفض الدخول", clientIp, userAgent);
          res.status(403).json({ message: VIP_IP_LIMIT_MESSAGE });
          return;
        }
      }

      const [updated] = await db.update(usersTable).set({
        googleId: existing.googleId || googleId,
        fullName: existing.fullName || fullName,
        profileImage: profileImage || existing.profileImage,
      }).where(eq(usersTable.id, existing.id)).returning();
      user = updated;
      await detectSuspiciousAccess(user.id, user.username, clientIp, userAgent);
      await logActivity(user.id, user.username, "user_login", `Google login from IP: ${clientIp}`, clientIp, userAgent);
    } else {
      const username = await generateUniqueUsername(email.split("@")[0] || "user");

      const [demoPlan] = await db.select().from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.type, "demo")).limit(1);
      let subscriptionExpiresAt: Date | undefined;
      if (demoPlan?.durationDays) {
        subscriptionExpiresAt = new Date();
        subscriptionExpiresAt.setDate(subscriptionExpiresAt.getDate() + demoPlan.durationDays);
      }

      const [created] = await db.insert(usersTable).values({
        username,
        email,
        googleId,
        fullName,
        profileImage,
        accountType: "normal",
        subscriptionType: "demo",
        subscriptionExpiresAt,
      }).returning();
      user = created;
      await logActivity(user.id, user.username, "user_registered", `New user via Google: ${user.username} (${user.email})`, clientIp, userAgent);
    }

    const token = generateToken({ userId: user.id });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        accountType: user.accountType,
        subscriptionType: user.subscriptionType,
        subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() || null,
        isActive: user.isActive,
        phone: user.phone ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Google login failed" });
  }
});

router.post("/auth/logout", userAuth, async (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

router.post("/auth/change-password", userAuth, async (req, res) => {
  try {
    const body = ChangePasswordBody.parse(req.body);
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.id, req.user!.id)).limit(1);

    if (!user.passwordHash) {
      res.status(400).json({ message: "This account uses Google sign-in and has no password" });
      return;
    }

    const valid = await comparePassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ message: "Current password is incorrect" });
      return;
    }

    const newHash = await hashPassword(body.newPassword);
    await db.update(usersTable).set({ passwordHash: newHash })
      .where(eq(usersTable.id, req.user!.id));

    res.json({ message: "Password changed successfully" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to change password" });
  }
});

export default router;
