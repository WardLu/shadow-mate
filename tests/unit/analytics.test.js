import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENTS,
  hasConsecutiveCheckinDays,
  recordAnalyticsEvent,
} from "../../src/analytics.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("minimum product analytics", () => {
  it("records only an allowlisted event and deduplicates one-time events locally", () => {
    const tracker = vi.fn();
    const localStorage = storage();

    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.activation, {
      once: true,
      storage: localStorage,
      tracker,
    })).toBe(true);
    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.activation, {
      once: true,
      storage: localStorage,
      tracker,
    })).toBe(false);
    expect(recordAnalyticsEvent("learner_name", {
      storage: localStorage,
      tracker,
    })).toBe(false);

    expect(tracker).toHaveBeenCalledTimes(1);
    expect(tracker).toHaveBeenCalledWith("app_activated");
  });

  it("recognizes three distinct consecutive check-in days without reading event details", () => {
    expect(hasConsecutiveCheckinDays({
      "2026-08-10": { "english-vocabulary": true },
      "2026-08-11": { "math-mental": true },
      "2026-08-12": { "book-reading": true },
    }, 3)).toBe(true);

    expect(hasConsecutiveCheckinDays({
      "2026-08-10": { "english-vocabulary": true },
      "2026-08-12": { "book-reading": true },
    }, 3)).toBe(false);
  });
});
