import { describe, expect, it } from "vitest";
import {
  createLearningState,
  hasCheckin,
  isPointMarked,
  normalizeLearningState,
  transitionLearningState,
} from "../../src/learning-state.js";

const toggle = (state, action) => transitionLearningState(state, action);

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
    });
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
      bookShelf: { "2": 1 },
      peanutLog: [],
      peanutRead: {},
    });
    expect(hasCheckin({ "chinese-literacy": true }, "chinese")).toBe(true);
    expect(hasCheckin(null, "chinese")).toBe(false);
    expect(hasCheckin({}, "chinese")).toBe(false);
    expect(isPointMarked({}, "2026-8", 0, 3)).toBe(false);
  });

  it("toggles a task check-in and removes an empty day", () => {
    let state = createLearningState();
    const action = { type: "CHECKIN_TOGGLED", date: "2026-08-01", key: "chinese-literacy" };

    state = toggle(state, action);
    expect(hasCheckin(state.checkins["2026-08-01"], "chinese-literacy")).toBe(true);

    state = toggle(state, action);
    expect(state.checkins).not.toHaveProperty("2026-08-01");
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
    expect(state.bookShelf).toEqual({ "2": 1 });
    expect(state.peanutRead).toEqual({ "2": 1 });

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
