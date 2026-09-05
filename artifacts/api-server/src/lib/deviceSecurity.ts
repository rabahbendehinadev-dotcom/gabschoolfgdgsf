import crypto from "node:crypto";
import type { Request } from "express";
import { and, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import {
  db,
  securityEventsTable,
  securityWhitelistsTable,
  trustedDevicesTable,
  userSecuritySessionsTable,
  usersTable,
} from "@workspace/db";
import { deviceTypeFromUA } from "./device";

export const UNAUTHORIZED_DEVICE_MESSAGE =
  "هذا الجهاز غير مصرح به لهذا الحساب. تواصل مع الإدارة لتغيير الجهاز.";
export const SECURITY_BLOCKED_MESSAGE =
  "تعذر تسجيل الدخول لأسباب أمنية. يرجى التواصل مع الإدارة.";

export type DeviceCategory = "PHONE" | "COMPUTER";
export type DeviceStatus = "TRUSTED" | "BLOCKED" | "REVOKED";
export type IpAssessment = {
  status: "KNOWN" | "UNKNOWN";
  confidence: number;
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  datacenter: boolean;
  anonymous: boolean;
  abusive: boolean;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  raw?: Record<string, unknown>;
};

export function resolveDeviceCredentialSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.DEVICE_CREDENTIAL_SECRET || env.JWT_SECRET || env.SESSION_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error("DEVICE_CREDENTIAL_SECRET, JWT_SECRET, or SESSION_SECRET must be configured in production");
  }
  return "development-device-secret";
}

export function assertDeviceCredentialSecretConfigured(env: NodeJS.ProcessEnv = process.env): void {
  resolveDeviceCredentialSecret(env);
}

function b64(value: Buffer): string {
  return value.toString("base64url");
}

function signature(secret: string): string {
  const signingKey = `GAB trusted-device credential v1:${resolveDeviceCredentialSecret()}`;
  return b64(crypto.createHmac("sha256", signingKey).update(`v1.${secret}`).digest());
}

export function issueDeviceCredential(): string {
  const secret = b64(crypto.randomBytes(32));
  return `v1.${secret}.${signature(secret)}`;
}

