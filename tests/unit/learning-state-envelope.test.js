import { describe, expect, it } from "vitest";
import {
  getLearningStateStorageKey,
  migrateLegacyLearningState,
} from "../../src/learning-state-envelope.js";

describe("learning state envelope migration", () => {
  it("wraps legacy state without losing unknown fields or treating old points as current balance", () => {
    const legacy = {
      checkins: { "2026-08-14": { "chinese-literacy": true } },
      extra: { mathCount: 3 },
      points: { "2026-8": { "0": { "14": 1 } } },
      bookShelf: {},
      peanutLog: [],
      peanutRead: {},
      futureField: { keep: true },
    };

    const migrated = migrateLegacyLearningState(legacy, {
      householdId: "household-1",
      profileId: "profile-1",
    });

    expect(migrated).toMatchObject({
      schema_version: 2,
      product_id: "shadow-mate",
      scope: { household_id: "household-1", profile_id: "profile-1" },
      learning: {
        checkins: legacy.checkins,
        extra: legacy.extra,
        bookShelf: legacy.bookShelf,
        peanutLog: legacy.peanutLog,
        peanutRead: legacy.peanutRead,
      },
      legacy: { points_readonly: legacy.points },
      extensions: { legacy_unknown: { futureField: legacy.futureField } },
    });
    expect(migrated).not.toHaveProperty("learning.points");
    expect(migrated.migration.source_schema).toBe("legacy-v1");
    expect(migrated.migration.migration_id).toMatch(/^legacy-v1:/);
  });

  it("uses a different local namespace for every child and a separate pending namespace", () => {
    const firstChild = getLearningStateStorageKey({ householdId: "household-1", profileId: "profile-1" });
    const secondChild = getLearningStateStorageKey({ householdId: "household-1", profileId: "profile-2" });
    const pending = getLearningStateStorageKey();

    expect(firstChild).toBe("shadow_mate_learning_v2:household-1:profile-1");
    expect(secondChild).toBe("shadow_mate_learning_v2:household-1:profile-2");
    expect(firstChild).not.toBe(secondChild);
    expect(pending).toBe("shadow_mate_learning_v2:pending");
  });

  it("normalizes malformed legacy containers to safe defaults", () => {
    const migrated = migrateLegacyLearningState({
      checkins: [],
      extra: null,
      points: null,
      bookShelf: "not-an-object",
      peanutLog: "not-an-array",
      peanutRead: false,
    });

    expect(migrated.learning).toMatchObject({
      checkins: {},
      extra: {},
      bookShelf: {},
      peanutLog: [],
      peanutRead: {},
    });
    expect(migrated.legacy.points_readonly).toEqual({});
  });
});
