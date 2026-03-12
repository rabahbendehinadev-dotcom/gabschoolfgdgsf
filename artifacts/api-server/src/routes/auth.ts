import { Router, type IRouter } from "express";
import { db, usersTable, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, generateToken, generateAdminToken } from "../lib/auth";
import { userAuth } from "../middlewares/auth";
import {
  RegisterBody,
  LoginBody,
  AdminLoginBody,
  ChangePasswordBody,
} from "@workspace/api-zod";

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
    const [user] = await db.insert(usersTable).values({
      username: body.username,
      email: body.email,
      passwordHash,
      accountType: "normal",
      subscriptionType: "demo",
    }).returning();

    const token = generateToken({ userId: user.id });

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
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Registration failed" });
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

    if (user.ipAddress && user.ipAddress !== clientIp) {
      res.status(403).json({ message: "Access denied: This account is linked to a different IP address. Please contact admin to reset your IP." });
      return;
    }

    if (!user.ipAddress) {
      await db.update(usersTable).set({ ipAddress: clientIp }).where(eq(usersTable.id, user.id));
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
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Login failed" });
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
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Admin login failed" });
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
    createdAt: new Date().toISOString(),
  });
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
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to change password" });
  }
});

export default router;
