import { Router, type IRouter } from "express";
import { db, usersTable, adminsTable, subscriptionPlansTable, activityLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import { hashPassword, comparePassword, generateToken, generateAdminToken } from "../lib/auth";
import { userAuth } from "../middlewares/auth";

import {
  RegisterBody,
  LoginBody,
  AdminLoginBody,
  ChangePasswordBody,
} from "@workspace/api-zod";

async function logActivity(userId: number | null, username: string | null, action: string, details?: string, ip?: string) {
  try {
    await db.insert(activityLogsTable).values({ userId, username, action, details: details || null, ipAddress: ip || null });
  } catch (_) { }
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

    const [user] = await db.insert(usersTable).values({
      username: body.username,
      email: body.email,
      passwordHash,
      accountType: "normal",
      subscriptionType: "demo",
      subscriptionExpiresAt,
    }).returning();

    const token = generateToken({ userId: user.id });
    const regIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
    await logActivity(user.id, user.username, "user_registered", `New user registered: ${user.username} (${user.email})`, regIp);

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

    const valid = await comparePassword(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ message: "Account is deactivated. Contact admin." });
      return;
    }

    const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";

    const ip1 = user.ipAddress;
    const ip2 = user.ipAddress2;

    if (!ip1) {
      // First login — register this as the primary IP
      await db.update(usersTable).set({ ipAddress: clientIp }).where(eq(usersTable.id, user.id));
    } else if (clientIp === ip1 || clientIp === ip2) {
      // IP matches one of the registered devices — allow
    } else if (!ip2) {
      // Second device — register it
      await db.update(usersTable).set({ ipAddress2: clientIp }).where(eq(usersTable.id, user.id));
    } else {
      // Both IPs registered and client doesn't match either
      res.status(403).json({
        message: "لقد وصلت إلى الحد الأقصى للأجهزة المسموح بها. سجّل الدخول من الجهاز الذي دخلت منه أول مرة، أو تواصل مع الأدمن لإعادة الضبط."
      });
      return;
    }

    const token = generateToken({ userId: user.id });
    await logActivity(user.id, user.username, "user_login", `Login from IP: ${clientIp}`, clientIp);

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
    createdAt: req.userCreatedAt?.toISOString() || new Date().toISOString(),
  });
});

router.post("/auth/logout", userAuth, async (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

router.post("/auth/change-password", userAuth, async (req, res) => {
  try {
    const body = ChangePasswordBody.parse(req.body);
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.id, req.user!.id)).limit(1);

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
