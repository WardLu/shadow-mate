import { describe, expect, it } from "vitest";
import {
  CAPABILITY_KEYS,
  COMMERCIAL_CONTRACT_VERSION,
  hasCapability,
  normalizeCapabilitySnapshot,
} from "../../src/commercialization-contract.js";

describe("commercial capability contract", () => {
  it("normalizes a provider response to the stable public capability set", () => {
    const snapshot = normalizeCapabilitySnapshot({
      cloud_sync: true,
      ai_activity_generator: {
        enabled: true,
        remaining: 8,
        resetAt: "2026-09-01T00:00:00.000Z",
      },
      ignored_capability: { enabled: true },
    });

    expect(snapshot.contractVersion).toBe(COMMERCIAL_CONTRACT_VERSION);
    expect(Object.keys(snapshot.capabilities)).toEqual([...CAPABILITY_KEYS]);
    expect(snapshot.capabilities.cloud_sync).toEqual({
      enabled: true,
      remaining: null,
      resetAt: null,
    });
    expect(snapshot.capabilities.ai_activity_generator).toEqual({
      enabled: true,
      remaining: 8,
      resetAt: "2026-09-01T00:00:00.000Z",
    });
    expect(snapshot.capabilities.ignored_capability).toBeUndefined();
  });

  it("drops invalid quota and reset metadata instead of trusting it", () => {
    const snapshot = normalizeCapabilitySnapshot({
      ai_activity_generator: {
        enabled: "yes",
        remaining: -1,
        resetAt: "not-a-date",
      },
    });

    expect(snapshot.capabilities.ai_activity_generator).toEqual({
      enabled: false,
      remaining: null,
      resetAt: null,
    });
  });

  it("treats malformed or missing snapshots as disabled", () => {
    const snapshot = normalizeCapabilitySnapshot(null);

    expect(hasCapability(snapshot, "ai_activity_generator")).toBe(false);
    expect(hasCapability(snapshot, "not-a-capability")).toBe(false);
    expect(hasCapability(null, "cloud_sync")).toBe(false);
  });
});
