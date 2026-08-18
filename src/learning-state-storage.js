import {
  getLearningStateStorageKey,
  migrateLegacyLearningState,
} from "./learning-state-envelope.js";

export const LEGACY_LEARNING_STATE_KEY = "shadow_mate_workbench_v1";
export const PENDING_LEARNING_STATE_KEY = getLearningStateStorageKey();

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseStoredState(raw) {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function backupLegacyValue(storage, raw, sourceHash) {
  const backupKey = `shadow_mate_learning_v2:legacy_backup:${sourceHash}`;
  if (storage.getItem(backupKey) === null) storage.setItem(backupKey, raw);
  return backupKey;
}

function persistMigratedState(storage, key, raw, envelope, sourceHash = null) {
  if (raw !== null) backupLegacyValue(storage, raw, sourceHash || hashString(raw));
  storage.setItem(key, JSON.stringify(envelope));
  return envelope;
}

function scopeIds(scope = {}) {
  return {
    householdId: scope.householdId ?? scope.household_id ?? null,
    profileId: scope.profileId ?? scope.profile_id ?? null,
  };
}

function hasChildScope(scope = {}) {
  const ids = scopeIds(scope);
  return Boolean(ids.householdId && ids.profileId);
}

function matchesScope(envelope, scope = {}) {
  const { householdId: expectedHouseholdId, profileId: expectedProfileId } = scopeIds(scope);
  return envelope.scope?.household_id === expectedHouseholdId && envelope.scope?.profile_id === expectedProfileId;
}

function isEmptyEnvelope(envelope) {
  const learning = envelope?.learning || {};
  return Object.keys(learning.checkins || {}).length === 0
    && Object.keys(learning.extra || {}).length === 0
    && Object.keys(learning.bookShelf || {}).length === 0
    && Object.keys(learning.peanutRead || {}).length === 0
    && (learning.peanutLog || []).length === 0
    && Object.keys(envelope?.legacy?.points_readonly || {}).length === 0
    && Object.keys(envelope?.extensions?.legacy_unknown || {}).length === 0;
}

function loadPendingEnvelope(storage) {
  const pendingRaw = storage.getItem(PENDING_LEARNING_STATE_KEY);
  if (pendingRaw !== null) {
    const pendingState = parseStoredState(pendingRaw);
    if (pendingState?.schema_version === 2 && pendingState.learning && matchesScope(pendingState, {})) {
      return pendingState;
    }
    return persistMigratedState(
      storage,
      PENDING_LEARNING_STATE_KEY,
      pendingRaw,
      migrateLegacyLearningState(pendingState, {}),
    );
  }

  const legacyRaw = storage.getItem(LEGACY_LEARNING_STATE_KEY);
  if (legacyRaw !== null) {
    return persistMigratedState(
      storage,
      PENDING_LEARNING_STATE_KEY,
      legacyRaw,
      migrateLegacyLearningState(parseStoredState(legacyRaw), {}),
    );
  }

  const emptyEnvelope = migrateLegacyLearningState({}, {});
  storage.setItem(PENDING_LEARNING_STATE_KEY, JSON.stringify(emptyEnvelope));
  return emptyEnvelope;
}

export function loadLearningStateEnvelope(storage, scope = {}) {
  if (!hasChildScope(scope)) return loadPendingEnvelope(storage);

  const scopedKey = getLearningStateStorageKey(scope);
  const scopedRaw = storage.getItem(scopedKey);
  if (scopedRaw !== null) {
    const scopedState = parseStoredState(scopedRaw);
    if (scopedState?.schema_version === 2 && scopedState.learning && matchesScope(scopedState, scope)) {
      return scopedState;
    }
    if (scopedState?.schema_version === 2 && scopedState.learning) {
      const emptyEnvelope = migrateLegacyLearningState({}, scope);
      return persistMigratedState(storage, scopedKey, scopedRaw, emptyEnvelope);
    }
    return persistMigratedState(
      storage,
      scopedKey,
      scopedRaw,
      migrateLegacyLearningState(scopedState, scope),
    );
  }

  // A legacy global state is migrated to the pending namespace only. It must
  // not be assigned to a child until the parent explicitly adopts it.
  loadPendingEnvelope(storage);
  const emptyEnvelope = migrateLegacyLearningState({}, scope);
  storage.setItem(scopedKey, JSON.stringify(emptyEnvelope));
  return emptyEnvelope;
}

export function adoptPendingLearningState(storage, scope = {}) {
  if (!hasChildScope(scope)) return loadPendingEnvelope(storage);

  const scopedKey = getLearningStateStorageKey(scope);
  const existingRaw = storage.getItem(scopedKey);
  if (existingRaw !== null) {
    const existing = parseStoredState(existingRaw);
    if (
      existing?.schema_version === 2
      && existing.learning
      && matchesScope(existing, scope)
      && !isEmptyEnvelope(existing)
    ) {
      return existing;
    }
  }

  const pending = loadPendingEnvelope(storage);
  const adopted = structuredClone(pending);
  adopted.scope = {
    household_id: scope.householdId ?? scope.household_id ?? null,
    profile_id: scope.profileId ?? scope.profile_id ?? null,
  };
  adopted.migration = {
    ...(adopted.migration || {}),
    adopted_from: "pending",
    adopted_to: adopted.scope.profile_id,
  };
  storage.setItem(scopedKey, JSON.stringify(adopted));
  return adopted;
}
