import { describe, expect, it } from "vitest";
import {
  getDayKey,
  mergeRotationState,
  normalizeRotationState,
  recordWorksheetCompletion,
  resolveDailyWorksheet,
} from "../../src/hanzi-worksheet-rotation.js";
import { getActiveHanziWritingPack } from "../../src/content/hanzi-writing/manifest.js";

const PACK = getActiveHanziWritingPack();
const PACK_REF = {
  setId: "hanzi-writing-v2",
  contentVersion: "hanzi-v2-pilot-1",
};
const LEARNER_SCOPE = "anonymous";
const TIME_ZONE = "Asia/Singapore";
const NOW = new Date("2026-09-01T00:30:00.000Z");

function makePack(itemCount, contentVersion = PACK.contentVersion) {
  return {
    ...structuredClone(PACK),
    contentVersion,
    items: structuredClone(PACK.items.slice(0, itemCount)),
  };
}

function makeWorksheet(dayKey, assignmentId, itemIds, packRef = PACK_REF) {
  return {
    assignmentId,
    dayKey,
    layoutVersion: "focus-rows-v1",
    packRef,
    rows: itemIds.map((itemId, index) => {
      const item = PACK.items.find((candidate) => candidate.id === itemId);
      return {
        rowId: `row-${index + 1}`,
        itemId,
        glyph: item.glyph,
        pinyin: item.pinyin,
        exampleWord: item.exampleWord,
      };
    }),
  };
}

function makeState({
  learnerScope = LEARNER_SCOPE,
  packRef = PACK_REF,
  algorithmVersion = "rotation-v1",
  dayKey = "2026-09-01",
  assignmentId,
  itemIds,
  completedAt,
}) {
  const worksheet = makeWorksheet(dayKey, assignmentId, itemIds, packRef);
  return {
    schemaVersion: 1,
    learnerScope,
    algorithmVersion,
    activePack: packRef,
    assignments: {
      [dayKey]: {
        canonicalAssignmentId: assignmentId,
        candidates: { [assignmentId]: worksheet },
        completions: completedAt ? { [assignmentId]: { completedAt } } : {},
      },
    },
    lastIssuedDayKey: dayKey,
  };
}

