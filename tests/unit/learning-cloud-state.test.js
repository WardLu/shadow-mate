import { describe, expect, it } from "vitest";
import {
  buildCloudSavePayload,
  normalizeCloudLearningState,
} from "../../src/learning-cloud-state.js";

const SCOPE = { household_id: "household-1", profile_id: "profile-2" };

describe("cloud learning state contract", () => {
  it("normalizes legacy remote state while keeping the optimistic version separate", () => {
    const normalized = normalizeCloudLearningState({
      state: {
        checkins: { "2026-08-14": { chinese: 1 } },
        points: { "2026-08": { "0": { "14": 1 } } },
        futureField: { enabled: true },
      },
      version: 12,
      updated_at: "2026-08-14T08:00:00.000Z",
    }, SCOPE);

    expect(normalized).toMatchObject({
      version: 12,
      updated_at: "2026-08-14T08:00:00.000Z",
      state: {
        schema_version: 2,
        scope: SCOPE,
        legacy: { points_readonly: { "2026-08": { "0": { "14": 1 } } } },
        extensions: { legacy_unknown: { futureField: { enabled: true } } },
      },
    });
    expect(normalized.state).not.toHaveProperty("version");
  });

  it("fails closed when a remote envelope belongs to another child", () => {
    const normalized = normalizeCloudLearningState({
      state: {
        schema_version: 2,
        scope: { household_id: "household-1", profile_id: "profile-1" },
        learning: { checkins: { leaked: { math: 1 } } },
      },
      version: 8,
      updated_at: "2026-08-14T08:00:00.000Z",
    }, SCOPE);

    expect(normalized.scope_mismatch).toBe(true);
    expect(normalized.version).toBeNull();
    expect(normalized.state.scope).toEqual(SCOPE);
    expect(normalized.state.learning.checkins).toEqual({});
  });

  it("fails closed when a v2 remote envelope has no child scope", () => {
    const normalized = normalizeCloudLearningState({
      state: {
        schema_version: 2,
        learning: { checkins: { leaked: { math: 1 } } },
      },
      version: 5,
    }, SCOPE);

    expect(normalized.scope_mismatch).toBe(true);
    expect(normalized.version).toBeNull();
    expect(normalized.state.scope).toEqual(SCOPE);
    expect(normalized.state.learning.checkins).toEqual({});
  });

  it("sends state schema and optimistic version as separate save fields", () => {
    const state = {
      schema_version: 2,
      scope: SCOPE,
      learning: { checkins: {} },
      extensions: {},
    };

    expect(buildCloudSavePayload(state, 12)).toEqual({
      p_state: state,
      p_expected_version: 12,
    });
  });
});
