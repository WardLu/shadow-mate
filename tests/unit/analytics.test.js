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


describe("analytics failure and streak boundaries", () => {
  it("does not count canceled check-ins, empty days, arrays, or invalid calendar dates", () => {
    for (const middle of [{ math: false }, {}, [], { math: 0 }]) {
      expect(hasConsecutiveCheckinDays({
        "2026-08-10": { math: true }, "2026-08-11": middle, "2026-08-12": { math: true },
      })).toBe(false);
    }
    expect(hasConsecutiveCheckinDays({
      "2026-02-28": { math: true }, "2026-02-29": { math: true }, "2026-02-30": { math: true },
    })).toBe(false);
  });

  it("keeps analytics failures out of product flows and retries an unsent first event", () => {
    const local = storage();
    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.firstCheckin, {
      once: true, storage: local, tracker: () => { throw new Error("blocked"); },
    })).toBe(false);
    const tracker = vi.fn();
    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.firstCheckin, { once: true, storage: local, tracker })).toBe(true);
    expect(tracker).toHaveBeenCalledExactlyOnceWith("first_checkin");
  });

  it("still records when the storage write fails", () => {
    const tracker = vi.fn();
    expect(recordAnalyticsEvent(ANALYTICS_EVENTS.activation, {
      once: true, tracker, storage: { getItem: () => null, setItem: () => { throw new Error("quota"); } },
    })).toBe(true);
    expect(tracker).toHaveBeenCalledExactlyOnceWith("app_activated");
  });
});
