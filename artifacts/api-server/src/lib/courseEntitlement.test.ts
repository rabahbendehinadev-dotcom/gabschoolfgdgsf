import assert from "node:assert/strict";
import test from "node:test";
import { hasPaidEntitlement } from "./courseEntitlement";

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

test("denies monthly and annual subscriptions with missing boundaries", () => {
  assert.equal(hasPaidEntitlement(user({ subscriptionStartedAt: null }), NOW), false);
  assert.equal(hasPaidEntitlement(user({ subscriptionExpiresAt: null }), NOW), false);
  assert.equal(hasPaidEntitlement(user({
    subscriptionType: "annual",
    subscriptionStartedAt: null,
    subscriptionExpiresAt: null,
  }), NOW), false);
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