export function validateDeviceCredential(value?: string | null): boolean {
  if (!value) return false;
  const [version, secret, supplied] = value.split(".");
  if (version !== "v1" || !secret || !supplied) return false;
  const expected = signature(secret);
  if (expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export function credentialHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function credentialFromRequest(req: Request): string | null {
  const header = req.header("x-device-credential");
  const body = req.body && typeof req.body === "object" ? req.body.deviceCredential : null;
  return typeof header === "string" ? header : typeof body === "string" ? body : null;
}

export function categoryFromUserAgent(ua?: string | null): DeviceCategory {
  return deviceTypeFromUA(ua) === "desktop" ? "COMPUTER" : "PHONE";
}

/** Pure policy primitive used by login registration and focused tests. */
export function deviceSlotDecision(
  known: { userId: number; category: DeviceCategory; status: DeviceStatus } | null,
  userId: number,
  category: DeviceCategory,
  hasTrustedSlot: boolean,
): "REUSE_TRUSTED" | "DENY_KNOWN" | "REGISTER_TRUSTED" | "REGISTER_BLOCKED" {
  if (known?.userId === userId) {
    return known.status === "TRUSTED" && known.category === category ? "REUSE_TRUSTED" : "DENY_KNOWN";
  }
  return hasTrustedSlot ? "REGISTER_BLOCKED" : "REGISTER_TRUSTED";
}

export function isHighConfidenceAnonymous(reputation: IpAssessment, threshold = 0.8): boolean {
  return reputation.status === "KNOWN" && reputation.confidence >= threshold &&
    (reputation.vpn || reputation.proxy || reputation.tor || reputation.datacenter || reputation.anonymous || reputation.abusive);
}

export function shouldBlockIpForReputation(reputation: IpAssessment, whitelisted: boolean, threshold = 0.8): boolean {
  return !whitelisted && isHighConfidenceAnonymous(reputation, threshold);
}

export function evaluateTravelRisk(args: {
  previous?: { latitude: number; longitude: number; at: Date };
  current?: { latitude: number; longitude: number };
  now?: Date;
  isNewDevice?: boolean;
}): { riskScore: number; reasons: string[]; distanceKm?: number; elapsedSeconds?: number; impossible: boolean } {
  const reasons = args.isNewDevice ? ["NEW_DEVICE"] : [];
  let riskScore = args.isNewDevice ? 15 : 0;
  if (!args.previous || !args.current) return { riskScore, reasons, impossible: false };
  const distance = distanceKm(args.previous.latitude, args.previous.longitude, args.current.latitude, args.current.longitude);
  const elapsed = Math.max(1, ((args.now ?? new Date()).getTime() - args.previous.at.getTime()) / 1000);
  const speed = distance / (elapsed / 3600);
  if (distance >= 500 && elapsed <= 6 * 3600 && speed > 900) {
    // Impossible travel is high risk even when the same trusted browser is used.
    return { riskScore: Math.max(70, riskScore + 55), reasons: [...reasons, "IMPOSSIBLE_TRAVEL"], distanceKm: distance, elapsedSeconds: elapsed, impossible: true };
  }
  if (distance >= 300) {
    return { riskScore: riskScore + 15, reasons: [...reasons, "DISTANT_LOCATION"], distanceKm: distance, elapsedSeconds: elapsed, impossible: false };
  }
  return { riskScore, reasons, distanceKm: distance, elapsedSeconds: elapsed, impossible: false };
}

/** Pure equivalent of the DB predicates used for session validation. */
export function isSecuritySessionUsable(args: {
  revokedAt: Date | null;
  expiresAt: Date;
  deviceStatus: DeviceStatus;
  now?: Date;
}): boolean {
  return args.revokedAt === null && args.expiresAt > (args.now ?? new Date()) && args.deviceStatus === "TRUSTED";
}

function clientInfo(ua?: string | null): { os: string; browser: string } {
  const value = ua || "";
  const os = /iPhone|iPad|iPod/i.test(value) ? "iOS"
    : /Android/i.test(value) ? "Android"
      : /Windows/i.test(value) ? "Windows"
        : /Mac OS|Macintosh/i.test(value) ? "macOS"
          : /Linux/i.test(value) ? "Linux" : "Unknown";
  const browser = /Edg\//i.test(value) ? "Edge"
    : /OPR\//i.test(value) ? "Opera"
      : /Firefox\//i.test(value) ? "Firefox"
        : /Chrome\//i.test(value) ? "Chrome"
          : /Safari\//i.test(value) ? "Safari" : "Unknown";
  return { os, browser };
}

function bool(source: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => source[key] === true || source[key] === "true" || source[key] === 1);
}

function text(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof source[key] === "string") return source[key] as string;
  return undefined;
}

