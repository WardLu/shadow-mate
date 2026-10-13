import { describe, expect, it } from "vitest";
import {
  CONTENT_LEARNING_ACTIVITIES,
  CONTENT_LEARNING_LIMITS,
  contentLearningOccurrenceId,
  hasContentLearningData,
  listContentHistory,
  mergeContentLearning,
  migrateAnonymousContentLearning,
  normalizeContentLearning,
  recordContentCompletion,
  recordManualContentCompletion,
  resolveDailyLearningPlan,
  revokeContentCompletion,
  setContentFeedback,
  skipContentItem,
} from "../../src/content-learning.js";

function makeCatalog({ literacy = [], poems = [], english = [], books = [], writing = [], version = "catalog-v1" } = {}) {
  return { version, literacy, poems, english, books, writing };
}

function makeItems(prefix, count, extra = () => ({})) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    order: index + 1,
    ...extra(index),
  }));
}

function planFor({ learning, dayKey, catalog, enabledActivities = CONTENT_LEARNING_ACTIVITIES, packageId = "package-a", deviceId = "device-a", limits } = {}) {
  return resolveDailyLearningPlan({
    learning,
    learnerScope: "profile:learner-1",
    dayKey,
    packageId,
    catalog,
    enabledActivities,
    deviceId,
    limits,
  });
}

function complete({ learning, result, activityId, itemId, dayKey, deviceId = "device-a", completedAt } = {}) {
  return recordContentCompletion({
    learning,
    plan: result.plan,
    activityId,
    itemId,
    dayKey,
    deviceId,
    completedAt,
  });
}

