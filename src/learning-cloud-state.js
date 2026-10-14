import { migrateLegacyLearningState } from "./learning-state-envelope.js";
import { encodeLearningStateArchive, LEARNING_WRITE_PROTOCOL } from "./learning-state-codec.js";

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
  const isVersionedEnvelope = [2, 3].includes(rawState?.schema_version);

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
    p_state: encodeLearningStateArchive(migrateLegacyLearningState(state)),
    p_expected_version: expectedVersion,
    p_write_protocol: LEARNING_WRITE_PROTOCOL,
  };
}