describe("rotation-v1 daily worksheet selection", () => {
  it("uses the injected IANA timezone across calendar, leap-day, and DST boundaries", () => {
    expect(getDayKey(new Date("2026-01-31T16:00:00.000Z"), "Asia/Singapore")).toBe("2026-02-01");
    expect(getDayKey(new Date("2028-02-29T23:59:59.000Z"), "UTC")).toBe("2028-02-29");
    expect(getDayKey(new Date("2028-03-01T00:00:00.000Z"), "UTC")).toBe("2028-03-01");
    expect(getDayKey(new Date("2026-01-01T07:59:59.000Z"), "America/Los_Angeles")).toBe("2025-12-31");
    expect(getDayKey(new Date("2026-03-08T09:59:59.000Z"), "America/Los_Angeles")).toBe("2026-03-08");
    expect(getDayKey(new Date("2026-03-09T07:00:00.000Z"), "America/Los_Angeles")).toBe("2026-03-09");
  });

  it("normalizes an empty state to the rotation-only schema", () => {
    expect(normalizeRotationState({}, {
      learnerScope: "profile:learner-a",
      packRef: PACK_REF,
    })).toEqual({
      schemaVersion: 1,
      learnerScope: "profile:learner-a",
      algorithmVersion: "rotation-v1",
      activePack: PACK_REF,
      assignments: {},
      lastIssuedDayKey: null,
    });
  });

  it("keeps only the persisted worksheet contract when normalizing state", () => {
    const worksheet = {
      ...makeWorksheet("2026-09-01", "rotation-v1-00000001", ["hz-001"]),
      generatedAt: "2026-09-01T00:00:00.000Z",
      stage: "P2",
    };
    const normalized = normalizeRotationState({
      schemaVersion: 1,
      learnerScope: LEARNER_SCOPE,
      algorithmVersion: "rotation-v1",
      activePack: { ...PACK_REF, checksum: "not-part-of-pack-ref" },
      assignments: {
        "2026-09-01": {
          canonicalAssignmentId: "not-the-minimum",
          candidates: { [worksheet.assignmentId]: worksheet },
          completions: {
            [worksheet.assignmentId]: {
              completedAt: "2026-09-01T03:00:00.000Z",
              reviewCount: 4,
            },
          },
          mastery: { "hz-001": 1 },
        },
      },
      lastIssuedDayKey: "2026-09-01",
      sm2: { ease: 2.5 },
    }, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF });

    expect(normalized).toEqual({
      schemaVersion: 1,
      learnerScope: LEARNER_SCOPE,
      algorithmVersion: "rotation-v1",
      activePack: PACK_REF,
      assignments: {
        "2026-09-01": {
          canonicalAssignmentId: worksheet.assignmentId,
          candidates: {
            [worksheet.assignmentId]: {
              assignmentId: worksheet.assignmentId,
              dayKey: "2026-09-01",
              layoutVersion: "focus-rows-v1",
              packRef: PACK_REF,
              rows: [
                {
                  rowId: "row-1",
                  itemId: "hz-001",
                  glyph: "一",
                  pinyin: "yī",
                  exampleWord: "一个",
                },
              ],
            },
          },
          completions: {
            [worksheet.assignmentId]: { completedAt: "2026-09-01T03:00:00.000Z" },
          },
        },
      },
      lastIssuedDayKey: "2026-09-01",
    });
  });

  it("returns the stored canonical snapshot instead of re-reading a changed pack", () => {
    const first = resolveDailyWorksheet({
      rotationState: normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF }),
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const changedPack = structuredClone(PACK);
    const changedItem = changedPack.items.find((item) => item.id === first.worksheet.rows[0].itemId);
    changedItem.glyph = "新";
    changedItem.exampleWord = "新词";

    const repeated = resolveDailyWorksheet({
      rotationState: first.rotationState,
      pack: changedPack,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(repeated.worksheet).toEqual(first.worksheet);
    expect(repeated.rotationState.assignments["2026-09-01"]).toEqual(
      first.rotationState.assignments["2026-09-01"]
    );
  });

  it("does not expose the stored snapshot through a mutable worksheet reference", () => {
    const resolved = resolveDailyWorksheet({
      rotationState: normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF }),
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const storedState = structuredClone(resolved.rotationState);

    resolved.worksheet.rows[0].glyph = "改";

    expect(resolved.rotationState).toEqual(storedState);
  });

  it("fails closed when a resolve request crosses learner scopes", () => {
    const state = resolveDailyWorksheet({
      rotationState: normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF }),
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    }).rotationState;

    expect(() => resolveDailyWorksheet({
      rotationState: state,
      pack: PACK,
      learnerScope: "profile:learner-b",
      now: NOW,
      timeZone: TIME_ZONE,
    })).toThrow(/learnerScope/);
  });

  it("keeps each 4-row day distinct from the previous seven issued days", () => {
    let state = normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF });
    const issued = [];

    for (let offset = 0; offset < 15; offset += 1) {
      const resolved = resolveDailyWorksheet({
        rotationState: state,
        pack: PACK,
        learnerScope: LEARNER_SCOPE,
        now: new Date(Date.UTC(2026, 8, 1 + offset, 0, 30, 0)),
        timeZone: TIME_ZONE,
      });
      const itemIds = resolved.worksheet.rows.map((row) => row.itemId);

      expect(itemIds).toHaveLength(4);
      expect(new Set(itemIds).size).toBe(4);
      issued.push(new Set(itemIds));
      if (issued.length > 1) {
        const recent = new Set(
          issued.slice(Math.max(0, issued.length - 8), -1).flatMap((items) => [...items])
        );
        expect(itemIds.some((itemId) => recent.has(itemId))).toBe(false);
      }
      state = resolved.rotationState;
    }

    expect(Object.keys(state.assignments)).toHaveLength(15);
  });

  it("uses deterministic no-duplicate fallback filling when the recent pool is too small", () => {
    const smallPack = makePack(5);
    const initialState = normalizeRotationState({}, {
      learnerScope: LEARNER_SCOPE,
      packRef: { setId: smallPack.setId, contentVersion: smallPack.contentVersion },
    });
    const first = resolveDailyWorksheet({
      rotationState: initialState,
      pack: smallPack,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const secondInput = {
      rotationState: first.rotationState,
      pack: smallPack,
      learnerScope: LEARNER_SCOPE,
      now: new Date("2026-09-02T00:30:00.000Z"),
      timeZone: TIME_ZONE,
    };
    const second = resolveDailyWorksheet(secondInput);
    const repeated = resolveDailyWorksheet(secondInput);
    const firstIds = first.worksheet.rows.map((row) => row.itemId);
    const secondIds = second.worksheet.rows.map((row) => row.itemId);

    expect(secondIds).toHaveLength(4);
    expect(new Set(secondIds).size).toBe(4);
    expect(secondIds).toEqual(["hz-001", "hz-002", "hz-003", "hz-004"]);
    expect(secondIds).not.toEqual(firstIds);
    expect(secondIds.filter((itemId) => firstIds.includes(itemId))).toHaveLength(3);
    expect(repeated).toEqual(second);
  });

  it("pins an issued worksheet to its pack version and skips unissued dates", () => {
    const newerPack = makePack(32, "hanzi-v2-pilot-2");
    const newerPackRef = {
      setId: newerPack.setId,
      contentVersion: newerPack.contentVersion,
    };
    const first = resolveDailyWorksheet({
      rotationState: normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF }),
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const screenAndPrintSnapshot = structuredClone(first.worksheet);
    const sameDayWithNewPack = resolveDailyWorksheet({
      rotationState: first.rotationState,
      pack: newerPack,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const nextDay = resolveDailyWorksheet({
      rotationState: sameDayWithNewPack.rotationState,
      pack: newerPack,
      learnerScope: LEARNER_SCOPE,
      now: new Date("2026-09-03T00:30:00.000Z"),
      timeZone: TIME_ZONE,
    });

    expect(sameDayWithNewPack.worksheet).toEqual(first.worksheet);
    expect(sameDayWithNewPack.worksheet.packRef).toEqual(PACK_REF);
    expect(nextDay.worksheet.packRef).toEqual(newerPackRef);
    expect(nextDay.rotationState.activePack).toEqual(newerPackRef);
    expect(nextDay.rotationState.assignments["2026-09-01"].candidates[first.worksheet.assignmentId].packRef)
      .toEqual(PACK_REF);
    expect(Object.keys(nextDay.rotationState.assignments)).toEqual(["2026-09-01", "2026-09-03"]);
    expect(screenAndPrintSnapshot).toEqual(first.worksheet);
  });

  it("retains only the most recent 90 dayKeys and no mastery or review fields", () => {
    let state = normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF });

    for (let offset = 0; offset < 95; offset += 1) {
      state = resolveDailyWorksheet({
        rotationState: state,
        pack: PACK,
        learnerScope: LEARNER_SCOPE,
        now: new Date(Date.UTC(2026, 8, 1 + offset, 0, 30, 0)),
        timeZone: TIME_ZONE,
      }).rotationState;
    }

    const normalized = normalizeRotationState({
      ...state,
      mastery: { "hz-001": 1 },
      reviewCount: 3,
      sm2: { ease: 2.5 },
    }, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF });

    expect(Object.keys(state.assignments)).toHaveLength(90);
    expect(Object.keys(normalized.assignments)).toHaveLength(90);
    expect(normalized.assignments["2026-09-05"]).toBeUndefined();
    expect(normalized.assignments["2026-09-06"]).toBeDefined();
    expect(normalized.assignments["2026-12-04"]).toBeDefined();
    expect(normalized).not.toHaveProperty("mastery");
    expect(normalized).not.toHaveProperty("reviewCount");
    expect(normalized).not.toHaveProperty("sm2");
    expect(JSON.stringify(normalized).length).toBeLessThan(200 * 1024);
  });

  it("records one completion fact without changing the immutable worksheet snapshot", () => {
    const first = resolveDailyWorksheet({
      rotationState: normalizeRotationState({}, { learnerScope: LEARNER_SCOPE, packRef: PACK_REF }),
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });
    const completed = recordWorksheetCompletion({
      rotationState: first.rotationState,
      worksheet: first.worksheet,
      completedAt: "2026-09-01T03:00:00.000Z",
    });
    const repeated = recordWorksheetCompletion({
      rotationState: completed,
      worksheet: first.worksheet,
      completedAt: "2026-09-01T04:00:00.000Z",
    });

    expect(completed.assignments["2026-09-01"].completions).toEqual({
      [first.worksheet.assignmentId]: { completedAt: "2026-09-01T03:00:00.000Z" },
    });
    expect(repeated).toEqual(completed);
    expect(completed.assignments["2026-09-01"].candidates[first.worksheet.assignmentId])
      .toEqual(first.worksheet);
    expect(first.rotationState.assignments["2026-09-01"].completions).toEqual({});
    expect(completed).not.toHaveProperty("mastery");
    expect(completed).not.toHaveProperty("reviewCount");
    expect(completed).not.toHaveProperty("sm2");
  });

  it("unions same-day candidates and completions with a stable minimum canonical", () => {
    const local = makeState({
      assignmentId: "rotation-v1-0000000f",
      itemIds: ["hz-001", "hz-002", "hz-003", "hz-004"],
      completedAt: "2026-09-01T04:00:00.000Z",
    });
    const remote = makeState({
      assignmentId: "rotation-v1-00000001",
      itemIds: ["hz-005", "hz-006", "hz-007", "hz-008"],
      completedAt: "2026-09-01T05:00:00.000Z",
    });

    const merged = mergeRotationState(local, remote);
    const reverse = mergeRotationState(remote, local);
    const repeated = mergeRotationState(merged, merged);
    const resolved = resolveDailyWorksheet({
      rotationState: merged,
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(merged.assignments["2026-09-01"]).toMatchObject({
      canonicalAssignmentId: "rotation-v1-00000001",
      candidates: {
        "rotation-v1-0000000f": expect.any(Object),
        "rotation-v1-00000001": expect.any(Object),
      },
      completions: {
        "rotation-v1-0000000f": { completedAt: "2026-09-01T04:00:00.000Z" },
        "rotation-v1-00000001": { completedAt: "2026-09-01T05:00:00.000Z" },
      },
    });
    expect(resolved.worksheet).toEqual(
      merged.assignments["2026-09-01"].candidates["rotation-v1-00000001"]
    );
    expect(reverse).toEqual(merged);
    expect(repeated).toEqual(merged);
    expect(local).toEqual(makeState({
      assignmentId: "rotation-v1-0000000f",
      itemIds: ["hz-001", "hz-002", "hz-003", "hz-004"],
      completedAt: "2026-09-01T04:00:00.000Z",
    }));
  });

  it("keeps rotation merges associative and rejects incompatible scopes, packs, and algorithms", () => {
    const local = makeState({ assignmentId: "rotation-v1-0000000f", itemIds: ["hz-001"] });
    const remote = makeState({ assignmentId: "rotation-v1-00000001", itemIds: ["hz-002"] });
    const third = makeState({ assignmentId: "rotation-v1-0000000a", itemIds: ["hz-003"] });

    expect(mergeRotationState(mergeRotationState(local, remote), third))
      .toEqual(mergeRotationState(local, mergeRotationState(remote, third)));
    expect(() => mergeRotationState(local, makeState({
      learnerScope: "profile:other-learner",
      assignmentId: "rotation-v1-00000002",
      itemIds: ["hz-004"],
    }))).toThrow(/learnerScope/);
    expect(() => mergeRotationState(local, makeState({
      packRef: { setId: PACK_REF.setId, contentVersion: "hanzi-v2-pilot-2" },
      assignmentId: "rotation-v1-00000003",
      itemIds: ["hz-005"],
    }))).toThrow(/pack/);
    expect(() => mergeRotationState(local, makeState({
      algorithmVersion: "rotation-v0",
      assignmentId: "rotation-v1-00000004",
      itemIds: ["hz-006"],
    }))).toThrow(/algorithm/);
  });

  it("returns the golden worksheet and the same snapshot for 100 same-day resolves", () => {
    expect(getDayKey(NOW, TIME_ZONE)).toBe("2026-09-01");

    const initialState = normalizeRotationState({}, {
      learnerScope: LEARNER_SCOPE,
      packRef: PACK_REF,
    });
    const first = resolveDailyWorksheet({
      rotationState: initialState,
      pack: PACK,
      learnerScope: LEARNER_SCOPE,
      now: NOW,
      timeZone: TIME_ZONE,
    });

    expect(first.worksheet).toEqual({
      assignmentId: "rotation-v1-8a214246",
      dayKey: "2026-09-01",
      layoutVersion: "focus-rows-v1",
      packRef: PACK_REF,
      rows: [
        { rowId: "row-1", itemId: "hz-011", glyph: "火", pinyin: "huǒ", exampleWord: "火山" },
        { rowId: "row-2", itemId: "hz-010", glyph: "水", pinyin: "shuǐ", exampleWord: "水果" },
        { rowId: "row-3", itemId: "hz-013", glyph: "山", pinyin: "shān", exampleWord: "大山" },
        { rowId: "row-4", itemId: "hz-012", glyph: "木", pinyin: "mù", exampleWord: "木头" },
      ],
    });
    expect(first.rotationState).toMatchObject({
      schemaVersion: 1,
      learnerScope: LEARNER_SCOPE,
      algorithmVersion: "rotation-v1",
      activePack: PACK_REF,
      lastIssuedDayKey: "2026-09-01",
    });

    let state = first.rotationState;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const resolved = resolveDailyWorksheet({
        rotationState: state,
        pack: PACK,
        learnerScope: LEARNER_SCOPE,
        now: NOW,
        timeZone: TIME_ZONE,
      });

      expect(resolved.worksheet).toEqual(first.worksheet);
      expect(JSON.stringify(resolved.worksheet)).toBe(JSON.stringify(first.worksheet));
      state = resolved.rotationState;
    }

    expect(state).toEqual(first.rotationState);
  });
});
