import { describe, expect, it } from "vitest";
import { getLearningStateStorageKey, migrateLegacyLearningState } from "../../src/learning-state-envelope.js";
import { resolveDailyLearningPlan, recordContentCompletion } from "../../src/content-learning.js";
import {
  clearLearningDeskStorage,
  adoptPendingLearningState,
  loadLearningStateEnvelope,
} from "../../src/learning-state-storage.js";

const PROFILE_B_SCOPE = { household_id: "household-1", profile_id: "profile-b" };

function makeAnonymousLedger() {
  const planned = resolveDailyLearningPlan({
    learning: null,
    learnerScope: "anonymous",
    dayKey: "2026-10-12",
    packageId: "foundation-v2",
    catalog: { version: "test-v1", english: [{ id: "word-a", order: 1 }, { id: "word-b", order: 2 }] },
    enabledActivities: ["english"],
    deviceId: "device-a",
  });
  const completion = recordContentCompletion({
    learning: planned.nextLearning,
    plan: planned.plan,
    activityId: "english",
    itemId: planned.plan.activities.english[0].itemId,
    dayKey: "2026-10-12",
    deviceId: "device-a",
    completedAt: "2026-10-12T08:00:00.000Z",
  });
  return { ledger: completion, plan: planned.plan };
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
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

  it("rebinds only pending anonymous content learning to the explicitly selected child", () => {
    const { ledger, plan } = makeAnonymousLedger();
    const pending = migrateLegacyLearningState({ extra: { contentLearningV1: ledger } });
    const storage = memoryStorage({ ["shadow_mate_learning_v2:pending"]: JSON.stringify(pending) });
    const adopted = adoptPendingLearningState(storage, PROFILE_B_SCOPE);
    const migrated = adopted.learning.extra.contentLearningV1;
    const expectedScope = "profile:profile-b";

    expect(adopted.scope).toEqual(PROFILE_B_SCOPE);
    expect(migrated.learnerScope).toBe(expectedScope);
    const migratedPlan = Object.values(migrated.plans["2026-10-12"].candidates)[0];
    expect(migratedPlan.learnerScope).toBe(expectedScope);
    expect(migratedPlan.planId).not.toBe(plan.planId);
    expect(migratedPlan.activities).toEqual(plan.activities);
    expect(migrated.introductions).toEqual(ledger.introductions);
    expect(migrated.occurrences).toEqual(ledger.occurrences);
    expect(migrated.occurrences[0].occurrenceId).toBe(plan.activities.english[0].occurrenceId);
    expect(adoptPendingLearningState(storage, PROFILE_B_SCOPE).learning.extra.contentLearningV1).toEqual(migrated);
    expect(JSON.parse(storage.getItem("shadow_mate_learning_v2:pending")).learning.extra.contentLearningV1).toEqual(ledger);

    const otherChild = loadLearningStateEnvelope(storage, { household_id: "household-1", profile_id: "profile-c" });
    expect(otherChild.learning.extra.contentLearningV1).toBeUndefined();
  });

  it("refuses explicit adoption of content learning already owned by another profile", () => {
    const { ledger } = makeAnonymousLedger();
    const profileLedger = { ...ledger, learnerScope: "profile:profile-a" };
    const pending = migrateLegacyLearningState({ extra: { contentLearningV1: profileLedger } });
    const storage = memoryStorage({ ["shadow_mate_learning_v2:pending"]: JSON.stringify(pending) });

    expect(() => adoptPendingLearningState(storage, PROFILE_B_SCOPE)).toThrow(/scope/i);
    expect(storage.getItem("shadow_mate_learning_v2:household-1:profile-b")).toBeNull();
  });

  it("rejects a pending ledger with a mismatched plan before creating a child key", () => {
    const { ledger } = makeAnonymousLedger();
    Object.values(ledger.plans["2026-10-12"].candidates)[0].learnerScope = "profile:profile-b";
    const pending = migrateLegacyLearningState({ extra: { contentLearningV1: ledger } });
    const raw = JSON.stringify(pending);
    const storage = memoryStorage({ ["shadow_mate_learning_v2:pending"]: raw });

    expect(() => adoptPendingLearningState(storage, PROFILE_B_SCOPE)).toThrow(/scope/i);
    expect(storage.getItem(getLearningStateStorageKey(PROFILE_B_SCOPE))).toBeNull();
    expect(storage.getItem("shadow_mate_learning_v2:pending")).toBe(raw);
  });

  it("preserves unknown schema envelopes instead of migrating them as empty state", () => {
    const pendingRaw = JSON.stringify({
      schema_version: 3,
      learning: { checkins: { retained: { math: true } } },
      extensions: { future: { value: true } },
    });
    const scopedKey = getLearningStateStorageKey(PROFILE_B_SCOPE);
    const scopedRaw = JSON.stringify({
      schema_version: 7,
      scope: PROFILE_B_SCOPE,
      learning: { checkins: { retained: { chinese: true } } },
    });
    const storage = memoryStorage({
      ["shadow_mate_learning_v2:pending"]: pendingRaw,
      [scopedKey]: scopedRaw,
    });

    expect(() => loadLearningStateEnvelope(storage)).toThrow(/unsupported.*schema/i);
    expect(() => loadLearningStateEnvelope(storage, PROFILE_B_SCOPE)).toThrow(/unsupported.*schema/i);
    expect(() => adoptPendingLearningState(storage, PROFILE_B_SCOPE)).toThrow(/unsupported.*schema/i);
    expect(() => adoptPendingLearningState(storage, { household_id: "household-1", profile_id: "profile-c" })).toThrow(/unsupported.*schema/i);
    expect(storage.getItem(getLearningStateStorageKey({ household_id: "household-1", profile_id: "profile-c" }))).toBeNull();
    expect(storage.getItem("shadow_mate_learning_v2:pending")).toBe(pendingRaw);
    expect(storage.getItem(scopedKey)).toBe(scopedRaw);
    expect([...storage.data.keys()]).toEqual(expect.arrayContaining([
      "shadow_mate_learning_v2:pending",
      scopedKey,
    ]));
    expect([...storage.data.keys()].some((key) => key.includes("legacy_backup"))).toBe(false);
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

  it("clears every app-owned profile, pending, legacy, and backup key", () => {
    const storage = memoryStorage({
      shadow_mate_workbench_v1: "legacy",
      "shadow_mate_learning_v2:pending": "pending",
      "shadow_mate_learning_v2:household-a:profile-a": "profile-a",
      "shadow_mate_learning_v2:household-b:profile-b": "profile-b",
      "shadow_mate_learning_v2:legacy_backup:one": "backup",
      unrelated: "keep",
    });

    expect(clearLearningDeskStorage(storage)).toEqual(expect.arrayContaining([
      "shadow_mate_workbench_v1",
      "shadow_mate_learning_v2:pending",
      "shadow_mate_learning_v2:household-a:profile-a",
      "shadow_mate_learning_v2:household-b:profile-b",
      "shadow_mate_learning_v2:legacy_backup:one",
    ]));
    expect(storage.data).toEqual(new Map([["unrelated", "keep"]]));
  });

  it("throws after a failed key deletion instead of reporting cleanup success", () => {
    const storage = memoryStorage({
      "shadow_mate_learning_v2:household-a:profile-a": "profile-a",
    });
    const originalRemove = storage.removeItem.bind(storage);
    storage.removeItem = (key) => {
      if (key.includes("profile-a")) return;
      originalRemove(key);
    };

    expect(() => clearLearningDeskStorage(storage)).toThrow(/cleanup_failed/);
    expect(storage.getItem("shadow_mate_learning_v2:household-a:profile-a")).toBe("profile-a");
  });
});
