import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryFromUserAgent,
  deviceSlotDecision,
  evaluateTravelRisk,
  isHighConfidenceAnonymous,
  isSecuritySessionUsable,
  issueDeviceCredential,
  loginSuccessEventContext,
  safeDeviceDto,
  safeSecurityUserDto,
  resolveDeviceCredentialSecret,
  shouldBlockIpForReputation,
  validateDeviceCredential,
  type IpAssessment,
} from "./deviceSecurity";
import { canManageSecurity, parseAdminPermissions } from "./adminSecurity";
import { generateVideoStreamToken, verifyVideoStreamToken } from "./auth";

const unknown: IpAssessment = {
  status: "UNKNOWN", confidence: 0, vpn: false, proxy: false, tor: false,
  datacenter: false, anonymous: false, abusive: false,
};

test("device credentials are signed and tampering is rejected", () => {
  const credential = issueDeviceCredential();
  assert.equal(validateDeviceCredential(credential), true);
  assert.equal(validateDeviceCredential(`${credential}x`), false);
  assert.equal(validateDeviceCredential("v1.untrusted.signature"), false);
});

test("phones and tablets share PHONE slot while desktop is COMPUTER", () => {
  assert.equal(categoryFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile"), "PHONE");
  assert.equal(categoryFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "PHONE");
  assert.equal(categoryFromUserAgent("Mozilla/5.0 (Linux; Android 13; Tablet)"), "PHONE");
  assert.equal(categoryFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), "COMPUTER");
});

test("slot policy permits first device and denies same-category replacement", () => {
  assert.equal(deviceSlotDecision(null, 7, "PHONE", false), "REGISTER_TRUSTED");
  assert.equal(deviceSlotDecision(null, 7, "PHONE", true), "REGISTER_BLOCKED");
  assert.equal(deviceSlotDecision({ userId: 7, category: "PHONE", status: "TRUSTED" }, 7, "PHONE", true), "REUSE_TRUSTED");
  assert.equal(deviceSlotDecision({ userId: 7, category: "PHONE", status: "REVOKED" }, 7, "PHONE", false), "DENY_KNOWN");
  assert.equal(deviceSlotDecision({ userId: 7, category: "PHONE", status: "BLOCKED" }, 7, "PHONE", false), "DENY_KNOWN");
});

test("revoked sessions are unusable immediately", () => {
  const future = new Date(Date.now() + 60_000);
  assert.equal(isSecuritySessionUsable({ revokedAt: null, expiresAt: future, deviceStatus: "TRUSTED" }), true);
  assert.equal(isSecuritySessionUsable({ revokedAt: new Date(), expiresAt: future, deviceStatus: "TRUSTED" }), false);
  assert.equal(isSecuritySessionUsable({ revokedAt: null, expiresAt: future, deviceStatus: "REVOKED" }), false);
});

test("only high-confidence anonymous infrastructure triggers reputation block", () => {
  assert.equal(isHighConfidenceAnonymous(unknown), false);
  assert.equal(isHighConfidenceAnonymous({ ...unknown, status: "KNOWN", confidence: 0.95, vpn: true }), true);
  assert.equal(isHighConfidenceAnonymous({ ...unknown, status: "KNOWN", confidence: 0.95, datacenter: true }), true);
  assert.equal(isHighConfidenceAnonymous({ ...unknown, status: "KNOWN", confidence: 0.5, proxy: true }), false);
  assert.equal(shouldBlockIpForReputation({ ...unknown, status: "KNOWN", confidence: 0.99, proxy: true }, true), false);
});

test("impossible travel is high risk but ordinary regional movement is not blocked", () => {
  const now = new Date("2025-01-01T01:00:00Z");
  const impossible = evaluateTravelRisk({
    previous: { latitude: 36.75, longitude: 3.05, at: new Date("2025-01-01T00:00:00Z") },
    current: { latitude: 48.85, longitude: 2.35 }, now, isNewDevice: true,
  });
  assert.equal(impossible.impossible, true);
  assert.ok(impossible.riskScore >= 70);
  const sameDevice = evaluateTravelRisk({
    previous: { latitude: 36.75, longitude: 3.05, at: new Date("2025-01-01T00:00:00Z") },
    current: { latitude: 48.85, longitude: 2.35 }, now, isNewDevice: false,
  });
  assert.equal(sameDevice.impossible, true);
  assert.ok(sameDevice.riskScore >= 70);
  const normal = evaluateTravelRisk({
    previous: { latitude: 36.75, longitude: 3.05, at: new Date("2024-12-31T00:00:00Z") },
    current: { latitude: 36.76, longitude: 3.06 }, now,
  });
  assert.equal(normal.impossible, false);
  assert.equal(normal.riskScore, 0);
});

test("credential-secret resolution rejects missing production secret without global env mutation", () => {
  assert.throws(() => resolveDeviceCredentialSecret({ NODE_ENV: "production" }));
  assert.equal(resolveDeviceCredentialSecret({ NODE_ENV: "test" }), "development-device-secret");
  assert.equal(resolveDeviceCredentialSecret({ NODE_ENV: "production", JWT_SECRET: "configured-secret" }), "configured-secret");
});

test("login success event context preserves geolocation and risk evidence", () => {
  const context = loginSuccessEventContext({
    allowed: true, device: {} as never, deviceCredential: "credential", riskScore: 30,
    riskReasons: ["NEW_DEVICE", "DISTANT_LOCATION"], distanceKm: 340, elapsedSeconds: 7200,
    assessment: { ...unknown, status: "KNOWN", country: "Algeria", region: "Alger", city: "Algiers", latitude: 36.75, longitude: 3.05 },
  });
  assert.deepEqual(context.riskReasons, ["NEW_DEVICE", "DISTANT_LOCATION"]);
  assert.equal(context.latitude, 36.75);
  assert.equal(context.distanceKm, 340);
  assert.equal(context.elapsedSeconds, 7200);
});

test("dashboard DTOs never expose credential or password hashes", () => {
  const device = safeDeviceDto({ id: 1, category: "PHONE", status: "TRUSTED", credentialHash: "secret-hash", userAgent: "ua" });
  const user = safeSecurityUserDto({ id: 1, username: "student", email: "s@example.test", passwordHash: "password-hash", securityBlockedAt: null });
  const serialized = JSON.stringify({ device, user });
  assert.equal("credentialHash" in device, false);
  assert.equal("passwordHash" in user, false);
  assert.equal(serialized.includes("secret-hash"), false);
  assert.equal(serialized.includes("password-hash"), false);
});

test("security administration requires super-admin or explicit permission", () => {
  assert.equal(canManageSecurity({ role: "support", permissions: [] }), false);
  assert.equal(canManageSecurity({ role: "subscription_manager", permissions: [] }), false);
  assert.equal(canManageSecurity({ role: "support", permissions: parseAdminPermissions('["security_manage"]') }), true);
  assert.equal(canManageSecurity({ role: "super_admin", permissions: [] }), true);
});

test("protected stream tokens round-trip only with a device-bound session", () => {
  const bound = generateVideoStreamToken({ userId: 9, videoId: 14, part: 0, deviceId: 3, securitySessionId: "session-id" });
  assert.deepEqual(verifyVideoStreamToken(bound), { userId: 9, videoId: 14, part: 0, deviceId: 3, securitySessionId: "session-id" });
  assert.throws(() => generateVideoStreamToken({ userId: 9, videoId: 14, part: 0 }));
  const visitor = generateVideoStreamToken({ userId: 0, videoId: 14, part: 0 });
  assert.equal(verifyVideoStreamToken(visitor)?.deviceId, undefined);
});