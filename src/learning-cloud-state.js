import { migrateLegacyLearningState } from "./learning-state-envelope.js";

function normalizeScope(scope = {}) {
  return {
    household_id: scope.householdId ?? scope.household_id ?? null,
    profile_id: scope.profileId ?? scope.profile_id ?? null,
  };
}

function sameScope(left, right) {
  return left?.household_id === right.household_id
    && left?.profile_id === right.profile_id;
}

function emptyState(scope) {
  return migrateLegacyLearningState({}, scope);
}

/**
 * Normalize a remote row without conflating its cloud optimistic-lock
 * version with the schema version inside the portable learning state.
 */
export function normalizeCloudLearningState(row = {}, scope = {}) {
  const requestedScope = normalizeScope(scope);
  const rawState = row?.state;
  const state = migrateLegacyLearningState(rawState, requestedScope);
  const isVersionedEnvelope = rawState?.schema_version === 2 && rawState?.learning;

  if (isVersionedEnvelope && !sameScope(state.scope, requestedScope)) {
    return {
      state: emptyState(requestedScope),
      version: null,
      updated_at: null,
      scope_mismatch: true,
    };
  }

  return {
    state,
    version: row?.version ?? null,
    updated_at: row?.updated_at ?? null,
    scope_mismatch: false,
  };
}

/**
 * Keep the RPC optimistic-lock input beside, but outside, the state envelope.
 */
export function buildCloudSavePayload(state, expectedVersion = null) {
  return {
    p_state: structuredClone(state),
    p_expected_version: expectedVersion,
  };
}
