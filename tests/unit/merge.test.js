import { describe, it, expect } from "vitest";
import { escapeHtml, stateHasData, mergeObjects, mergeState } from "../../src/lib.js";

describe("escapeHtml", () => {
  it("escapes all HTML special characters", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });
  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });
  it("handles empty input", () => {
    expect(escapeHtml()).toBe("");
    expect(escapeHtml("")).toBe("");
  });
  it("handles non-string input", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(null)).toBe("null");
  });
});

describe("stateHasData", () => {
  it("returns false for empty state", () => {
    expect(stateHasData({})).toBe(false);
    expect(stateHasData({ checkins: {}, points: {}, bookShelf: {}, peanutRead: {}, peanutLog: [] })).toBe(false);
  });
  it("returns false for null/undefined", () => {
    expect(stateHasData(null)).toBe(false);
    expect(stateHasData(undefined)).toBe(false);
  });
  it("returns true when checkins exist", () => {
    expect(stateHasData({ checkins: { "2026-08-01": { chinese: 1 } } })).toBe(true);
  });
  it("returns true when points exist", () => {
    expect(stateHasData({ points: { "2026-08": { "1": 5 } } })).toBe(true);
  });
  it("returns true when peanutLog has entries", () => {
    expect(stateHasData({ peanutLog: [{ title: "Book", date: "2026-08-01", rating: 5 }] })).toBe(true);
  });
  it("returns true when bookShelf has entries", () => {
    expect(stateHasData({ bookShelf: { 0: 1 } })).toBe(true);
  });
});

describe("mergeObjects", () => {
  it("merges flat objects with local taking priority", () => {
    expect(mergeObjects({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 2, c: 4 });
  });
  it("recursively merges nested objects", () => {
    const local = { checkins: { "d1": { math: 1 } } };
    const remote = { checkins: { "d2": { english: 1 } } };
    const result = mergeObjects(local, remote);
    expect(result.checkins).toEqual({ "d1": { math: 1 }, "d2": { english: 1 } });
  });
  it("local arrays replace remote arrays", () => {
    expect(mergeObjects({ list: [1, 2] }, { list: [3, 4] })).toEqual({ list: [1, 2] });
  });
  it("handles null values", () => {
    expect(mergeObjects({ a: null }, { a: 1, b: 2 })).toEqual({ a: null, b: 2 });
  });
  it("handles empty inputs", () => {
    expect(mergeObjects({}, { a: 1 })).toEqual({ a: 1 });
    expect(mergeObjects({ a: 1 }, {})).toEqual({ a: 1 });
  });
  it("does not mutate inputs", () => {
    const local = { a: { b: 1 } };
    const remote = { a: { c: 2 } };
    mergeObjects(local, remote);
    expect(local).toEqual({ a: { b: 1 } });
    expect(remote).toEqual({ a: { c: 2 } });
  });
});

describe("mergeState", () => {
  it("merges states and deduplicates peanutLog by date+title+rating", () => {
    const local = {
      checkins: { "d1": { math: 1 } },
      peanutLog: [{ title: "Book A", date: "2026-08-01", rating: 5 }],
    };
    const remote = {
      checkins: { "d2": { english: 1 } },
      peanutLog: [
        { title: "Book A", date: "2026-08-01", rating: 5 },
        { title: "Book B", date: "2026-08-02", rating: 3 },
      ],
    };
    const merged = mergeState(local, remote);
    expect(merged.checkins).toHaveProperty("d1");
    expect(merged.checkins).toHaveProperty("d2");
    expect(merged.peanutLog).toHaveLength(2);
  });
  it("sorts peanutLog by date", () => {
    const local = { peanutLog: [{ title: "A", date: "2026-08-01", rating: 5 }] };
    const remote = { peanutLog: [{ title: "B", date: "2026-08-03", rating: 4 }] };
    // Remote processed first: insertion order is [08-03, 08-01]; sort must reorder
    const merged = mergeState(local, remote);
    expect(merged.peanutLog[0].date).toBe("2026-08-01");
    expect(merged.peanutLog[1].date).toBe("2026-08-03");
  });
  it("handles empty peanutLog", () => {
    const merged = mergeState({ checkins: {} }, { checkins: {} });
    expect(merged.peanutLog).toEqual([]);
  });
});
