import { describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS, recordAnalyticsEvent } from "../../src/analytics.js";

describe("analytics storage failure handling", () => {
  it("fails open when once dedupe storage getItem throws", () => {
    const tracker = vi.fn();
    const storage = {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem: vi.fn(),
    };

    expect(() => recordAnalyticsEvent(ANALYTICS_EVENTS.activation, {
      once: true,
      storage,
      tracker,
    })).not.toThrow();
    expect(tracker).toHaveBeenCalledWith("app_activated");
  });

  it("still deduplicates normally when storage is available", () => {
    const tracker = vi.fn();
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    };

    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.activation, { once: true, storage, tracker })).toBe(true);
    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.activation, { once: true, storage, tracker })).toBe(false);
    expect(tracker).toHaveBeenCalledTimes(1);
  });
});
