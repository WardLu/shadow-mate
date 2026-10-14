import { describe, expect, it } from "vitest";
import { contentLearningOccurrenceId, normalizeContentLearning } from "../../src/content-learning.js";
import { summarizeContentLearning } from "../../src/content-learning-summary.js";

function occurrence(activityId, itemId, dayKey, extra = {}) {
  return { activityId, itemId, dayKey, occurrenceId: contentLearningOccurrenceId(activityId, itemId, dayKey),
    completedAt: `${dayKey}T02:00:00.000Z`, revision: 0, deviceId: "device-a", revoked: false, ...extra };
}

function ledger(occurrences = [], extra = {}) {
  return { ...normalizeContentLearning(null, "anonymous"), occurrences, ...extra };
}

const options = { referenceDay: "2026-10-14" };

describe("learning footprint summary", () => {
  it("counts distinct dates and keeps recognition and writing separate", () => {
    const source = ledger([
      occurrence("literacy", "one", "2026-10-12"),
      occurrence("literacy", "one", "2026-10-13"),
      occurrence("writing", "one", "2026-10-13"),
      occurrence("english", "apple", "2026-10-14"),
    ]);
    const before = structuredClone(source);
    const summary = summarizeContentLearning(source, options);
    expect(summary).toMatchObject({ dayCount: 3, occurrenceCount: 4, itemCount: 3, reviewCount: 1 });
    expect(summary.activities.literacy).toMatchObject({ itemCount: 1, occurrenceCount: 2, reviewCount: 1 });
    expect(summary.activities.writing).toMatchObject({ itemCount: 1, occurrenceCount: 1 });
    expect(summary.activities.literacy.items[0]).toMatchObject({ firstDay: "2026-10-12", latestDay: "2026-10-13", stage: "revisited" });
    expect(source).toEqual(before);
  });

  it("ignores exposure, future dates and revocations, then recomputes first experience", () => {
    const summary = summarizeContentLearning(ledger([
      occurrence("poem", "goose", "2026-10-12", { revoked: true }),
      occurrence("poem", "goose", "2026-10-13"),
      occurrence("poem", "goose", "2026-10-15"),
    ], { introductions: [{ activityId: "literacy", itemId: "not-learned", firstPlannedDay: "2026-10-10" }] }), options);
    expect(summary).toMatchObject({ dayCount: 1, occurrenceCount: 1, reviewCount: 0 });
    expect(summary.activities.literacy.itemCount).toBe(0);
    expect(summary.activities.poem.items[0]).toMatchObject({ firstDay: "2026-10-13", stage: "first", count: 1 });
  });

  it("deduplicates devices and separates full history from selected catalog coverage", () => {
    const same = occurrence("english", "apple", "2026-10-12");
    const summary = summarizeContentLearning(ledger([
      same, { ...same, deviceId: "device-b" }, occurrence("english", "outside", "2026-10-13"),
    ]), { ...options, catalog: { english: [{ id: "apple" }, { id: "banana" }] } });
    expect(summary.activities.english).toMatchObject({ itemCount: 2, occurrenceCount: 2, catalogCount: 2, learnedCatalogCount: 1 });
  });

  it("shows the latest parent observation without inferring mastery", () => {
    const first = occurrence("writing", "sun", "2026-10-12");
    const latest = occurrence("writing", "sun", "2026-10-14");
    const summary = summarizeContentLearning(ledger([first, latest], { feedback: [
      { occurrenceId: first.occurrenceId, feedback: "independent", revision: 0, deviceId: "device-a" },
      { occurrenceId: latest.occurrenceId, feedback: "needs-help", revision: 0, deviceId: "device-a" },
    ] }), options);
    expect(summary.activities.writing.items[0]).toMatchObject({ feedback: "needs-help", stage: "revisited" });
    expect(summary.activities.writing.items[0]).not.toHaveProperty("mastery");
  });

  it("sorts unordered facts and does not carry an older observation into an unobserved day", () => {
    const earlier = occurrence("english", "apple", "2026-10-12");
    const latest = occurrence("english", "apple", "2026-10-14");
    const summary = summarizeContentLearning(ledger([latest, earlier], { feedback: [
      { occurrenceId: earlier.occurrenceId, feedback: "independent", revision: 0, deviceId: "device-a" },
    ] }), options);
    const item = summary.activities.english.items[0];
    expect(item).toMatchObject({ firstDay: "2026-10-12", latestDay: "2026-10-14", feedback: null, reviewCount: 1 });
    expect(item.history.map((entry) => entry.feedback)).toEqual(["independent", null]);
  });

  it("returns an empty footprint for old check-in-only state and validates the reference day", () => {
    expect(summarizeContentLearning(null, options)).toMatchObject({ dayCount: 0, occurrenceCount: 0, firstDay: null, latestDay: null });
    for (const referenceDay of [undefined, "2026-02-30", "0000-01-01"]) {
      expect(() => summarizeContentLearning(null, { referenceDay })).toThrow(/reference day/);
    }
  });
});
