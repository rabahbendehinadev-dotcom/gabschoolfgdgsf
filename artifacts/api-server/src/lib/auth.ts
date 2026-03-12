import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "cours-online-secret-key-change-in-production";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "cours-online-admin-secret-key-change-in-production";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: { userId: number }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch {
    return null;
  }
}

export function generateAdminToken(payload: { adminId: number }): string {
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): { adminId: number } | null {
  try {
    return jwt.verify(token, ADMIN_JWT_SECRET) as { adminId: number };
  } catch {
    return null;
  }
}
