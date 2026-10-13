import { describe, expect, it } from "vitest";
import {
  CHECKIN_GROUPS,
  createLearningState,
  getContentLearningState,
  getHanziRotationState,
  hasCompatibleContentLearningScope,
  hasCompatibleHanziRotationScope,
  hasCheckin,
  isPointMarked,
  dropIncompatibleHanziRotation,
  normalizeLearningStateForScope,
  normalizeLearningState,
  replaceContentLearningState,
  replaceHanziRotationState,
  transitionLearningState,
} from "../../src/learning-state.js";
import { resolveDailyLearningPlan } from "../../src/content-learning.js";
import { getEnabledModuleIds } from "../../src/learning-content-package.js";
import { resolveDailyWorksheet } from "../../src/hanzi-worksheet-rotation.js";
import { getActiveHanziWritingPack } from "../../src/content/hanzi-writing/manifest.js";

const toggle = (state, action) => transitionLearningState(state, action);
const HANZI_PACK = getActiveHanziWritingPack();

function makeContentLearning(learnerScope = "profile:learner-a") {
  return resolveDailyLearningPlan({
    learning: null,
    learnerScope,
    dayKey: "2026-10-13",
    packageId: "foundation-v2",
    catalog: { version: "test-v1", english: [{ id: "word-a", order: 1 }] },
    enabledActivities: ["english"],
    deviceId: "device-a",
  }).nextLearning;
}

function makeRotationState(learnerScope = "anonymous") {
  return resolveDailyWorksheet({
    rotationState: {},
    pack: HANZI_PACK,
    learnerScope,
    now: new Date("2026-09-01T00:30:00.000Z"),
    timeZone: "Asia/Singapore",
  }).rotationState;
}