describe("content learning ledger", () => {
  it("normalizes scoped data, detects facts, and rejects a different learner scope", () => {
    const empty = normalizeContentLearning(null, "profile:learner-1");

    expect(empty).toMatchObject({ schemaVersion: 1, learnerScope: "profile:learner-1" });
    expect(hasContentLearningData(empty)).toBe(false);
    expect(() => normalizeContentLearning({ ...empty, learnerScope: "profile:learner-2" }, "profile:learner-1"))
      .toThrow(/scope/i);
    expect(CONTENT_LEARNING_LIMITS.literacy).toMatchObject({ new: 2, review: 2, continue: 2 });
  });

  it("keeps an unfinished new item as continue on the next day", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 5) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });
    const firstRows = first.plan.activities.literacy;

    expect(firstRows).toHaveLength(2);
    expect(firstRows.map((row) => row.reason)).toEqual(["new", "new"]);

    const second = planFor({ learning: first.nextLearning, dayKey: "2026-10-13", catalog, enabledActivities: ["literacy"] });
    const continueRows = second.plan.activities.literacy.filter((row) => row.reason === "continue");
    const nextNewRows = second.plan.activities.literacy.filter((row) => row.reason === "new");

    expect(continueRows).toHaveLength(2);
    expect(continueRows.some((row) => row.itemId === firstRows[0].itemId)).toBe(true);
    expect(nextNewRows).toHaveLength(0);
    expect(second.plan.activities.literacy).toHaveLength(2);
    expect(second.nextLearning.introductions).toEqual(first.nextLearning.introductions);
    expect(nextNewRows.some((row) => row.itemId === firstRows[1].itemId)).toBe(false);
  });

  it("shares the fresh-content budget between unfinished and new words", () => {
    const catalog = makeCatalog({ english: makeItems("word", 5) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const learning = complete({ learning: first.nextLearning, result: first, activityId: "english",
      itemId: "word-1", dayKey: "2026-10-12" });
    const next = planFor({ learning, dayKey: "2026-10-13", catalog, enabledActivities: ["english"] });

    expect(next.plan.activities.english.map((row) => [row.itemId, row.reason]))
      .toEqual([["word-1", "review"], ["word-2", "continue"], ["word-3", "new"]]);
    expect(next.plan.activities.english.filter((row) => row.reason !== "review")).toHaveLength(2);
  });

  it("returns an immutable same-day snapshot for identical inputs", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 3) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });
    const repeated = planFor({ learning: first.nextLearning, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });

    expect(repeated.plan).toEqual(first.plan);
    expect(repeated.nextLearning).toEqual(first.nextLearning);
    expect(repeated.plan).not.toBe(first.plan);
  });

  it("limits first poem experiences to two in an ISO week while continuing spaced reviews", () => {
    const catalog = makeCatalog({ poems: makeItems("poem", 5) });
    let learning;

    const monday = planFor({ learning, dayKey: "2026-10-12", catalog, enabledActivities: ["poem"] });
    learning = complete({ learning: monday.nextLearning, result: monday, activityId: "poem", dayKey: "2026-10-12" });
    expect(monday.plan.activities.poem[0].reason).toBe("new");

    const tuesday = planFor({ learning, dayKey: "2026-10-13", catalog, enabledActivities: ["poem"] });
    expect(tuesday.plan.activities.poem[0]).toMatchObject({ itemId: monday.plan.activities.poem[0].itemId, reason: "review" });
    learning = complete({ learning: tuesday.nextLearning, result: tuesday, activityId: "poem", itemId: tuesday.plan.activities.poem[0].itemId, dayKey: "2026-10-13" });

    const wednesday = planFor({ learning, dayKey: "2026-10-14", catalog, enabledActivities: ["poem"] });
    expect(wednesday.plan.activities.poem[0].reason).toBe("new");
    learning = complete({ learning: wednesday.nextLearning, result: wednesday, activityId: "poem", dayKey: "2026-10-14" });

    const thursday = planFor({ learning, dayKey: "2026-10-15", catalog, enabledActivities: ["poem"] });
    expect(thursday.plan.activities.poem[0].reason).toBe("review");
    learning = complete({ learning: thursday.nextLearning, result: thursday, activityId: "poem", dayKey: "2026-10-15" });

    const saturday = planFor({ learning, dayKey: "2026-10-17", catalog, enabledActivities: ["poem"] });
    expect(saturday.plan.activities.poem.every((row) => row.reason !== "new")).toBe(true);
    expect(saturday.plan.activities.poem.filter((row) => row.reason === "review").length).toBeLessThanOrEqual(1);
  });

  it("deduplicates same-day completions across devices and advances only from completion", () => {
    const catalog = makeCatalog({ english: makeItems("word", 3) });
    const plan = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const itemId = plan.plan.activities.english[0].itemId;
    const left = complete({ learning: plan.nextLearning, result: plan, activityId: "english", itemId, dayKey: "2026-10-12", deviceId: "device-a" });
    const repeated = complete({ learning: left, result: plan, activityId: "english", itemId, dayKey: "2026-10-12", deviceId: "device-a" });
    const right = complete({ learning: plan.nextLearning, result: plan, activityId: "english", itemId, dayKey: "2026-10-12", deviceId: "device-b" });
    const merged = mergeContentLearning(left, right);

    expect(repeated).toEqual(left);
    expect(listContentHistory(merged, "english")).toHaveLength(1);
    expect(mergeContentLearning(merged, left)).toEqual(merged);

    const nextDay = planFor({ learning: merged, dayKey: "2026-10-13", catalog, enabledActivities: ["english"] });
    expect(nextDay.plan.activities.english.find((row) => row.itemId === itemId)).toMatchObject({ reason: "review" });
  });

  it("uses interval feedback from each completed review and never grants mastery", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 1) });
    const first = planFor({ learning: null, dayKey: "2026-10-01", catalog, enabledActivities: ["literacy"] });
    const itemId = first.plan.activities.literacy[0].itemId;
    let learning = complete({ learning: first.nextLearning, result: first, activityId: "literacy", itemId, dayKey: "2026-10-01" });

    const firstReview = planFor({ learning, dayKey: "2026-10-02", catalog, enabledActivities: ["literacy"] });
    const firstReviewRow = firstReview.plan.activities.literacy[0];
    expect(firstReviewRow.reason).toBe("review");
    learning = complete({ learning: firstReview.nextLearning, result: firstReview, activityId: "literacy", itemId, dayKey: "2026-10-02" });
    learning = setContentFeedback({ learning, occurrenceId: firstReviewRow.occurrenceId, feedback: "independent", deviceId: "device-a" });
    expect(planFor({ learning, dayKey: "2026-10-04", catalog, enabledActivities: ["literacy"] }).plan.activities.literacy).toEqual([]);

    const secondReview = planFor({ learning, dayKey: "2026-10-05", catalog, enabledActivities: ["literacy"] });
    const secondReviewRow = secondReview.plan.activities.literacy[0];
    expect(secondReviewRow).toMatchObject({ itemId, reason: "review" });
    learning = complete({ learning: secondReview.nextLearning, result: secondReview, activityId: "literacy", itemId, dayKey: "2026-10-05" });
    learning = setContentFeedback({ learning, occurrenceId: secondReviewRow.occurrenceId, feedback: "needs-help", deviceId: "device-a" });

    const shortInterval = planFor({ learning, dayKey: "2026-10-06", catalog, enabledActivities: ["literacy"] });
    expect(shortInterval.plan.activities.literacy.find((row) => row.itemId === itemId)?.reason).toBe("review");
    expect(listContentHistory(learning, "literacy").every((entry) => !Object.hasOwn(entry, "mastery"))).toBe(true);
  });

  it("preserves a revocation tombstone and schedules the revoked item to continue", () => {
    const catalog = makeCatalog({ english: makeItems("word", 1) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const itemId = first.plan.activities.english[0].itemId;
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "english", itemId, dayKey: "2026-10-12" });
    const occurrenceId = contentLearningOccurrenceId("english", itemId, "2026-10-12");
    const revoked = revokeContentCompletion({ learning: completed, occurrenceId, deviceId: "device-a" });
    const merged = mergeContentLearning(revoked, completed);
    const next = planFor({ learning: merged, dayKey: "2026-10-13", catalog, enabledActivities: ["english"] });

    expect(listContentHistory(merged, "english")[0]).toMatchObject({ revoked: true, revocationDeviceId: "device-a", revocationRevision: 1 });
    expect(next.plan.activities.english.find((row) => row.itemId === itemId)).toMatchObject({ reason: "continue" });
    expect(mergeContentLearning(merged, completed)).toEqual(merged);
  });

  it("merges offline feedback and skip records associatively and deterministically", () => {
    const catalog = makeCatalog({ english: makeItems("word", 2) });
    const plan = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const itemId = plan.plan.activities.english[0].itemId;
    const base = complete({ learning: plan.nextLearning, result: plan, activityId: "english", itemId, dayKey: "2026-10-12" });
    const occurrenceId = contentLearningOccurrenceId("english", itemId, "2026-10-12");
    const left = setContentFeedback({ learning: base, occurrenceId, feedback: "needs-help", deviceId: "device-a" });
    const right = setContentFeedback({ learning: base, occurrenceId, feedback: "independent", deviceId: "device-b" });
    const third = skipContentItem({ learning: base, activityId: "english", itemId: "word-2", deviceId: "device-c" });

    expect(mergeContentLearning(left, right)).toEqual(mergeContentLearning(right, left));
    expect(mergeContentLearning(mergeContentLearning(left, right), third))
      .toEqual(mergeContentLearning(left, mergeContentLearning(right, third)));
    expect(mergeContentLearning(left, left)).toEqual(left);
  });

  it("does not introduce disabled activities and preserves progress across package changes", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 3), english: makeItems("word", 3) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });
    expect(first.plan.activities.english).toEqual([]);

    const itemId = first.plan.activities.literacy[0].itemId;
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "literacy", itemId, dayKey: "2026-10-12" });
    const enabled = planFor({ learning: completed, dayKey: "2026-10-13", catalog, enabledActivities: ["english"] });
    expect(enabled.plan.activities.english.every((row) => row.reason === "new")).toBe(true);

    const switched = planFor({ learning: completed, dayKey: "2026-10-13", catalog, packageId: "package-b", enabledActivities: ["literacy"] });
    expect(switched.plan.activities.literacy.find((row) => row.itemId === itemId)?.reason).toBe("review");
  });

  it("keeps book continuation ahead of unread items and honors catalog read flags", () => {
    const catalog = makeCatalog({ books: [
      { id: "unfinished", order: 1 },
      { id: "already-read", order: 0, read: true },
      { id: "unread", order: 2 },
    ] });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["book"] });
    expect(first.plan.activities.book[0]).toMatchObject({ itemId: "unfinished", reason: "new" });

    const next = planFor({ learning: first.nextLearning, dayKey: "2026-10-13", catalog, enabledActivities: ["book"] });
    expect(next.plan.activities.book[0]).toMatchObject({ itemId: "unfinished", reason: "continue" });
  });

  it("does not pad writing-only plans with unexposed optional items", () => {
    const catalog = makeCatalog({ writing: makeItems("write", 6, (index) => ({
      glyph: ["一", "二", "三", "人", "大", "小"][index], optional: true, writing: { strokeCount: index + 1 },
    })) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["writing"] });
    const next = planFor({ learning: first.nextLearning, dayKey: "2026-10-13", catalog, enabledActivities: ["writing"] });

    expect(first.plan.activities.writing).toEqual([]);
    expect(first.nextLearning.introductions).toEqual([]);
    expect(next.plan.activities.writing).toEqual([]);
    expect(next.nextLearning.introductions).toEqual([]);
    expect(next.nextLearning.occurrences).toEqual([]);
  });

  it("selects only exposed writing introductions without filling unused rows", () => {
    const catalog = makeCatalog({
      literacy: [{ id: "literacy-one", glyph: "一", order: 1 }, { id: "literacy-two", glyph: "二", order: 2 }],
      writing: [
        { id: "write-hard", glyph: "龘", order: 1, strokeCount: 48, optional: true },
        { id: "write-two", glyph: "二", order: 2, strokeCount: 2, optional: true },
        { id: "write-one", glyph: "一", order: 3, strokeCount: 1, optional: true },
        { id: "write-fallback", glyph: "人", order: 4, strokeCount: 2, optional: true },
      ],
    });
    const literacyPlan = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });
    const exposed = planFor({ learning: literacyPlan.nextLearning, dayKey: "2026-10-13", catalog, enabledActivities: ["writing"] });

    expect(exposed.plan.activities.writing.map((row) => [row.itemId, row.reason]))
      .toEqual([["write-two", "new"], ["write-one", "new"]]);
    expect(exposed.nextLearning.introductions.filter((entry) => entry.activityId === "writing").map((entry) => entry.itemId))
      .toEqual(["write-one", "write-two"]);
    expect(exposed.plan.activities.writing.some((row) => row.itemId === "write-hard")).toBe(false);
    expect(exposed.plan.activities.writing.some((row) => row.itemId === "write-fallback")).toBe(false);
  });

  it("does not convert upstream optional writing items into reviewed content", () => {
    const catalog = makeCatalog({
      literacy: makeItems("hanzi", 2, (index) => ({ glyph: ["一", "二"][index] })),
      writing: makeItems("write", 2, (index) => ({ glyph: ["一", "二"][index], optional: true, writing: { strokeCount: 2 } })),
    });
    const exposure = planFor({ learning: null, dayKey: "2026-09-30", catalog, enabledActivities: ["literacy"] });
    const first = planFor({ learning: exposure.nextLearning, dayKey: "2026-10-01", catalog, enabledActivities: ["writing"] });
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "writing", itemId: "write-1", dayKey: "2026-10-01" });
    const next = planFor({ learning: completed, dayKey: "2026-10-02", catalog, enabledActivities: ["writing"] });

    expect(next.plan.activities.writing.map((row) => row.reason)).toEqual(["review", "continue"]);
    expect(next.plan.activities.writing.every((row) => row.optional === true)).toBe(true);
  });

  it("prunes old plan snapshots while preserving every completion and unfinished introduction", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 4) });
    const first = planFor({ learning: null, dayKey: "2026-07-14", catalog, enabledActivities: ["literacy"] });
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "literacy",
      itemId: first.plan.activities.literacy[0].itemId, dayKey: "2026-07-14" });
    const next = planFor({ learning: completed, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });
    const unfinishedId = first.plan.activities.literacy[1].itemId;

    expect(next.nextLearning.plans["2026-07-14"]).toBeUndefined();
    expect(next.nextLearning.occurrences).toEqual(completed.occurrences);
    expect(next.plan.activities.literacy.find((row) => row.itemId === unfinishedId)?.reason).toBe("continue");
    expect(next.nextLearning.introductions.filter((entry) => entry.firstPlannedDay === "2026-07-14")).toHaveLength(2);
  });

  it("throws when the daily plan candidate cap is exceeded without altering input", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 4) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["literacy"] });
    const saturated = { ...first.nextLearning, plans: {
      "2026-10-12": { candidates: Object.fromEntries(Array.from({ length: 48 }, (_, index) => [`candidate-${index}`, {
        ...first.plan,
        planId: `candidate-${index}`,
      }])) },
    } };
    expect(() => planFor({ learning: saturated, dayKey: "2026-10-12", catalog, packageId: "package-b", enabledActivities: ["literacy"] }))
      .toThrow(/candidate limit/i);
    expect(Object.keys(saturated.plans["2026-10-12"].candidates)).toHaveLength(48);
  });

  it("gives overdue reviews and unfinished items priority over fresh content", () => {
    const catalog = makeCatalog({ english: makeItems("word", 8) });
    const introductions = makeItems("word", 6).map((item) => ({ activityId: "english", itemId: item.id, firstPlannedDay: "2026-10-01" }));
    const occurrences = introductions.slice(0, 4).map((item) => ({ activityId: "english", itemId: item.itemId, dayKey: "2026-10-01",
      occurrenceId: contentLearningOccurrenceId("english", item.itemId, "2026-10-01"),
      completedAt: "2026-10-01T08:00:00.000Z", revision: 0, deviceId: "device-a", revoked: false,
    }));
    const learning = normalizeContentLearning({ learnerScope: "profile:learner-1", introductions, occurrences });
    const result = planFor({ learning, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });

    expect(result.plan.activities.english).toHaveLength(4);
    expect(result.plan.activities.english.map((row) => row.reason)).toEqual(["review", "review", "continue", "continue"]);
    expect(result.plan.activities.english.some((row) => row.reason === "new")).toBe(false);
    expect(result.nextLearning.occurrences).toEqual(learning.occurrences);
  });

  it("does not pad a plan to four rows when fewer eligible items exist", () => {
    const catalog = makeCatalog({ english: makeItems("word", 3) });
    const introductions = makeItems("word", 3).map((item) => ({ activityId: "english", itemId: item.id, firstPlannedDay: "2026-10-01" }));
    const occurrences = introductions.slice(0, 2).map((item) => ({ activityId: "english", itemId: item.itemId, dayKey: "2026-10-01",
      occurrenceId: contentLearningOccurrenceId("english", item.itemId, "2026-10-01"),
      completedAt: "2026-10-01T08:00:00.000Z", revision: 0, deviceId: "device-a", revoked: false,
    }));
    const learning = normalizeContentLearning({ learnerScope: "profile:learner-1", introductions, occurrences });
    const result = planFor({ learning, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });

    expect(result.plan.activities.english.map((row) => [row.itemId, row.reason]))
      .toEqual([["word-1", "review"], ["word-2", "review"], ["word-3", "continue"]]);
  });

  it("prunes old plans after 90 daily snapshots while keeping long absence recovery", () => {
    const catalog = makeCatalog({ english: makeItems("word", 3) });
    const first = planFor({ dayKey: "2026-01-01", catalog, enabledActivities: ["english"] });
    const plans = Object.fromEntries(Array.from({ length: 100 }, (_, index) => {
      const date = new Date("2026-01-01T00:00:00.000Z");
      date.setUTCDate(date.getUTCDate() + index);
      const dayKey = date.toISOString().slice(0, 10);
      const snapshot = { ...first.plan, dayKey, activities: { ...first.plan.activities, english: first.plan.activities.english
        .map((row) => ({ ...row, occurrenceId: contentLearningOccurrenceId(row.activityId, row.itemId, dayKey) })) } };
      return [dayKey, { candidates: { [snapshot.planId]: snapshot } }];
    }));
    const learning = normalizeContentLearning({ ...first.nextLearning, plans });
    expect(Object.keys(learning.plans)).toHaveLength(90);
    expect(learning.plans["2026-01-01"]).toBeUndefined();
    expect(learning.plans["2026-01-11"]).toBeDefined();
    expect(learning.introductions).toHaveLength(2);

    const returned = planFor({ learning, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    expect(returned.plan.activities.english.map((row) => [row.itemId, row.reason]))
      .toEqual([["word-1", "continue"], ["word-2", "continue"]]);
    expect(Object.keys(returned.nextLearning.plans)).toEqual(["2026-10-12"]);
    expect(returned.nextLearning.occurrences).toEqual(learning.occurrences);
    expect(returned.nextLearning.introductions).toEqual(learning.introductions);
  });

  it("records explicit manual experiences without a daily plan", () => {
    const empty = normalizeContentLearning(null, "profile:learner-1");
    const input = { learning: empty, learnerScope: "profile:learner-1", activityId: "english", itemId: "word-outside-plan",
      dayKey: "2026-10-12", deviceId: "device-a", completedAt: "2026-10-12T08:30:00.000Z" };
    const completed = recordManualContentCompletion(input);
    const occurrenceId = contentLearningOccurrenceId("english", "word-outside-plan", "2026-10-12");

    expect(completed.occurrences).toEqual([expect.objectContaining({ occurrenceId, completedAt: input.completedAt })]);
    expect(completed.occurrences[0].revoked).not.toBe(true);
    expect(completed.introductions).toEqual([{ activityId: "english", itemId: "word-outside-plan", firstPlannedDay: "2026-10-12" }]);
    expect(completed.plans).toEqual({});
    expect(recordManualContentCompletion({ ...input, learning: completed, deviceId: "device-b" })).toEqual(completed);
    expect(mergeContentLearning(completed, recordManualContentCompletion(input))).toEqual(completed);
  });

  it("validates manual experience scope and rejects skipped or revoked same-day completions", () => {
    const empty = normalizeContentLearning(null, "profile:learner-1");
    const input = { learning: empty, learnerScope: "profile:learner-1", activityId: "english", itemId: "word-manual", dayKey: "2026-10-12" };
    expect(() => recordManualContentCompletion({ ...input, learnerScope: "profile:learner-2" })).toThrow(/scope/i);
    expect(() => recordManualContentCompletion({ ...input, learning: normalizeContentLearning(null, "profile:learner-2") })).toThrow(/scope/i);
    const skipped = skipContentItem({ learning: empty, activityId: input.activityId, itemId: input.itemId });
    expect(() => recordManualContentCompletion({ ...input, learning: skipped })).toThrow(/skip/i);
    const completed = recordManualContentCompletion(input);
    const revoked = revokeContentCompletion({ learning: completed, occurrenceId: contentLearningOccurrenceId(input.activityId, input.itemId, input.dayKey) });
    expect(() => recordManualContentCompletion({ ...input, learning: revoked })).toThrow(/revoked/i);
    expect(mergeContentLearning(revoked, completed).occurrences[0].revoked).toBe(true);
  });

  it("advances reviews by 1, 3, 7, 14 and 30 local days after actual completion", () => {
    const catalog = makeCatalog({ english: makeItems("word", 1) });
    let result = planFor({ learning: null, dayKey: "2026-10-01", catalog, enabledActivities: ["english"] });
    let learning = complete({ learning: result.nextLearning, result, activityId: "english", dayKey: "2026-10-01" });
    let completionDay = "2026-10-01";
    for (const gap of [1, 3, 7, 14, 30]) {
      const date = new Date(`${completionDay}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + gap);
      const dueDay = date.toISOString().slice(0, 10);
      if (gap > 1) {
        date.setUTCDate(date.getUTCDate() - 1);
        const beforeDue = planFor({ learning, dayKey: date.toISOString().slice(0, 10), catalog, enabledActivities: ["english"] });
        expect(beforeDue.plan.activities.english).toEqual([]);
      }
      result = planFor({ learning, dayKey: dueDay, catalog, enabledActivities: ["english"] });
      expect(result.plan.activities.english[0]?.reason).toBe("review");
      learning = complete({ learning: result.nextLearning, result, activityId: "english", dayKey: dueDay });
      completionDay = dueDay;
    }
    expect(listContentHistory(learning, "english")).toHaveLength(6);
  });

  it("deduplicates completion across switched packages and supports next-day confirmation of a pinned plan", () => {
    const catalog = makeCatalog({ english: makeItems("word", 2) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const itemId = first.plan.activities.english[0].itemId;
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "english", itemId, dayKey: "2026-10-12" });
    const switched = planFor({ learning: first.nextLearning, dayKey: "2026-10-12", catalog, packageId: "package-b", enabledActivities: ["english"] });
    const switchedCompletion = complete({ learning: switched.nextLearning, result: switched, activityId: "english", itemId, dayKey: "2026-10-12", deviceId: "device-b" });
    const merged = mergeContentLearning(completed, switchedCompletion);
    expect(listContentHistory(merged, "english")).toHaveLength(1);

    const nextDay = complete({ learning: first.nextLearning, result: first, activityId: "english", itemId, dayKey: "2026-10-13" });
    expect(listContentHistory(nextDay, "english")[0].occurrenceId).toBe(contentLearningOccurrenceId("english", itemId, "2026-10-13"));
    const due = planFor({ learning: nextDay, dayKey: "2026-10-14", catalog, enabledActivities: ["english"] });
    expect(due.plan.activities.english.find((row) => row.itemId === itemId)?.reason).toBe("review");
  });

  it("preserves multiple same-day plans and reuses a canonical candidate after offline merges", () => {
    const catalog = makeCatalog({ english: makeItems("word", 3), literacy: makeItems("hanzi", 3) });
    const first = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const left = planFor({ learning: first.nextLearning, dayKey: "2026-10-12", catalog, enabledActivities: ["english", "literacy"] });
    const right = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english", "literacy"], deviceId: "device-b" });
    const merged = mergeContentLearning(left.nextLearning, right.nextLearning);
    const candidateIds = Object.keys(merged.plans["2026-10-12"].candidates);
    expect(candidateIds.length).toBeGreaterThan(1);
    const repeated = planFor({ learning: merged, dayKey: "2026-10-12", catalog, enabledActivities: ["english", "literacy"] });
    expect(candidateIds).toContain(repeated.plan.planId);
    expect(repeated.nextLearning).toEqual(merged);
    expect(mergeContentLearning(left.nextLearning, right.nextLearning)).toEqual(mergeContentLearning(right.nextLearning, left.nextLearning));
  });

  it("retains tombstones against higher-revision stale completions and recalculates review intervals after revocation", () => {
    const catalog = makeCatalog({ english: makeItems("word", 1) });
    const first = planFor({ learning: null, dayKey: "2026-10-01", catalog, enabledActivities: ["english"] });
    const itemId = first.plan.activities.english[0].itemId;
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "english", dayKey: "2026-10-01" });
    const second = planFor({ learning: completed, dayKey: "2026-10-02", catalog, enabledActivities: ["english"] });
    const reviewed = complete({ learning: second.nextLearning, result: second, activityId: "english", dayKey: "2026-10-02" });
    const occurrenceId = contentLearningOccurrenceId("english", itemId, "2026-10-02");
    const revoked = revokeContentCompletion({ learning: reviewed, occurrenceId, deviceId: "device-a" });
    const stale = { ...reviewed, occurrences: reviewed.occurrences.map((entry) => ({ ...entry, revision: 100, deviceId: "device-z" })) };
    const merged = mergeContentLearning(revoked, stale);
    expect(listContentHistory(merged, "english").find((entry) => entry.occurrenceId === occurrenceId))
      .toMatchObject({ revoked: true, revocationDeviceId: "device-a", revocationRevision: 1 });
    const next = planFor({ learning: merged, dayKey: "2026-10-03", catalog, enabledActivities: ["english"] });
    expect(next.plan.activities.english[0]?.reason).toBe("review");
    expect(() => complete({ learning: merged, result: second, activityId: "english", dayKey: "2026-10-02" })).toThrow(/revoked/i);
    expect(mergeContentLearning(mergeContentLearning(revoked, reviewed), stale))
      .toEqual(mergeContentLearning(revoked, mergeContentLearning(reviewed, stale)));
  });

  it("does not count plan snapshots alone as learner facts", () => {
    const catalog = makeCatalog();
    const result = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });

    expect(Object.keys(result.nextLearning.plans)).toEqual(["2026-10-12"]);
    expect(result.nextLearning.introductions).toHaveLength(0);
    expect(hasContentLearningData(result.nextLearning)).toBe(false);
  });

  it("migrates anonymous learning to one explicit profile and rekeys plan snapshots", () => {
    const catalog = makeCatalog({ english: makeItems("word", 2) });
    const first = resolveDailyLearningPlan({ learning: null, learnerScope: "anonymous", dayKey: "2026-10-12",
      packageId: "package-a", catalog, enabledActivities: ["english"] });
    const migrated = migrateAnonymousContentLearning(first.nextLearning, "profile:learner-1");

    expect(migrated.learnerScope).toBe("profile:learner-1");
    const migratedPlans = Object.values(migrated.plans["2026-10-12"].candidates);
    expect(migratedPlans).toHaveLength(1);
    expect(migratedPlans[0].planId).not.toBe(first.plan.planId);
    expect(migratedPlans[0].learnerScope).toBe("profile:learner-1");
    expect(() => normalizeContentLearning(migrated, "anonymous")).toThrow(/scope/i);
    expect(() => migrateAnonymousContentLearning(migrated, "profile:learner-2")).toThrow(/anonymous|scope/i);
    expect(() => migrateAnonymousContentLearning(first.nextLearning, "anonymous")).toThrow(/profile/i);
  });

  it("rejects cross-scope plan completions and ledger merges", () => {
    const catalog = makeCatalog({ english: makeItems("word", 1) });
    const result = planFor({ learning: null, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const other = normalizeContentLearning(null, "profile:learner-2");
    expect(() => mergeContentLearning(result.nextLearning, other)).toThrow(/scope/i);
    expect(() => complete({ learning: other, result, activityId: "english", dayKey: "2026-10-12" })).toThrow(/scope/i);
    expect(() => normalizeContentLearning({ learnerScope: "profile:learner-1", occurrences: [{ activityId: "english" }] })).toThrow();
  });

  it("does not invent writing reviews and respects skip and lower optional row limits", () => {
    const catalog = makeCatalog({
      literacy: makeItems("hanzi", 5, (index) => ({ glyph: String(index + 1) })),
      writing: makeItems("write", 5, (index) => ({ glyph: String(index + 1), strokeCount: index + 1, optional: true })),
    });
    const exposed = normalizeContentLearning({ learnerScope: "profile:learner-1", introductions: catalog.literacy
      .map((item) => ({ activityId: "literacy", itemId: item.id, firstPlannedDay: "2026-09-30" })) });
    const first = planFor({ learning: exposed, dayKey: "2026-10-01", catalog, enabledActivities: ["writing"], limits: { writing: { rows: 1 } } });
    expect(first.plan.activities.writing).toHaveLength(1);
    expect(first.plan.activities.writing[0]).toMatchObject({ reason: "new", optional: true });
    const completed = complete({ learning: first.nextLearning, result: first, activityId: "writing", dayKey: "2026-10-01" });
    const review = planFor({ learning: completed, dayKey: "2026-10-02", catalog, enabledActivities: ["writing"], limits: { writing: { rows: 1 } } });
    expect(review.plan.activities.writing[0].reason).toBe("review");
    const reviewed = complete({ learning: review.nextLearning, result: review, activityId: "writing", dayKey: "2026-10-02" });
    const skipped = skipContentItem({ learning: reviewed, activityId: "writing", itemId: "write-2", deviceId: "device-a" });
    const next = planFor({ learning: skipped, dayKey: "2026-10-03", catalog, enabledActivities: ["writing"], limits: { writing: { rows: 1 } } });
    expect(next.plan.activities.writing[0]).toMatchObject({ itemId: "write-3", reason: "new", optional: true });
    expect(next.plan.activities.writing.some((row) => row.itemId === "write-1")).toBe(false);
  });

  it("keeps empty module visits stateless and enforces limits before selecting rows", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 3) });
    const empty = normalizeContentLearning(null, "profile:learner-1");
    const result = planFor({ learning: empty, dayKey: "2026-10-12", catalog, enabledActivities: [] });
    expect(result.nextLearning).toEqual(empty);
    expect(() => planFor({ learning: empty, dayKey: "2026-10-12", catalog, limits: { literacy: { new: 3 } } })).toThrow(/limit/i);
  });

  it("filters only introductions with invalid dates while rejecting incompatible scopes and schemas", () => {
    const result = planFor({ dayKey: "2026-10-12", catalog: makeCatalog({ english: makeItems("word", 1) }), enabledActivities: ["english"] });
    const malformed = ["not-a-day", "2026-02-30", "2026-1-01", "0000-01-01", null, undefined]
      .map((firstPlannedDay) => ({ activityId: "english", itemId: "invalid", firstPlannedDay }));
    const raw = { ...result.nextLearning, introductions: [...result.nextLearning.introductions, ...malformed] };

    expect(normalizeContentLearning(raw).introductions).toEqual(result.nextLearning.introductions);
    expect(raw.introductions).toHaveLength(7);
    expect(hasContentLearningData(result.nextLearning)).toBe(true);
    expect(() => normalizeContentLearning({ ...raw, learnerScope: undefined })).toThrow(/scope/i);
    expect(() => normalizeContentLearning({ ...raw, learnerScope: "invalid" })).toThrow(/scope/i);
    expect(() => normalizeContentLearning({ ...raw, schemaVersion: 99 })).toThrow(/version/i);
    expect(() => normalizeContentLearning({ ...raw, introductions: [{ activityId: "unknown", itemId: "invalid", firstPlannedDay: "not-a-day" }] })).toThrow(/activity/i);
    for (const learnerScope of [undefined, "profile:learner-2"]) {
      const plans = { "2026-10-12": { candidates: { [result.plan.planId]: { ...result.plan, learnerScope } } } };
      expect(() => normalizeContentLearning({ ...raw, plans })).toThrow(/scope/i);
      expect(() => normalizeContentLearning({ ...raw, plans, referenceDay: "2027-02-01" })).toThrow(/scope/i);
    }
  });

  it("refuses completion of a skipped item from a pinned daily plan until the skip is removed", () => {
    const result = planFor({ dayKey: "2026-10-12", catalog: makeCatalog({ english: makeItems("word", 1) }), enabledActivities: ["english"] });
    const itemId = result.plan.activities.english[0].itemId;
    const skipped = skipContentItem({ learning: result.nextLearning, activityId: "english", itemId });
    const before = structuredClone(skipped);

    expect(() => complete({ learning: skipped, result, activityId: "english", dayKey: "2026-10-12" })).toThrow(/skip/i);
    expect(skipped).toEqual(before);
    const restored = skipContentItem({ learning: skipped, activityId: "english", itemId, skipped: false });
    expect(complete({ learning: restored, result, activityId: "english", dayKey: "2026-10-12" }).occurrences).toHaveLength(1);
  });

  it("prioritizes writing reviews and unfinished items ahead of newly exposed glyphs", () => {
    const catalog = makeCatalog({
      literacy: makeItems("hanzi", 6, (index) => ({ glyph: String(index + 1) })),
      writing: makeItems("write", 6, (index) => ({ glyph: String(index + 1), optional: true })),
    });
    const learning = normalizeContentLearning({ learnerScope: "profile:learner-1", introductions: [
      ...catalog.literacy.map((item) => ({ activityId: "literacy", itemId: item.id, firstPlannedDay: "2026-10-01" })),
      { activityId: "writing", itemId: "write-5", firstPlannedDay: "2026-10-01" },
      { activityId: "writing", itemId: "write-6", firstPlannedDay: "2026-10-01" },
    ], occurrences: [{ activityId: "writing", itemId: "write-6", occurrenceId: contentLearningOccurrenceId("writing", "write-6", "2026-10-01"),
      dayKey: "2026-10-01", completedAt: "2026-10-01T08:00:00.000Z" }] });

    expect(planFor({ learning, dayKey: "2026-10-12", catalog, enabledActivities: ["writing"] }).plan.activities.writing
      .map((row) => [row.itemId, row.reason])).toEqual([["write-6", "review"], ["write-5", "continue"], ["write-1", "new"], ["write-2", "new"]]);
    expect(planFor({ learning, dayKey: "2026-10-12", catalog, enabledActivities: ["writing"], limits: { writing: { rows: 0 } } })
      .plan.activities.writing).toEqual([]);
  });

  it("keeps existing daily plans while deduplicating manual and scheduled experiences", () => {
    const catalog = makeCatalog({ english: makeItems("word", 3) });
    const result = planFor({ dayKey: "2026-10-12", catalog, enabledActivities: ["english"] });
    const itemId = result.plan.activities.english[0].itemId;
    const manual = recordManualContentCompletion({ learning: result.nextLearning, learnerScope: "profile:learner-1", activityId: "english", itemId,
      dayKey: "2026-10-12", deviceId: "device-b", completedAt: "2026-10-12T09:00:00.000Z" });
    const scheduled = complete({ learning: manual, result, activityId: "english", itemId, dayKey: "2026-10-12" });
    const outside = recordManualContentCompletion({ learning: scheduled, learnerScope: "profile:learner-1", activityId: "english", itemId: "word-3",
      dayKey: "2026-10-12" });

    expect(scheduled).toEqual(manual);
    expect(outside.plans).toEqual(result.nextLearning.plans);
    expect(result.nextLearning.occurrences).toEqual([]);
    expect(outside.occurrences).toHaveLength(2);
    expect(planFor({ learning: outside, dayKey: "2026-10-12", catalog, enabledActivities: ["english"] }).plan).toEqual(result.plan);
    expect(planFor({ learning: outside, dayKey: "2026-10-13", catalog, enabledActivities: ["english"] }).plan.activities.english
      .filter((row) => row.reason === "review").map((row) => row.itemId)).toEqual(["word-1", "word-3"]);
    const repeat = recordManualContentCompletion({ learning: outside, learnerScope: "profile:learner-1", activityId: "english", itemId,
      dayKey: "2026-10-13" });
    expect(repeat.occurrences).toHaveLength(3);
    expect(repeat.introductions).toEqual(outside.introductions);
  });

  it("prunes older plan snapshots under pressure without losing any of a 600-item history or tombstone", () => {
    const catalog = makeCatalog({ literacy: makeItems("hanzi", 600) });
    const first = planFor({ dayKey: "2026-01-01", catalog, enabledActivities: ["literacy"] });
    const introductions = catalog.literacy.map((item) => ({ activityId: "literacy", itemId: item.id, firstPlannedDay: "2026-01-01" }));
    const occurrences = [1, 2, 3, 4].flatMap((round) => introductions.map((item) => {
      const dayKey = `2026-01-0${round}`;
      return { activityId: item.activityId, itemId: item.itemId, occurrenceId: contentLearningOccurrenceId(item.activityId, item.itemId, dayKey),
        dayKey, completedAt: `${dayKey}T08:00:00.000Z`, revision: 0, deviceId: "device-a", revoked: false };
    }));
    occurrences[0] = { ...occurrences[0], revoked: true, revocationRevision: 1, revocationDeviceId: "device-b" };
    const feedback = [{ occurrenceId: occurrences[1].occurrenceId, feedback: "needs-help", revision: 1, deviceId: "device-a" }];
    const skips = [{ activityId: "literacy", itemId: "hanzi-600", skipped: true, revision: 1, deviceId: "device-a" }];
    const facts = normalizeContentLearning({ learnerScope: "profile:learner-1", introductions, occurrences, feedback, skips });
    const plans = Object.fromEntries(Array.from({ length: 89 }, (_, index) => {
      const date = new Date("2026-01-01T00:00:00.000Z");
      date.setUTCDate(date.getUTCDate() + index);
      const dayKey = date.toISOString().slice(0, 10);
      const snapshot = { ...first.plan, dayKey, activities: { ...first.plan.activities, literacy: first.plan.activities.literacy
        .map((row) => ({ ...row, occurrenceId: contentLearningOccurrenceId(row.activityId, row.itemId, dayKey) })) } };
      return [dayKey, { candidates: { [snapshot.planId]: snapshot } }];
    }));
    const raw = { ...facts, plans, referenceDay: "2026-03-30" };
    const before = structuredClone(raw);
    expect(new TextEncoder().encode(JSON.stringify(raw)).length).toBeGreaterThan(550 * 1024);
    const normalized = normalizeContentLearning(raw);

    expect(Object.keys(normalized.plans).length).toBeLessThan(89);
    expect(Object.values(normalized.plans["2026-03-30"].candidates)[0]).toEqual(Object.values(plans["2026-03-30"].candidates)[0]);
    expect(new TextEncoder().encode(JSON.stringify(normalized)).length).toBeLessThan(550 * 1024);
    expect(normalized.introductions).toEqual(facts.introductions);
    expect(normalized.occurrences).toEqual(facts.occurrences);
    expect(normalized.feedback).toEqual(facts.feedback);
    expect(normalized.skips).toEqual(facts.skips);
    expect(normalizeContentLearning(normalized)).toEqual(normalized);
    expect(mergeContentLearning(normalized, raw)).toEqual(normalized);
    expect(raw).toEqual(before);

    const extraDay = "2026-03-31";
    const overflow = { ...facts, occurrences: [...facts.occurrences, ...introductions.map((item) => ({
      ...item, occurrenceId: contentLearningOccurrenceId(item.activityId, item.itemId, extraDay), dayKey: extraDay,
      completedAt: `${extraDay}T08:00:00.000Z`, revision: 0, deviceId: "device-a", revoked: false,
    }))] };
    const overflowBefore = structuredClone(overflow);
    expect(() => normalizeContentLearning(overflow)).toThrow(/550|budget/i);
    expect(overflow).toEqual(overflowBefore);
  });

  it("enforces the payload budget by throwing instead of dropping ledger facts", () => {
    const oversized = {
      schemaVersion: 1,
      learnerScope: "profile:learner-1",
      introductions: Array.from({ length: 7000 }, (_, index) => ({
        activityId: "literacy",
        itemId: `item-${index}-${"x".repeat(96)}`,
        firstPlannedDay: "2026-10-12",
      })),
    };

    expect(() => normalizeContentLearning(oversized)).toThrow(/550|budget|size/i);
    expect(oversized.introductions).toHaveLength(7000);
  });
});