function number(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

/** Generic JSON provider. URL may contain {ip}; token/header and field aliases are env configurable. */
export async function assessIp(ip: string): Promise<IpAssessment> {
  const template = process.env.IP_REPUTATION_URL;
  if (!template) return { status: "UNKNOWN", confidence: 0, vpn: false, proxy: false, tor: false, datacenter: false, anonymous: false, abusive: false };
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.IP_REPUTATION_API_KEY) {
      headers[process.env.IP_REPUTATION_API_KEY_HEADER || "Authorization"] =
        (process.env.IP_REPUTATION_API_KEY_PREFIX ?? "Bearer ") + process.env.IP_REPUTATION_API_KEY;
    }
    const response = await fetch(template.replaceAll("{ip}", encodeURIComponent(ip)), {
      headers,
      signal: AbortSignal.timeout(Number(process.env.IP_REPUTATION_TIMEOUT_MS || 2500)),
    });
    if (!response.ok) throw new Error(`provider status ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    const confidenceValue = number(raw, "confidence", "risk_score", "riskScore") ?? 0;
    return {
      status: "KNOWN",
      confidence: confidenceValue > 1 ? confidenceValue / 100 : confidenceValue,
      vpn: bool(raw, "vpn", "is_vpn"),
      proxy: bool(raw, "proxy", "is_proxy"),
      tor: bool(raw, "tor", "is_tor"),
      datacenter: bool(raw, "datacenter", "hosting", "is_hosting"),
      anonymous: bool(raw, "anonymous", "anonymous_relay"),
      abusive: bool(raw, "abusive", "abuse"),
      country: text(raw, "country", "country_name"),
      region: text(raw, "region", "region_name"),
      city: text(raw, "city"),
      latitude: number(raw, "latitude", "lat"),
      longitude: number(raw, "longitude", "lon", "lng"),
      raw,
    };
  } catch {
    return { status: "UNKNOWN", confidence: 0, vpn: false, proxy: false, tor: false, datacenter: false, anonymous: false, abusive: false };
  }
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function isWhitelisted(userId: number, ip: string): Promise<boolean> {
  const [row] = await db.select({ id: securityWhitelistsTable.id }).from(securityWhitelistsTable)
    .where(and(
      eq(securityWhitelistsTable.isActive, true),
      or(eq(securityWhitelistsTable.userId, userId), eq(securityWhitelistsTable.ipAddress, ip)),
    )).limit(1);
  return !!row;
}

export async function isRequestIpAllowed(userId: number, ip: string): Promise<boolean> {
  const reputation = await assessIp(ip);
  if (reputation.status === "UNKNOWN" || await isWhitelisted(userId, ip)) return true;
  if (!shouldBlockIpForReputation(reputation, false, Number(process.env.IP_REPUTATION_BLOCK_CONFIDENCE || 0.8))) return true;
  await recordSecurityEvent({
    userId, eventType: "SESSION_IP_REPUTATION_BLOCKED", outcome: "BLOCKED",
    ipAddress: ip, reputation, riskScore: 100, riskReasons: ["VPN_PROXY"],
  });
  return false;
}

export async function recordSecurityEvent(values: typeof securityEventsTable.$inferInsert): Promise<void> {
  await db.insert(securityEventsTable).values(values).catch(() => undefined);
}

export type LoginSecurityResult =
  | { allowed: true; device: typeof trustedDevicesTable.$inferSelect; deviceCredential: string; riskScore: number; riskReasons: string[]; assessment: IpAssessment; distanceKm?: number; elapsedSeconds?: number }
  | { allowed: false; message: string; deviceCredential?: string; status: 403 };

export function loginSuccessEventContext(result: Extract<LoginSecurityResult, { allowed: true }>) {
  return {
    riskScore: result.riskScore,
    riskReasons: result.riskReasons,
    country: result.assessment.country,
    region: result.assessment.region,
    city: result.assessment.city,
    latitude: result.assessment.latitude,
    longitude: result.assessment.longitude,
    distanceKm: result.distanceKm,
    elapsedSeconds: result.elapsedSeconds ? Math.round(result.elapsedSeconds) : undefined,
    reputation: result.assessment,
  };
}

export function safeDeviceDto(device: Record<string, unknown>) {
  const { id, userId, category, status, os, browser, userAgent, firstSeenAt, lastSeenAt, lastIp, country, region, city, latitude, longitude, createdBy, revokedAt } = device;
  return { id, userId, category, status, os, browser, userAgent, firstSeenAt, lastSeenAt, lastIp, country, region, city, latitude, longitude, createdBy, revokedAt };
}

export function safeSecurityUserDto(user: Record<string, unknown>) {
  const { id, username, email, isActive, accountType, subscriptionType, subscriptionExpiresAt, securityBlockedAt, securityBlockedReason } = user;
  return { id, username, email, isActive, accountType, subscriptionType, subscriptionExpiresAt, securityBlockedAt, securityBlockedReason };
}

export async function authorizeDeviceLogin(args: {
  userId: number; ip: string; userAgent?: string | null; suppliedCredential?: string | null;
}): Promise<LoginSecurityResult> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, args.userId)).limit(1);
  if (!user || user.securityBlockedAt) {
    await recordSecurityEvent({ userId: args.userId, eventType: "LOGIN_FAILED", outcome: "BLOCKED", ipAddress: args.ip, riskReasons: ["USER_SECURITY_BLOCKED"], riskScore: 100 });
    return { allowed: false, message: SECURITY_BLOCKED_MESSAGE, status: 403 };
  }

  const reputation = await assessIp(args.ip);
  const whitelisted = await isWhitelisted(args.userId, args.ip);
  if (shouldBlockIpForReputation(reputation, whitelisted, Number(process.env.IP_REPUTATION_BLOCK_CONFIDENCE || 0.8))) {
    const eventType = reputation.tor ? "TOR_DETECTED" : reputation.vpn ? "VPN_DETECTED"
      : reputation.proxy ? "PROXY_DETECTED" : reputation.datacenter ? "DATACENTER_IP_DETECTED" : "ANONYMOUS_IP_DETECTED";
    await recordSecurityEvent({ userId: args.userId, eventType, outcome: "BLOCKED", ipAddress: args.ip, reputation, riskScore: 100, riskReasons: ["VPN_PROXY"] });
    return { allowed: false, message: SECURITY_BLOCKED_MESSAGE, status: 403 };
  }

  const category = categoryFromUserAgent(args.userAgent);
  const validSupplied = validateDeviceCredential(args.suppliedCredential);
  const suppliedHash = validSupplied ? credentialHash(args.suppliedCredential!) : null;
  let credential = validSupplied ? args.suppliedCredential! : issueDeviceCredential();
  const info = clientInfo(args.userAgent);

  const deviceResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${args.userId} FOR UPDATE`);
    if (suppliedHash) {
      const [known] = await tx.select().from(trustedDevicesTable)
        .where(eq(trustedDevicesTable.credentialHash, suppliedHash)).limit(1);
      if (known?.userId === args.userId) return { device: known, fresh: false };
      if (known) credential = issueDeviceCredential();
    }
    const [occupied] = await tx.select().from(trustedDevicesTable)
      .where(and(eq(trustedDevicesTable.userId, args.userId), eq(trustedDevicesTable.category, category), eq(trustedDevicesTable.status, "TRUSTED"))).limit(1);
    const decision = deviceSlotDecision(null, args.userId, category, !!occupied);
    const [created] = await tx.insert(trustedDevicesTable).values({
      userId: args.userId, credentialHash: credentialHash(credential), category,
      os: info.os, browser: info.browser, userAgent: args.userAgent, lastIp: args.ip,
      country: reputation.country, region: reputation.region, city: reputation.city,
      latitude: reputation.latitude, longitude: reputation.longitude,
      status: decision === "REGISTER_BLOCKED" ? "BLOCKED" : "TRUSTED",
    }).returning();
    return { device: created, fresh: true };
  });

  if (deviceResult.device.status !== "TRUSTED") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const previousAttempts = await db.select({ id: securityEventsTable.id }).from(securityEventsTable)
      .where(and(eq(securityEventsTable.userId, args.userId), eq(securityEventsTable.eventType, "DEVICE_BLOCKED"), gte(securityEventsTable.createdAt, since)));
    const repeated = previousAttempts.length >= 2;
    await recordSecurityEvent({ userId: args.userId, deviceId: deviceResult.device.id, eventType: "DEVICE_BLOCKED", outcome: "BLOCKED", ipAddress: args.ip, riskScore: Math.min(100, 90 + previousAttempts.length * 3), riskReasons: repeated ? ["NEW_DEVICE", "CATEGORY_SLOT_OCCUPIED", "MULTIPLE_FAILED_DEVICE_ATTEMPTS"] : ["NEW_DEVICE", "CATEGORY_SLOT_OCCUPIED"], reputation });
    return { allowed: false, message: UNAUTHORIZED_DEVICE_MESSAGE, deviceCredential: credential, status: 403 };
  }

  if (!deviceResult.fresh) credential = args.suppliedCredential!;
  const [previous] = await db.select().from(securityEventsTable)
    .where(and(eq(securityEventsTable.userId, args.userId), eq(securityEventsTable.eventType, "LOGIN_SUCCESS")))
    .orderBy(desc(securityEventsTable.createdAt)).limit(1);
  const travel = evaluateTravelRisk({
    isNewDevice: deviceResult.fresh,
    previous: previous?.latitude != null && previous.longitude != null
      ? { latitude: previous.latitude, longitude: previous.longitude, at: previous.createdAt } : undefined,
    current: reputation.latitude != null && reputation.longitude != null
      ? { latitude: reputation.latitude, longitude: reputation.longitude } : undefined,
  });
  const reasons = travel.reasons;
  const riskScore = travel.riskScore;
  if (travel.impossible) {
      await recordSecurityEvent({ userId: args.userId, deviceId: deviceResult.device.id, eventType: "IMPOSSIBLE_TRAVEL", outcome: "ALERT", ipAddress: args.ip, riskScore, riskReasons: reasons, distanceKm: travel.distanceKm, elapsedSeconds: Math.round(travel.elapsedSeconds!), country: reputation.country, region: reputation.region, city: reputation.city, latitude: reputation.latitude, longitude: reputation.longitude });
      if (riskScore >= Number(process.env.SECURITY_HIGH_RISK_SCORE || 70)) {
        return { allowed: false, message: SECURITY_BLOCKED_MESSAGE, status: 403 };
      }
  }
  if (reasons.includes("DISTANT_LOCATION")) {
    await recordSecurityEvent({ userId: args.userId, deviceId: deviceResult.device.id, eventType: "LOCATION_ANOMALY", outcome: "ALERT", ipAddress: args.ip, riskScore, riskReasons: reasons, distanceKm: travel.distanceKm, elapsedSeconds: Math.round(travel.elapsedSeconds!), country: reputation.country, region: reputation.region, city: reputation.city, latitude: reputation.latitude, longitude: reputation.longitude });
  }
  await db.update(trustedDevicesTable).set({
    lastSeenAt: new Date(), lastIp: args.ip, country: reputation.country, region: reputation.region,
    city: reputation.city, latitude: reputation.latitude, longitude: reputation.longitude,
  }).where(eq(trustedDevicesTable.id, deviceResult.device.id));
  if (deviceResult.fresh) await recordSecurityEvent({ userId: args.userId, deviceId: deviceResult.device.id, eventType: "DEVICE_REGISTERED", outcome: "ALLOWED", ipAddress: args.ip });
  return { allowed: true, device: deviceResult.device, deviceCredential: credential, riskScore, riskReasons: reasons, assessment: reputation, distanceKm: travel.distanceKm, elapsedSeconds: travel.elapsedSeconds };
}