describe("learning state machine", () => {
  it("creates an empty state without sharing mutable defaults", () => {
    const first = createLearningState();
    const second = createLearningState();

    first.checkins["2026-08-01"] = { "chinese-literacy": true };

    expect(second).toEqual({
      checkins: {},
      extra: {},
      points: {},
      bookShelf: {},
      peanutLog: [],
      peanutRead: {},
      content_config: {
        schema_version: 1,
        package_id: "foundation-v2",
        package_version: 2,
        enabled: true,
        modules: { chinese: true, math: true, english: true, book: true },
      },
    });
  });

  it("migrates legacy book flags while preserving every other learning state field", () => {
    const learning = makeContentLearning();
    const initial = {
      checkins: { "2026-10-13": { english: true } },
      extra: { marker: "keep", contentLearningV1: learning },
      points: { legacy: { total: 3 } },
      bookShelf: { 0: true, "book-brown-bear": false, 99: true },
      peanutLog: [{ date: "2026-10-13", title: "Keep this log", rating: 4 }],
      peanutRead: { 7: true, 11: false },
      content_config: { enabled: false },
    };
    const normalized = createLearningState(initial);

    expect(normalized.bookShelf).toEqual({ "book-very-hungry-caterpillar": true, "book-brown-bear": false, 99: true });
    expect(normalized.peanutRead).toEqual({ "reading-very-hungry-caterpillar": true, "reading-i-can-read": false });
    expect(normalized.checkins).toEqual(initial.checkins);
    expect(normalized.extra).toEqual(initial.extra);
    expect(normalized.points).toEqual(initial.points);
    expect(normalized.peanutLog).toEqual(initial.peanutLog);
    expect(normalized.content_config.enabled).toBe(false);
    expect(createLearningState(normalized)).toEqual(normalized);
    expect(initial.bookShelf[0]).toBe(true);
    expect(initial.peanutRead[7]).toBe(true);
  });

  it("normalizes malformed state containers and legacy group queries", () => {
    const normalized = normalizeLearningState({
      checkins: [],
      points: null,
      peanutLog: "not-a-log",
      bookShelf: { "2": 1 },
    });

    expect(normalized).toEqual({
      checkins: {},
      extra: {},
      points: {},
      bookShelf: { "book-guess-how-much": 1 },
      peanutLog: [],
      peanutRead: {},
      content_config: {
        schema_version: 1,
        package_id: "foundation-v2",
        package_version: 2,
        enabled: true,
        modules: { chinese: true, math: true, english: true, book: true },
      },
    });
    expect(hasCheckin({ "chinese-literacy": true }, "chinese")).toBe(true);
    expect(hasCheckin(null, "chinese")).toBe(false);
    expect(hasCheckin({}, "chinese")).toBe(false);
    expect(isPointMarked({}, "2026-8", 0, 3)).toBe(false);
  });

  it("replaces only the rotation state while preserving the learning container", () => {
    const initial = createLearningState({
      checkins: { "2026-08-01": { math: true } },
      extra: { mathQuestionCount: 3 },
    });
    const rotationState = makeRotationState();
    const next = replaceHanziRotationState(initial, rotationState);

    expect(next).toEqual({
      checkins: { "2026-08-01": { math: true } },
      extra: { mathQuestionCount: 3, hanziWorksheetRotationV1: rotationState },
      points: {},
      bookShelf: {},
      peanutLog: [],
      peanutRead: {},
      content_config: {
        schema_version: 1,
        package_id: "foundation-v2",
        package_version: 2,
        enabled: true,
        modules: { chinese: true, math: true, english: true, book: true },
      },
    });
    expect(getHanziRotationState(next)).toEqual(rotationState);
    expect(next).not.toBe(initial);
    expect(next.extra).not.toBe(initial.extra);
    expect(next.extra.hanziWorksheetRotationV1).not.toBe(rotationState);
    expect(initial.extra).toEqual({ mathQuestionCount: 3 });
  });

  it("replaces rotation through a controlled transition without adding a top-level key", () => {
    const rotationState = makeRotationState();
    const next = toggle(createLearningState({ points: { "2026-09": { "0": { "1": 1 } } } }), {
      type: "HANZI_ROTATION_REPLACED",
      rotationState,
    });

    expect(next.extra.hanziWorksheetRotationV1).toEqual(rotationState);
    expect(Object.keys(next)).toEqual([
      "checkins",
      "extra",
      "points",
      "bookShelf",
      "peanutLog",
      "peanutRead",
      "content_config",
    ]);
    expect(next.hanziWorksheetRotationV1).toBeUndefined();
  });

  it("keeps rotation in extra when replacing the whole state and drops unknown top-level fields", () => {
    const rotationState = makeRotationState();
    const next = toggle(createLearningState(), {
      type: "STATE_REPLACED",
      state: {
        extra: { hanziWorksheetRotationV1: rotationState, customMetric: 2 },
        unknownTopLevel: "discard me",
      },
    });

    expect(getHanziRotationState(next)).toEqual(rotationState);
    expect(next.extra.customMetric).toBe(2);
    expect(next).not.toHaveProperty("unknownTopLevel");
    expect(next).not.toHaveProperty("hanziWorksheetRotationV1");
  });

  it("normalizes malformed rotation before exposing it through the state container", () => {
    const crossScope = makeRotationState("profile:learner-a");
    crossScope.learnerScope = "profile:learner-b";

    const normalized = normalizeLearningState({
      extra: { hanziWorksheetRotationV1: crossScope },
    });

    expect(getHanziRotationState(normalized)).toMatchObject({
      learnerScope: "profile:learner-b",
      assignments: {},
      lastIssuedDayKey: null,
    });
  });

  it("fails closed when a rotation state belongs to another learner scope", () => {
    const profileAState = makeRotationState("profile:learner-a");
    const state = createLearningState({ extra: { hanziWorksheetRotationV1: profileAState } });

    expect(hasCompatibleHanziRotationScope(state, "profile:learner-a")).toBe(true);
    expect(hasCompatibleHanziRotationScope(state, "profile:learner-b")).toBe(false);
    expect(hasCompatibleHanziRotationScope(createLearningState(), "profile:learner-b")).toBe(true);
  });

  it("preserves mismatched rotation by default and drops it only through an explicit API", () => {
    const profileAState = createLearningState({
      checkins: { "2026-09-01": { "chinese-writing": true } },
      extra: {
        marker: "keep",
        hanziWorksheetRotationV1: makeRotationState("profile:learner-a"),
      },
    });

    const normalized = normalizeLearningStateForScope(profileAState, "profile:learner-b");

    expect(normalized.checkins).toEqual(profileAState.checkins);
    expect(normalized.extra.marker).toBe("keep");
    expect(getHanziRotationState(normalized)).toEqual(profileAState.extra.hanziWorksheetRotationV1);
    expect(hasCompatibleHanziRotationScope(normalized, "profile:learner-b")).toBe(false);

    const dropped = dropIncompatibleHanziRotation(profileAState, "profile:learner-b");
    expect(dropped.checkins).toEqual(profileAState.checkins);
    expect(dropped.extra.marker).toBe("keep");
    expect(getHanziRotationState(dropped)).toBeNull();
    expect(normalizeLearningStateForScope(profileAState, "profile:learner-a"))
      .toEqual(profileAState);
  });

  it("normalizes content learning separately and preserves unrelated extra settings", () => {
    const learning = makeContentLearning();
    const malformedRecord = { activityId: "english", itemId: "invalid", firstPlannedDay: "not-a-day" };
    const state = createLearningState({ extra: { contentLearningV1: learning, mathQuestionCount: 3 } });

    expect(getContentLearningState(state)).toEqual(learning);
    expect(createLearningState({ extra: {
      contentLearningV1: { ...learning, introductions: [...learning.introductions, malformedRecord] },
    } }).extra.contentLearningV1.introductions).toEqual(learning.introductions);
    expect(state.extra.mathQuestionCount).toBe(3);
    expect(state.extra.contentLearningV1).not.toBe(learning);
    expect(createLearningState({ extra: { contentLearningV1: [] } }).extra).toEqual({});
    expect(createLearningState({ extra: { contentLearningV1: {} } }).extra).toEqual({});
    expect(() => createLearningState({ extra: { contentLearningV1: { ...learning, schemaVersion: 99 } } })).toThrow(/version/i);
    expect(() => createLearningState({ extra: { contentLearningV1: { schemaVersion: 99 } } })).toThrow(/version/i);
    const withoutScope = { ...learning, learnerScope: undefined };
    expect(() => createLearningState({ extra: { contentLearningV1: withoutScope } })).toThrow(/scope/i);
  });

  it("preserves another learner's ledger for explicit scope rejection", () => {
    const state = createLearningState({ extra: { contentLearningV1: makeContentLearning("profile:learner-a") } });

    expect(hasCompatibleContentLearningScope(state, "profile:learner-a")).toBe(true);
    expect(hasCompatibleContentLearningScope(state, "profile:learner-b")).toBe(false);
    expect(hasCompatibleContentLearningScope(state, "anonymous")).toBe(false);
    expect(hasCompatibleContentLearningScope(createLearningState(), "profile:learner-b")).toBe(true);
    const mismatchedPlan = structuredClone(state);
    const candidates = mismatchedPlan.extra.contentLearningV1.plans["2026-10-13"].candidates;
    Object.values(candidates)[0].learnerScope = "profile:learner-b";
    expect(hasCompatibleContentLearningScope(mismatchedPlan, "profile:learner-a")).toBe(false);
    expect(hasCompatibleContentLearningScope({ extra: { contentLearningV1: { learnerScope: "profile:learner-a", occurrences: [{}] } } }, "profile:learner-a")).toBe(false);
    expect(getContentLearningState(normalizeLearningStateForScope(state, "profile:learner-b")))
      .toEqual(state.extra.contentLearningV1);
  });

  it("replaces content learning through a transition and refuses another learner scope", () => {
    const learning = makeContentLearning();
    const initial = createLearningState({ extra: { marker: "keep" } });
    const next = toggle(initial, { type: "CONTENT_LEARNING_REPLACED", contentLearning: learning });

    expect(getContentLearningState(next)).toEqual(learning);
    expect(next.extra.marker).toBe("keep");
    expect(initial.extra).toEqual({ marker: "keep" });
    expect(next).not.toHaveProperty("contentLearningV1");
    expect(() => replaceContentLearningState(next, makeContentLearning("profile:learner-b"))).toThrow(/scope/i);
    expect(() => replaceContentLearningState(next, learning, "profile:learner-b")).toThrow(/scope/i);
    expect(getContentLearningState(replaceContentLearningState(next, null))).toBeNull();
  });

  it("explicitly removes an invalid old content ledger without normalizing it first", () => {
    const invalidState = { extra: { marker: "keep", contentLearningV1: makeContentLearning() } };
    Object.values(invalidState.extra.contentLearningV1.plans["2026-10-13"].candidates)[0].learnerScope = "profile:other";

    expect(replaceContentLearningState(invalidState, null).extra).toEqual({ marker: "keep" });
    expect(toggle(invalidState, { type: "CONTENT_LEARNING_REPLACED", contentLearning: null }).extra).toEqual({ marker: "keep" });
    expect(invalidState.extra.contentLearningV1).toBeDefined();
  });

  it("toggles a task check-in and removes an empty day", () => {
    let state = createLearningState();
    const action = { type: "CHECKIN_TOGGLED", date: "2026-08-01", key: "chinese-literacy" };

    state = toggle(state, action);
    expect(hasCheckin(state.checkins["2026-08-01"], "chinese-literacy")).toBe(true);

    state = toggle(state, action);
    expect(state.checkins).not.toHaveProperty("2026-08-01");
  });

  it("keeps the optional speaking group independent and retains exposures when a check-in is canceled", () => {
    const learning = makeContentLearning();
    const initial = createLearningState({ extra: { contentLearningV1: learning } });
    const action = { type: "CHECKIN_TOGGLED", date: "2026-10-13", key: "speaking-practice" };
    const completed = toggle(initial, action);
    const canceled = toggle(completed, action);

    expect(CHECKIN_GROUPS.speaking).toEqual(["speaking-practice"]);
    expect(getEnabledModuleIds(initial.content_config)).not.toContain("speaking");
    expect(hasCheckin(completed.checkins["2026-10-13"], "speaking")).toBe(true);
    expect(hasCheckin(completed.checkins["2026-10-13"], "english")).toBe(false);
    expect(canceled.checkins).toEqual({});
    expect(getContentLearningState(canceled)).toEqual(learning);
    expect(getContentLearningState(canceled).introductions).toHaveLength(1);
  });

  it("expands a legacy module check-in before toggling one task", () => {
    const initial = createLearningState({
      checkins: { "2026-08-01": { chinese: true } },
    });

    const state = toggle(initial, {
      type: "CHECKIN_TOGGLED",
      date: "2026-08-01",
      key: "chinese-literacy",
    });

    expect(state.checkins["2026-08-01"]).toEqual({
      "chinese-poem": true,
      "chinese-writing": true,
    });
    expect(hasCheckin(state.checkins["2026-08-01"], "chinese-literacy")).toBe(false);
    expect(hasCheckin(state.checkins["2026-08-01"], "chinese-poem")).toBe(true);
  });

  it("toggles a point for a specific month and day", () => {
    let state = createLearningState();
    const action = { type: "POINT_TOGGLED", month: "2026-8", itemIndex: 0, day: 3 };

    state = toggle(state, action);
    expect(isPointMarked(state, "2026-8", 0, 3)).toBe(true);

    state = toggle(state, action);
    expect(isPointMarked(state, "2026-8", 0, 3)).toBe(false);
    expect(state.points["2026-8"]["0"]).toEqual({});
  });

  it("ignores incomplete check-in and point actions", () => {
    const initial = createLearningState();

    expect(toggle(initial, { type: "CHECKIN_TOGGLED", date: "", key: "chinese-literacy" })).toEqual(initial);
    expect(toggle(initial, { type: "CHECKIN_TOGGLED", date: "2026-08-01" })).toEqual(initial);
    expect(toggle(initial, { type: "POINT_TOGGLED", month: "2026-8", itemIndex: undefined, day: 3 })).toEqual(initial);
    expect(toggle(initial, { type: "POINT_TOGGLED", month: "2026-8", itemIndex: 0 })).toEqual(initial);
    expect(toggle(initial, { type: "POINTS_CLEARED" })).toEqual(initial);
  });

  it("toggles the shelf and reading-list completion flags independently", () => {
    let state = createLearningState();

    state = toggle(state, { type: "SHELF_TOGGLED", bookIndex: 2 });
    state = toggle(state, { type: "PEANUT_READ_TOGGLED", bookIndex: 2 });
    expect(state.bookShelf).toEqual({ "book-guess-how-much": 1 });
    expect(state.peanutRead).toEqual({ "reading-pearson-kids": 1 });

    state = toggle(state, { type: "SHELF_TOGGLED", bookIndex: 2 });
    state = toggle(state, { type: "PEANUT_READ_TOGGLED", bookIndex: 2 });
    expect(state.bookShelf).toEqual({});
    expect(state.peanutRead).toEqual({});
  });

  it("adds and removes a reading log entry through state transitions", () => {
    let state = createLearningState();
    const record = { title: "Brown Bear", date: "2026-08-01", rating: 4 };

    state = toggle(state, { type: "READING_LOG_ADDED", record });
    expect(state.peanutLog).toEqual([record]);

    state = toggle(state, { type: "READING_LOG_REMOVED", index: 0 });
    expect(state.peanutLog).toEqual([]);
  });

  it("ignores malformed reading-log transitions", () => {
    const initial = createLearningState({ peanutLog: [{ title: "Keep me" }] });

    expect(toggle(initial, { type: "READING_LOG_ADDED", record: [] })).toEqual(initial);
    expect(toggle(initial, { type: "READING_LOG_REMOVED", index: -1 })).toEqual(initial);
    expect(toggle(initial, { type: "READING_LOG_REMOVED", index: 2 })).toEqual(initial);
    expect(toggle(initial, { type: "SHELF_TOGGLED" })).toEqual(initial);
  });

  it("clears only the selected month's points and replaces state safely", () => {
    const initial = createLearningState({
      points: {
        "2026-8": { "0": { "1": 1 } },
        "2026-9": { "0": { "1": 1 } },
      },
      peanutLog: [{ title: "A", date: "2026-08-01", rating: 5 }],
    });

    const cleared = toggle(initial, { type: "POINTS_CLEARED", month: "2026-8" });
    expect(cleared.points).toEqual({ "2026-9": { "0": { "1": 1 } } });

    const replacement = toggle(cleared, {
      type: "STATE_REPLACED",
      state: { checkins: { "2026-08-02": { math: true } } },
    });
    expect(replacement).toEqual({
      checkins: { "2026-08-02": { math: true } },
      extra: {},
      points: {},
      bookShelf: {},
      peanutLog: [],
      peanutRead: {},
      content_config: {
        schema_version: 1,
        package_id: "foundation-v2",
        package_version: 2,
        enabled: true,
        modules: { chinese: true, math: true, english: true, book: true },
      },
    });
    expect(initial.points["2026-8"]).toEqual({ "0": { "1": 1 } });
  });

  it("keeps unknown events behaviorally inert", () => {
    const initial = createLearningState({ checkins: { "2026-08-01": { math: true } } });
    const next = toggle(initial, { type: "NOT_A_REAL_EVENT" });

    expect(next).toEqual(initial);
    expect(next).not.toBe(initial);
  });
});
