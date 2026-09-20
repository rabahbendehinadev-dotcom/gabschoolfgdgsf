import assert from "node:assert/strict";
import test from "node:test";
import { hasPaidEntitlement, renewSubscriptionPeriod, resolveSubscriptionPeriod } from "./courseEntitlement";

const NOW = new Date("2026-09-20T12:00:00.000Z");

function user(overrides: Partial<Parameters<typeof hasPaidEntitlement>[0]> = {}) {
  return {
    accountType: "vip",
    subscriptionType: "monthly",
    subscriptionStartedAt: new Date("2026-09-01T00:00:00.000Z"),
    subscriptionExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
    isActive: true,
    securityBlockedAt: null,
    ...overrides,
  };
}

test("accepts a paid subscription inside its exact validity window", () => {
  assert.equal(hasPaidEntitlement(user(), NOW), true);
});

test("reconstructs monthly and annual subscriptions from activation", () => {
  assert.equal(hasPaidEntitlement(user({ subscriptionStartedAt: null }), NOW), false);
  assert.equal(hasPaidEntitlement(
    user({ subscriptionStartedAt: null }),
    NOW,
    new Date("2026-09-07T00:00:00Z"),
  ), true);
  assert.equal(hasPaidEntitlement(user({ subscriptionExpiresAt: null }), NOW), true);
  assert.equal(resolveSubscriptionPeriod(user({ subscriptionStartedAt: null, subscriptionExpiresAt: null }), "2026-09-07T00:00:00Z").end?.toISOString(), "2026-10-07T00:00:00.000Z");
  assert.equal(resolveSubscriptionPeriod(user({
    subscriptionType: "annual",
    subscriptionStartedAt: new Date("2025-09-20T12:00:00Z"),
    subscriptionExpiresAt: null,
  })).end?.toISOString(), "2026-09-20T12:00:00.000Z");
});

test("clamps month and leap-year calendar arithmetic while preserving time", () => {
  assert.equal(
    resolveSubscriptionPeriod(user({ subscriptionStartedAt: new Date("2026-01-31T18:45:00Z"), subscriptionExpiresAt: null })).end?.toISOString(),
    "2026-02-28T18:45:00.000Z",
  );
  assert.equal(
    resolveSubscriptionPeriod(user({ subscriptionStartedAt: new Date("2024-02-29T18:45:00Z"), subscriptionExpiresAt: null }), null).end?.toISOString(),
    "2024-03-29T18:45:00.000Z",
  );
  assert.equal(
    resolveSubscriptionPeriod(user({ subscriptionType: "annual", subscriptionStartedAt: new Date("2024-02-29T18:45:00Z"), subscriptionExpiresAt: null })).end?.toISOString(),
    "2025-02-28T18:45:00.000Z",
  );
});

test("leaves missing activation and expiry ambiguous, and honors explicit expiry", () => {
  assert.equal(hasPaidEntitlement(user({ subscriptionStartedAt: null, subscriptionExpiresAt: null }), NOW), false);
  const explicit = new Date("2026-12-31T23:59:00Z");
  assert.equal(resolveSubscriptionPeriod(user({ subscriptionStartedAt: null, subscriptionExpiresAt: explicit })).end?.getTime(), explicit.getTime());
  assert.equal(hasPaidEntitlement(user({ subscriptionStartedAt: null, subscriptionExpiresAt: explicit }), NOW), false);
});

test("a later course grant cannot reopen the original expired subscription period", () => {
  const legacyUser = user({
    subscriptionStartedAt: null,
    subscriptionExpiresAt: null,
  });
  const originalGrant = new Date("2026-01-31T10:00:00Z");
  const laterGrant = new Date("2026-03-15T10:00:00Z");
  const original = resolveSubscriptionPeriod(legacyUser, originalGrant);
  const later = resolveSubscriptionPeriod({
    ...legacyUser,
    subscriptionStartedAt: original.start,
  }, laterGrant);
  assert.equal(original.end?.toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(later.end?.toISOString(), original.end?.toISOString());
  assert.equal(hasPaidEntitlement(legacyUser, new Date("2026-03-20T00:00:00Z"), originalGrant), false);
});

test("renewal extends active periods and restarts expired periods from server time", () => {
  const activeEnd = new Date("2026-10-31T18:45:00Z");
  const activeRenewal = renewSubscriptionPeriod("monthly", activeEnd, NOW);
  assert.equal(activeRenewal.start.toISOString(), activeEnd.toISOString());
  assert.equal(activeRenewal.end.toISOString(), "2026-11-30T18:45:00.000Z");

  const expiredRenewal = renewSubscriptionPeriod(
    "annual",
    new Date("2026-09-01T00:00:00Z"),
    NOW,
  );
  assert.equal(expiredRenewal.start.toISOString(), NOW.toISOString());
  assert.equal(expiredRenewal.end.toISOString(), "2027-09-20T12:00:00.000Z");
});

test("denies future and exactly expired subscriptions", () => {
  assert.equal(hasPaidEntitlement(user({
    subscriptionStartedAt: new Date("2026-09-21T00:00:00.000Z"),
  }), NOW), false);
  assert.equal(hasPaidEntitlement(user({ subscriptionExpiresAt: NOW }), NOW), false);
});

test("allows lifetime only for an active, unblocked VIP", () => {
  assert.equal(hasPaidEntitlement(user({
    subscriptionType: "lifetime",
    subscriptionStartedAt: null,
    subscriptionExpiresAt: null,
  }), NOW), true);
  assert.equal(hasPaidEntitlement(user({
    subscriptionType: "lifetime",
    subscriptionStartedAt: null,
    subscriptionExpiresAt: null,
    isActive: false,
  }), NOW), false);
  assert.equal(hasPaidEntitlement(user({
    subscriptionType: "lifetime",
    subscriptionStartedAt: null,
    subscriptionExpiresAt: null,
    securityBlockedAt: NOW,
  }), NOW), false);
});