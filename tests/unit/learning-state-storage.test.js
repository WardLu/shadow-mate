import { describe, expect, it } from "vitest";
import { getLearningStateStorageKey, migrateLegacyLearningState } from "../../src/learning-state-envelope.js";
import {
  adoptPendingLearningState,
  loadLearningStateEnvelope,
} from "../../src/learning-state-storage.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("learning state storage", () => {
  it("keeps legacy global data pending until a parent explicitly assigns it to one child", () => {
    const legacyRaw = JSON.stringify({
      checkins: { "2026-08-14": { "chinese-literacy": true } },
      points: { "2026-8": { "0": { "14": 1 } } },
    });
    const storage = memoryStorage({ shadow_mate_workbench_v1: legacyRaw });

    const envelope = loadLearningStateEnvelope(storage, {
      householdId: "household-1",
      profileId: "profile-1",
    });

    const scopedKey = getLearningStateStorageKey({ householdId: "household-1", profileId: "profile-1" });
    const pending = loadLearningStateEnvelope(storage);
    expect(envelope.learning.checkins).toEqual({});
    expect(pending.learning.checkins).toEqual({ "2026-08-14": { "chinese-literacy": true } });
    expect(storage.getItem(scopedKey)).toBe(JSON.stringify(envelope));
    expect(storage.getItem("shadow_mate_workbench_v1")).toBe(legacyRaw);

    const secondChild = loadLearningStateEnvelope(storage, {
      householdId: "household-1",
      profileId: "profile-2",
    });
    expect(secondChild.learning.checkins).toEqual({});

    const adopted = adoptPendingLearningState(storage, {
      householdId: "household-1",
      profileId: "profile-1",
    });
    expect(adopted.scope).toEqual({ household_id: "household-1", profile_id: "profile-1" });
    expect(adopted.learning.checkins).toEqual({ "2026-08-14": { "chinese-literacy": true } });
    expect(adopted.migration.adopted_from).toBe("pending");

    const otherChildAfterAdoption = loadLearningStateEnvelope(storage, {
      householdId: "household-1",
      profileId: "profile-2",
    });
    expect(otherChildAfterAdoption.learning.checkins).toEqual({});
    expect(storage.getItem("shadow_mate_learning_v2:pending")).toBe(JSON.stringify(pending));
  });

  it("does not return a state whose embedded scope belongs to another child", () => {
    const scopedKey = getLearningStateStorageKey({ householdId: "household-1", profileId: "profile-2" });
    const wrongScope = migrateLegacyLearningState(
      { checkins: { "2026-08-14": { "chinese-literacy": true } } },
      { householdId: "household-1", profileId: "profile-1" },
    );
    const storage = memoryStorage({ [scopedKey]: JSON.stringify(wrongScope) });

    const loaded = loadLearningStateEnvelope(storage, {
      householdId: "household-1",
      profileId: "profile-2",
    });

    expect(loaded.scope).toEqual({ household_id: "household-1", profile_id: "profile-2" });
    expect(loaded.learning.checkins).toEqual({});
    expect(storage.getItem(scopedKey)).toBe(JSON.stringify(loaded));
  });

  it("backs up malformed legacy content by its raw value and remains idempotent", () => {
    const legacyRaw = "{not-json";
    const storage = memoryStorage({ shadow_mate_workbench_v1: legacyRaw });

    const first = loadLearningStateEnvelope(storage, {
      householdId: "household-1",
      profileId: "profile-1",
    });
    const second = loadLearningStateEnvelope(storage, {
      householdId: "household-1",
      profileId: "profile-1",
    });

    expect(first).toEqual(second);
    expect(first.learning.checkins).toEqual({});
    expect([...storage.data.entries()]).toContainEqual([
      expect.stringMatching(/^shadow_mate_learning_v2:legacy_backup:/),
      legacyRaw,
    ]);
  });

  it("does not overwrite an existing child state during explicit adoption", () => {
    const scope = { householdId: "household-1", profileId: "profile-1" };
    const scopedKey = getLearningStateStorageKey(scope);
    const pending = migrateLegacyLearningState({
      checkins: { pending: { chinese: 1 } },
    });
    const existing = migrateLegacyLearningState({
      checkins: { existing: { math: 1 } },
    }, scope);
    const storage = memoryStorage({
      ["shadow_mate_learning_v2:pending"]: JSON.stringify(pending),
      [scopedKey]: JSON.stringify(existing),
    });

    const result = adoptPendingLearningState(storage, scope);

    expect(result.learning.checkins).toEqual({ existing: { math: 1 } });
  });
});
