import {
  getLearningStateStorageKey,
  migrateLegacyLearningState,
} from "./learning-state-envelope.js";
import { CONTENT_LEARNING_STATE_KEY, hasCompatibleContentLearningScope, rebindContentLearningScope } from "./learning-state.js";

export const LEGACY_LEARNING_STATE_KEY = "shadow_mate_workbench_v1";
export const PENDING_LEARNING_STATE_KEY = getLearningStateStorageKey();
export const LEARNING_STATE_STORAGE_PREFIX = "shadow_mate_learning_v2:";

function isAppOwnedLearningDeskKey(key) {
  return key === LEGACY_LEARNING_STATE_KEY || key.startsWith(LEARNING_STATE_STORAGE_PREFIX);
}

export function listLearningDeskStorageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isAppOwnedLearningDeskKey(key)) keys.push(key);
  }
  return keys;
}

export function clearLearningDeskStorage(storage) {
  const keys = listLearningDeskStorageKeys(storage);
  for (const key of keys) {
    storage.removeItem(key);
    if (storage.getItem(key) !== null) {
      throw new Error(`learning_desk_key_cleanup_failed:${key}`);
    }
  }
  const remaining = listLearningDeskStorageKeys(storage);
  if (remaining.length > 0) {
    throw new Error(`learning_desk_keys_remaining:${remaining.join(",")}`);
  }
  return keys;
}

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
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && Object.hasOwn(parsed, "schema_version") && parsed.schema_version !== 2) {
      throw new RangeError(`Unsupported learning state schema version: ${parsed.schema_version}`);
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (/^Unsupported learning state schema version:/.test(String(error?.message || ""))) throw error;
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

function unsupportedSchemaError(state, key) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const schemaVersion = state.schema_version;
  if (schemaVersion === undefined || schemaVersion === 1 || schemaVersion === 2) return null;
  return new RangeError(`Unsupported learning state schema_version ${schemaVersion} in ${key}`);
}

function loadPendingEnvelope(storage) {
  const pendingRaw = storage.getItem(PENDING_LEARNING_STATE_KEY);
  if (pendingRaw !== null) {
    const pendingState = parseStoredState(pendingRaw);
    const pendingSchemaError = unsupportedSchemaError(pendingState, PENDING_LEARNING_STATE_KEY);
    if (pendingSchemaError) throw pendingSchemaError;
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
    const scopedSchemaError = unsupportedSchemaError(scopedState, scopedKey);
    if (scopedSchemaError) throw scopedSchemaError;
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
    const existingSchemaError = unsupportedSchemaError(existing, scopedKey);
    if (existingSchemaError) throw existingSchemaError;
    if (
      existing?.schema_version === 2
      && existing.learning
      && matchesScope(existing, scope)
      && !isEmptyEnvelope(existing)
    ) {
      if (!hasCompatibleContentLearningScope(existing.learning, `profile:${scope.profileId ?? scope.profile_id}`)) {
        throw new RangeError("Content learning ledger scope does not match the adopted learner");
      }
      return existing;
    }
  }

  const pending = loadPendingEnvelope(storage);
  const adopted = structuredClone(pending);
  adopted.scope = {
    household_id: scope.householdId ?? scope.household_id ?? null,
    profile_id: scope.profileId ?? scope.profile_id ?? null,
  };
  const contentLearning = adopted.learning?.extra?.[CONTENT_LEARNING_STATE_KEY];
  const targetLearnerScope = `profile:${adopted.scope.profile_id}`;
  if (contentLearning) {
    if (!hasCompatibleContentLearningScope(pending.learning, "anonymous")) {
      throw new RangeError("Pending content learning ledger scope is invalid");
    }
    const rebound = rebindContentLearningScope(adopted.learning, targetLearnerScope);
    adopted.learning.extra[CONTENT_LEARNING_STATE_KEY] = rebound.extra[CONTENT_LEARNING_STATE_KEY];
  }
  adopted.migration = {
    ...(adopted.migration || {}),
    adopted_from: "pending",
    adopted_to: adopted.scope.profile_id,
  };
  storage.setItem(scopedKey, JSON.stringify(adopted));
  return adopted;
}