export async function createSecuritySession(userId: number, deviceId: number, ip: string) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(userSecuritySessionsTable).values({ id, userId, deviceId, ipAddress: ip, expiresAt });
  return { id, expiresAt };
}

export async function validateSecuritySession(userId: number, deviceId: number, sessionId: string) {
  const [row] = await db.select({ session: userSecuritySessionsTable, device: trustedDevicesTable })
    .from(userSecuritySessionsTable)
    .innerJoin(trustedDevicesTable, eq(userSecuritySessionsTable.deviceId, trustedDevicesTable.id))
    .where(and(
      eq(userSecuritySessionsTable.id, sessionId),
      eq(userSecuritySessionsTable.userId, userId),
      eq(userSecuritySessionsTable.deviceId, deviceId),
      isNull(userSecuritySessionsTable.revokedAt),
      gt(userSecuritySessionsTable.expiresAt, new Date()),
      eq(trustedDevicesTable.status, "TRUSTED"),
    )).limit(1);
  if (row && isSecuritySessionUsable({
    revokedAt: row.session.revokedAt,
    expiresAt: row.session.expiresAt,
    deviceStatus: row.device.status as DeviceStatus,
  })) {
    const now = new Date();
    await Promise.all([
      db.update(userSecuritySessionsTable).set({ lastSeenAt: now }).where(eq(userSecuritySessionsTable.id, sessionId)),
      db.update(trustedDevicesTable).set({ lastSeenAt: now }).where(eq(trustedDevicesTable.id, deviceId)),
    ]).catch(() => undefined);
  }
  return row ?? null;
}