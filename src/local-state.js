import { normalizeLearningState } from "./learning-state.js";
import {
  ROTATION_ALGORITHM_VERSION,
  normalizeRotationState,
} from "./hanzi-worksheet-rotation.js";

const ENVELOPE_SCHEMA_VERSION = 1;
const STATUS_SCHEMA_VERSION = 1;
const MAX_STORAGE_CAS_RETRIES = 3;
const ANONYMOUS_SCOPE = "anonymous";
const HANZI_ROTATION_STATE_KEY = "hanziWorksheetRotationV1";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneValue(value) {
  return structuredClone(value);
}

function emptyEnvelope() {
  return {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    scopes: {},
  };
}

function validScope(scope) {
  return typeof scope === "string" && scope.trim().length > 0;
}

function stableHash(value) {
  let hash = 0x811c9dc5;

  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stateFingerprint(state) {
  return stableHash(stableSerialize(state)).toString(16).padStart(8, "0");
}

function getReboundAssignmentId({ packRef, learnerScope, dayKey, rows }) {
  const identity = [
    ROTATION_ALGORITHM_VERSION,
    packRef.setId,
    packRef.contentVersion,
    learnerScope,
    dayKey,
    ...rows.map((row) => row.itemId),
  ].join("|");

  return `${ROTATION_ALGORITHM_VERSION}-${stableHash(identity).toString(16).padStart(8, "0")}`;
}

function rebindRotationState(rotationState, targetScope) {
  const source = normalizeRotationState(rotationState, {
    learnerScope: rotationState?.learnerScope,
    packRef: rotationState?.activePack,
  });
  const assignments = {};

  for (const [dayKey, assignment] of Object.entries(source.assignments)) {
    const candidateIds = new Map();
    const candidates = {};
    for (const [candidateId, worksheet] of Object.entries(assignment.candidates)) {
      const reboundId = getReboundAssignmentId({
        packRef: worksheet.packRef,
        learnerScope: targetScope,
        dayKey: worksheet.dayKey,
        rows: worksheet.rows,
      });
      candidateIds.set(candidateId, reboundId);
      candidates[reboundId] = { ...worksheet, assignmentId: reboundId };
    }

    const candidateKeys = Object.keys(candidates).sort();
    if (candidateKeys.length === 0) continue;

    const completions = {};
    for (const [candidateId, completion] of Object.entries(assignment.completions || {})) {
      const reboundId = candidateIds.get(candidateId);
      if (reboundId && isRecord(completion)) {
        completions[reboundId] = { completedAt: completion.completedAt };
      }
    }

    assignments[dayKey] = {
      canonicalAssignmentId: candidateIds.get(assignment.canonicalAssignmentId) || candidateKeys[0],
      candidates,
      completions,
    };
  }

  return normalizeRotationState(
    {
      ...source,
      learnerScope: targetScope,
      assignments,
    },
    {
      learnerScope: targetScope,
      packRef: source.activePack,
    },
  );
}

/**
 * Rebinds only the versioned worksheet rotation identity during explicit
 * anonymous-to-profile migration. Ordinary merge paths must still reject
 * different learner scopes.
 */
export function rebindStateScope(state, targetScope) {
  const normalizedState = normalizeLearningState(state);
  if (!validScope(targetScope)) return normalizedState;

  const rotationState = normalizedState.extra?.[HANZI_ROTATION_STATE_KEY];
  if (!isRecord(rotationState) || rotationState.learnerScope === targetScope ||
    rotationState.learnerScope !== ANONYMOUS_SCOPE || targetScope === ANONYMOUS_SCOPE) {
    return normalizedState;
  }

  const nextState = structuredClone(normalizedState);
  const reboundRotation = rebindRotationState(rotationState, targetScope);
  if (Object.keys(reboundRotation.assignments).length > 0) {
    nextState.extra[HANZI_ROTATION_STATE_KEY] = reboundRotation;
  } else {
    delete nextState.extra[HANZI_ROTATION_STATE_KEY];
  }
  return normalizeLearningState(nextState);
}

export function createScopedStateStorage({
  storage,
  legacyKey = "shadow_mate_workbench_v1",
  scopedKey = "shadow_mate_workbench_scoped_v1",
  syncKey = `${scopedKey}_sync_v1`,
  normalize = normalizeLearningState,
  normalizeForScope = null,
}) {
  if (!storage || typeof storage.getItem !== "function") {
    throw new TypeError("storage must implement getItem");
  }

  const normalizeState = (state, scope = undefined) => {
    const finish = (value) => {
      const scopedValue = typeof normalizeForScope === "function" && validScope(scope)
        ? normalizeForScope(value, scope)
        : value;
      return isRecord(scopedValue) ? cloneValue(scopedValue) : {};
    };

    try {
      return finish(normalize(state));
    } catch {
      try {
        return finish(normalize({}));
      } catch {
        return {};
      }
    }
  };

  const readRawResult = (key) => {
    try {
      return { ok: true, value: storage.getItem(key) };
    } catch {
      return { ok: false, value: null };
    }
  };

  const readStableRawResult = (key) => {
    let previous = readRawResult(key);
    if (!previous.ok) return previous;

    for (let attempt = 0; attempt < MAX_STORAGE_CAS_RETRIES; attempt += 1) {
      const current = readRawResult(key);
      if (!current.ok) return current;
      if (current.value === previous.value) {
        const confirmation = readRawResult(key);
        if (!confirmation.ok) return confirmation;
        if (confirmation.value === current.value) return confirmation;
        previous = confirmation;
        continue;
      }
      previous = current;
    }

    return { ok: false, value: null };
  };

  const mutateRawIfUnchanged = (key, expectedRaw, nextRaw) => {
    const before = readStableRawResult(key);
    if (!before.ok || before.value !== expectedRaw) {
      return { ok: false, attempted: false };
    }

    try {
      if (nextRaw === null) storage.removeItem(key);
      else storage.setItem(key, nextRaw);
    } catch {
      return { ok: false, attempted: true };
    }

    const after = readStableRawResult(key);
    return {
      ok: after.ok && after.value === nextRaw,
      attempted: true,
    };
  };

  const restoreRawIfUnchanged = (key, expectedRaw, originalRaw) => {
    const current = readStableRawResult(key);
    if (!current.ok) return false;
    if (current.value === originalRaw) return true;
    if (current.value !== expectedRaw) return false;

    return mutateRawIfUnchanged(key, expectedRaw, originalRaw).ok;
  };

  const recoverRawMutations = (mutations, attemptedKeys) => {
    let recovered = true;
    for (const mutation of [...mutations].reverse()) {
      if (!attemptedKeys.has(mutation.key)) continue;
      if (!restoreRawIfUnchanged(mutation.key, mutation.nextRaw, mutation.originalRaw)) {
        recovered = false;
      }
    }
    return recovered;
  };

  const applyRawMutations = (mutations) => {
    const attemptedKeys = new Set();
    for (const mutation of mutations) {
      if (mutation.originalRaw === mutation.nextRaw) continue;

      const result = mutateRawIfUnchanged(
        mutation.key,
        mutation.originalRaw,
        mutation.nextRaw,
      );
      if (result.attempted) attemptedKeys.add(mutation.key);
      if (!result.ok) {
        recoverRawMutations(mutations, attemptedKeys);
        return false;
      }
    }

    for (const mutation of mutations) {
      if (mutation.originalRaw === mutation.nextRaw) continue;
      const current = readStableRawResult(mutation.key);
      if (!current.ok || current.value !== mutation.nextRaw) {
        recoverRawMutations(mutations, attemptedKeys);
        return false;
      }
    }
    return true;
  };

  const normalizeEnvelope = (envelope) => {
    const normalized = emptyEnvelope();
    for (const [scope, state] of Object.entries(envelope?.scopes || {})) {
      if (validScope(scope)) normalized.scopes[scope] = normalizeState(state, scope);
    }
    return normalized;
  };

  const parseEnvelope = (raw) => {
    if (raw === null) return emptyEnvelope();
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== ENVELOPE_SCHEMA_VERSION || !isRecord(parsed.scopes)) {
        return emptyEnvelope();
      }
      return normalizeEnvelope(parsed);
    } catch {
      return emptyEnvelope();
    }
  };

  const readEnvelopeSnapshot = () => {
    const result = readStableRawResult(scopedKey);
    return {
      raw: result.value,
      readable: result.ok,
      envelope: result.ok ? parseEnvelope(result.value) : emptyEnvelope(),
    };
  };

  const writeEnvelopeIfUnchanged = (envelope, expectedRaw) => {
    const normalized = normalizeEnvelope(envelope);
    const serialized = JSON.stringify(normalized);
    return mutateRawIfUnchanged(scopedKey, expectedRaw, serialized).ok;
  };

  const updateEnvelope = (update) => {
    for (let attempt = 0; attempt < MAX_STORAGE_CAS_RETRIES; attempt += 1) {
      const { raw, readable, envelope } = readEnvelopeSnapshot();
      if (!readable) return false;
      const next = {
        ...emptyEnvelope(),
        scopes: Object.fromEntries(
          Object.entries(envelope.scopes).map(([scope, state]) => [scope, normalizeState(state, scope)])
        ),
      };
      update(next);
      if (writeEnvelopeIfUnchanged(next, raw)) return true;
    }
    return false;
  };

  const removeKeyIfUnchanged = (key) => {
    for (let attempt = 0; attempt < MAX_STORAGE_CAS_RETRIES; attempt += 1) {
      const initial = readStableRawResult(key);
      if (!initial.ok) return false;
      const raw = initial.value;
      if (raw === null) return true;
      const result = mutateRawIfUnchanged(key, raw, null);
      if (result.ok) return true;
      if (!result.attempted) continue;
      restoreRawIfUnchanged(key, null, raw);
      return false;
    }
    return false;
  };

  const emptyStatusEnvelope = () => ({
    schemaVersion: STATUS_SCHEMA_VERSION,
    scopes: {},
  });

  const normalizeStatus = (status) => ({
    pending: status?.pending === true,
    lastConfirmed: typeof status?.lastConfirmed === "string" ? status.lastConfirmed : null,
  });

  const parseStatusEnvelope = (raw) => {
    if (raw === null) return emptyStatusEnvelope();
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== STATUS_SCHEMA_VERSION || !isRecord(parsed.scopes)) {
        return emptyStatusEnvelope();
      }
      const envelope = emptyStatusEnvelope();
      for (const [scope, status] of Object.entries(parsed.scopes)) {
        if (validScope(scope)) envelope.scopes[scope] = normalizeStatus(status);
      }
      return envelope;
    } catch {
      return emptyStatusEnvelope();
    }
  };

  const readStatusSnapshot = () => {
    const result = readStableRawResult(syncKey);
    return {
      raw: result.value,
      readable: result.ok,
      envelope: result.ok ? parseStatusEnvelope(result.value) : emptyStatusEnvelope(),
    };
  };

  const writeStatusIfUnchanged = (envelope, expectedRaw) => {
    const normalized = emptyStatusEnvelope();
    for (const [scope, status] of Object.entries(envelope?.scopes || {})) {
      if (validScope(scope)) normalized.scopes[scope] = normalizeStatus(status);
    }
    const nextRaw = Object.keys(normalized.scopes).length === 0
      ? null
      : JSON.stringify(normalized);
    return mutateRawIfUnchanged(syncKey, expectedRaw, nextRaw).ok;
  };

  const envelopeWithoutScopeRaw = (snapshot, scope) => {
    if (!Object.hasOwn(snapshot.envelope.scopes, scope)) return snapshot.raw;
    const next = {
      ...emptyEnvelope(),
      scopes: Object.fromEntries(
        Object.entries(snapshot.envelope.scopes).filter(([key]) => key !== scope)
      ),
    };
    return Object.keys(next.scopes).length === 0
      ? null
      : JSON.stringify(normalizeEnvelope(next));
  };

  const statusWithoutScopeRaw = (snapshot, scope) => {
    if (!Object.hasOwn(snapshot.envelope.scopes, scope)) return snapshot.raw;
    const next = {
      ...emptyStatusEnvelope(),
      scopes: Object.fromEntries(
        Object.entries(snapshot.envelope.scopes).filter(([key]) => key !== scope)
      ),
    };
    const normalized = emptyStatusEnvelope();
    for (const [key, status] of Object.entries(next.scopes)) {
      if (validScope(key)) normalized.scopes[key] = normalizeStatus(status);
    }
    return Object.keys(normalized.scopes).length === 0
      ? null
      : JSON.stringify(normalized);
  };

  const updateStatus = (scope, update) => {
    for (let attempt = 0; attempt < MAX_STORAGE_CAS_RETRIES; attempt += 1) {
      const { raw, readable, envelope } = readStatusSnapshot();
      if (!readable) return false;
      const next = {
        ...emptyStatusEnvelope(),
        scopes: Object.fromEntries(
          Object.entries(envelope.scopes).map(([key, status]) => [key, normalizeStatus(status)])
        ),
      };
      update(next, next.scopes[scope]);
      if (writeStatusIfUnchanged(next, raw)) return true;
    }
    return false;
  };

  const readStateFromEnvelope = (envelope, scope) =>
    Object.hasOwn(envelope.scopes, scope)
      ? normalizeState(envelope.scopes[scope], scope)
      : normalizeState({}, scope);

  const readLegacySnapshot = () => {
    const result = readStableRawResult(legacyKey);
    if (!result.ok || result.value === null) return { ...result, state: null };
    try {
      return {
        ...result,
        state: normalizeState(JSON.parse(result.value), ANONYMOUS_SCOPE),
      };
    } catch {
      return { ...result, state: normalizeState({}, ANONYMOUS_SCOPE) };
    }
  };

  const readLegacyState = () => readLegacySnapshot().state;

  return {
    load(scope) {
      if (!validScope(scope)) return normalizeState({});
      const { envelope } = readEnvelopeSnapshot();
      if (Object.hasOwn(envelope.scopes, scope)) {
        return readStateFromEnvelope(envelope, scope);
      }
      if (scope === ANONYMOUS_SCOPE) {
        return readLegacyState() || normalizeState({});
      }
      return normalizeState({});
    },

    save(scope, state) {
      if (!validScope(scope)) return false;
      const normalizedState = normalizeState(state, scope);
      const currentStatus = readStatusSnapshot().envelope.scopes[scope];
      const hasExplicitPending = arguments.length > 2 && arguments[2] &&
        Object.hasOwn(arguments[2], "pending");
      const requestedPending = hasExplicitPending ? arguments[2].pending : undefined;
      const nextStatus = requestedPending === undefined
        ? currentStatus
        : {
          pending: requestedPending === true,
          lastConfirmed: requestedPending === false ? stateFingerprint(normalizedState) : currentStatus?.lastConfirmed || null,
        };

      if (requestedPending !== undefined && !updateStatus(scope, (next) => {
        if (nextStatus) next.scopes[scope] = nextStatus;
        else delete next.scopes[scope];
      })) return false;

      const saved = updateEnvelope((next) => {
        next.scopes[scope] = normalizedState;
      });
      if (!saved && requestedPending !== undefined) {
        updateStatus(scope, (next) => {
          next.scopes[scope] = {
            pending: true,
            lastConfirmed: currentStatus?.lastConfirmed || null,
          };
        });
      }
      return saved;
    },

    remove(scope) {
      if (!validScope(scope)) return false;

      const legacySnapshot = scope === ANONYMOUS_SCOPE
        ? readStableRawResult(legacyKey)
        : { ok: true, value: null };
      const statusSnapshot = readStatusSnapshot();
      const stateSnapshot = readEnvelopeSnapshot();
      if (!legacySnapshot.ok || !statusSnapshot.readable || !stateSnapshot.readable) return false;

      const mutations = [];
      const nextStateRaw = envelopeWithoutScopeRaw(stateSnapshot, scope);
      if (nextStateRaw !== stateSnapshot.raw) {
        mutations.push({
          key: scopedKey,
          originalRaw: stateSnapshot.raw,
          nextRaw: nextStateRaw,
        });
      }

      const nextStatusRaw = statusWithoutScopeRaw(statusSnapshot, scope);
      if (nextStatusRaw !== statusSnapshot.raw) {
        mutations.push({
          key: syncKey,
          originalRaw: statusSnapshot.raw,
          nextRaw: nextStatusRaw,
        });
      }

      if (scope === ANONYMOUS_SCOPE && legacySnapshot.value !== null) {
        mutations.push({
          key: legacyKey,
          originalRaw: legacySnapshot.value,
          nextRaw: null,
        });
      }

      return applyRawMutations(mutations);
    },

    clear() {
      const keys = [...new Set([scopedKey, syncKey, legacyKey])];
      const snapshots = new Map();
      for (const key of keys) {
        const snapshot = readStableRawResult(key);
        if (!snapshot.ok) return false;
        snapshots.set(key, snapshot.value);
      }

      const mutations = keys
        .filter((key) => snapshots.get(key) !== null)
        .map((key) => ({
          key,
          originalRaw: snapshots.get(key),
          nextRaw: null,
        }));
      return applyRawMutations(mutations);
    },

    listScopes() {
      return Object.keys(readEnvelopeSnapshot().envelope.scopes);
    },

    getStatus(scope, state = undefined) {
      if (!validScope(scope)) return { dirty: false, pending: false, lastConfirmed: null };
      const normalizedState = state === undefined ? this.load(scope) : normalizeState(state, scope);
      const status = readStatusSnapshot().envelope.scopes[scope];
      if (!status) return { dirty: false, pending: false, lastConfirmed: null };
      const fingerprintMatches = status.lastConfirmed === null ||
        status.lastConfirmed === stateFingerprint(normalizedState);
      const pending = status.pending || !fingerprintMatches;
      return {
        dirty: pending,
        pending,
        lastConfirmed: status.lastConfirmed,
      };
    },

    markCloudConfirmed(scope, state) {
      if (!validScope(scope)) return false;
      const normalizedState = normalizeState(state, scope);
      const currentState = this.load(scope);
      const fingerprint = stateFingerprint(normalizedState);
      if (stateFingerprint(currentState) !== fingerprint) {
        updateStatus(scope, (next, current) => {
          next.scopes[scope] = {
            pending: true,
            lastConfirmed: current?.lastConfirmed || null,
          };
        });
        return false;
      }
      return updateStatus(scope, (next) => {
        next.scopes[scope] = { pending: false, lastConfirmed: fingerprint };
      });
    },

    migrateLegacyToAnonymous() {
      for (let attempt = 0; attempt < MAX_STORAGE_CAS_RETRIES; attempt += 1) {
        const legacySnapshot = readLegacySnapshot();
        if (!legacySnapshot.ok) return false;
        if (legacySnapshot.state === null) return false;

        const legacyState = legacySnapshot.state;
        const { raw, readable, envelope } = readEnvelopeSnapshot();
        if (!readable) return false;
        if (Object.hasOwn(envelope.scopes, ANONYMOUS_SCOPE)) {
          removeKeyIfUnchanged(legacyKey);
          return false;
        }
        const next = {
          ...emptyEnvelope(),
          scopes: { ...envelope.scopes, [ANONYMOUS_SCOPE]: legacyState },
        };
        if (!writeEnvelopeIfUnchanged(next, raw)) continue;
        // The copied state is authoritative. Remove only the exact legacy
        // snapshot so a concurrent legacy write is never deleted.
        if (readStableRawResult(legacyKey).value === legacySnapshot.value) {
          removeKeyIfUnchanged(legacyKey);
        }
        return true;
      }
      return false;
    },
  };
}
