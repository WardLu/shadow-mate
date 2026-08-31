import { describe, expect, it } from "vitest";
import {
  mergeState,
  stateHasData,
} from "../../src/lib.js";
import {
  recordWorksheetCompletion,
  resolveDailyWorksheet,
} from "../../src/hanzi-worksheet-rotation.js";
import { getActiveHanziWritingPack } from "../../src/content/hanzi-writing/manifest.js";

const PACK = getActiveHanziWritingPack();
const TIME_ZONE = "Asia/Singapore";

function makeRotationState({ learnerScope = "anonymous", itemIds, completedAt } = {}) {
  const selectedItemIds = itemIds || PACK.items.slice(0, 4).map((item) => item.id);
  const pack = {
    ...structuredClone(PACK),
    items: structuredClone(PACK.items.filter((item) => selectedItemIds.includes(item.id))),
  };
  const resolved = resolveDailyWorksheet({
    rotationState: {},
    pack,
    learnerScope,
    now: new Date("2026-09-01T00:30:00.000Z"),
    timeZone: TIME_ZONE,
  });

  return completedAt
    ? recordWorksheetCompletion({
      rotationState: resolved.rotationState,
      worksheet: resolved.worksheet,
      completedAt,
    })
    : resolved.rotationState;
}

function getWorksheet(state) {
  const assignment = state.assignments["2026-09-01"];
  return assignment.candidates[assignment.canonicalAssignmentId];
}

describe("learning state rotation integration", () => {
  it("unions same-scope rotation candidates and completions while retaining legacy fields", () => {
    const first = makeRotationState({
      itemIds: ["hz-001", "hz-002", "hz-003", "hz-004"],
      completedAt: "2026-09-01T04:00:00.000Z",
    });
    const second = makeRotationState({
      itemIds: ["hz-005", "hz-006", "hz-007", "hz-008"],
      completedAt: "2026-09-01T05:00:00.000Z",
    });
    const firstId = getWorksheet(first).assignmentId;
    const secondId = getWorksheet(second).assignmentId;
    const local = firstId > secondId ? first : second;
    const remote = firstId > secondId ? second : first;
    const localWorksheet = getWorksheet(local);
    const remoteWorksheet = getWorksheet(remote);
    const canonicalId = [firstId, secondId].sort()[0];

    const merged = mergeState({
      checkins: { "2026-09-01": { math: true } },
      extra: { hanziWorksheetRotationV1: local },
    }, {
      points: { "2026-09": { "0": { "1": 1 } } },
      extra: { hanziWorksheetRotationV1: remote },
    });

    expect(merged.checkins).toEqual({ "2026-09-01": { math: true } });
    expect(merged.points).toEqual({ "2026-09": { "0": { "1": 1 } } });
    expect(merged.extra.hanziWorksheetRotationV1.assignments["2026-09-01"])
      .toMatchObject({
        canonicalAssignmentId: canonicalId,
        candidates: {
          [firstId]: getWorksheet(first),
          [secondId]: getWorksheet(second),
        },
        completions: {
          [firstId]: { completedAt: "2026-09-01T04:00:00.000Z" },
          [secondId]: { completedAt: "2026-09-01T05:00:00.000Z" },
        },
      });
    expect(localWorksheet).toBeDefined();
    expect(remoteWorksheet).toBeDefined();
  });

  it("rejects rotation state from a different learner scope", () => {
    const local = makeRotationState({ learnerScope: "profile:learner-a" });
    const remote = makeRotationState({ learnerScope: "profile:learner-b" });

    expect(() => mergeState(
      { extra: { hanziWorksheetRotationV1: local } },
      { extra: { hanziWorksheetRotationV1: remote } },
    )).toThrow(/learnerScope/);
  });

  it("degrades malformed rotation and keeps a valid peer state", () => {
    const valid = makeRotationState();
    const corrupted = structuredClone(valid);
    const assignment = corrupted.assignments["2026-09-01"];
    const candidateId = assignment.canonicalAssignmentId;
    assignment.candidates[candidateId].rows[0].itemId = "tampered-item";

    const mergedWithCorruptedObject = mergeState(
      { extra: { hanziWorksheetRotationV1: corrupted } },
      { extra: { hanziWorksheetRotationV1: valid } },
    );
    const mergedWithCorruptedArray = mergeState(
      { extra: { hanziWorksheetRotationV1: [] } },
      { extra: { hanziWorksheetRotationV1: valid } },
    );

    expect(mergedWithCorruptedObject.extra.hanziWorksheetRotationV1).toEqual(valid);
    expect(mergedWithCorruptedArray.extra.hanziWorksheetRotationV1).toEqual(valid);
  });

  it("normalizes rotation payloads before storing them in the generic state", () => {
    const oversized = makeRotationState();
    const worksheet = getWorksheet(oversized);
    worksheet.rows[0].exampleWord = "字".repeat(200 * 1024);

    const merged = mergeState(
      { extra: { hanziWorksheetRotationV1: oversized } },
      {},
    );
    const storedWorksheet = getWorksheet(merged.extra.hanziWorksheetRotationV1);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(merged)).length;

    expect(storedWorksheet.rows[0].exampleWord.length).toBeLessThan(200 * 1024);
    expect(payloadBytes).toBeLessThan(200 * 1024);
    expect(oversized).not.toEqual(merged.extra.hanziWorksheetRotationV1);
  });

  it("rejects missing or invalid active packs at the generic state boundary", () => {
    const valid = makeRotationState();
    const missingActivePack = structuredClone(valid);
    delete missingActivePack.activePack;
    const nullActivePack = structuredClone(valid);
    nullActivePack.activePack = null;
    const partialActivePack = structuredClone(valid);
    partialActivePack.activePack = { setId: "hanzi-writing-v2" };

    for (const rotationState of [missingActivePack, nullActivePack, partialActivePack]) {
      expect(stateHasData({ extra: { hanziWorksheetRotationV1: rotationState } })).toBe(false);

      const merged = mergeState(
        { extra: { hanziWorksheetRotationV1: rotationState } },
        { extra: { hanziWorksheetRotationV1: valid } },
      );

      expect(merged.extra.hanziWorksheetRotationV1).toEqual(valid);
    }
  });
});
