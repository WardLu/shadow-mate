import { normalizeLearningState } from "./learning-state.js";
import {
  ROTATION_ALGORITHM_VERSION,
  normalizeRotationState,
} from "./hanzi-worksheet-rotation.js";

const ENVELOPE_SCHEMA_VERSION = 1;
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
  if (!isRecord(rotationState) || rotationState.learnerScope === targetScope) {
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
  normalize = normalizeLearningState,
}) {
  if (!storage || typeof storage.getItem !== "function") {
    throw new TypeError("storage must implement getItem");
  }

  const normalizeState = (state) => {
    try {
      const normalized = normalize(state);
      return isRecord(normalized) ? cloneValue(normalized) : {};
    } catch {
      try {
        const fallback = normalize({});
        return isRecord(fallback) ? cloneValue(fallback) : {};
      } catch {
        return {};
      }
    }
  };

  const readRaw = (key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  const readEnvelope = () => {
    const raw = readRaw(scopedKey);
    if (raw === null) return emptyEnvelope();

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== ENVELOPE_SCHEMA_VERSION || !isRecord(parsed.scopes)) {
        return emptyEnvelope();
      }
      const envelope = emptyEnvelope();
      for (const [scope, state] of Object.entries(parsed.scopes)) {
        if (validScope(scope)) envelope.scopes[scope] = normalizeState(state);
      }
      return envelope;
    } catch {
      return emptyEnvelope();
    }
  };

  const writeEnvelope = (envelope) => {
    const normalized = emptyEnvelope();
    for (const [scope, state] of Object.entries(envelope?.scopes || {})) {
      if (validScope(scope)) normalized.scopes[scope] = normalizeState(state);
    }
    try {
      storage.setItem(scopedKey, JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  };

  const readLegacyState = () => {
    const raw = readRaw(legacyKey);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch {
      return normalizeState({});
    }
  };

  return {
    load(scope) {
      if (!validScope(scope)) return normalizeState({});
      const envelope = readEnvelope();
      if (Object.hasOwn(envelope.scopes, scope)) {
        return normalizeState(envelope.scopes[scope]);
      }
      if (scope === ANONYMOUS_SCOPE) {
        return readLegacyState() || normalizeState({});
      }
      return normalizeState({});
    },

    save(scope, state) {
      if (!validScope(scope)) return false;
      const envelope = readEnvelope();
      envelope.scopes[scope] = normalizeState(state);
      return writeEnvelope(envelope);
    },

    remove(scope) {
      if (!validScope(scope)) return false;
      const envelope = readEnvelope();
      if (!Object.hasOwn(envelope.scopes, scope)) return true;
      delete envelope.scopes[scope];
      if (Object.keys(envelope.scopes).length === 0) {
        try {
          storage.removeItem(scopedKey);
          return true;
        } catch {
          return false;
        }
      }
      return writeEnvelope(envelope);
    },

    clear() {
      let succeeded = true;
      try {
        storage.removeItem(scopedKey);
      } catch {
        succeeded = false;
      }
      try {
        storage.removeItem(legacyKey);
      } catch {
        succeeded = false;
      }
      return succeeded;
    },

    listScopes() {
      return Object.keys(readEnvelope().scopes);
    },

    migrateLegacyToAnonymous() {
      const legacyState = readLegacyState();
      if (legacyState === null) return false;

      const envelope = readEnvelope();
      if (Object.hasOwn(envelope.scopes, ANONYMOUS_SCOPE)) {
        try {
          storage.removeItem(legacyKey);
        } catch {
          // A completed migration is still safe to retry; the scoped copy wins.
        }
        return false;
      }

      envelope.scopes[ANONYMOUS_SCOPE] = legacyState;
      if (!writeEnvelope(envelope)) return false;

      try {
        storage.removeItem(legacyKey);
      } catch {
        // Keep the successful scoped copy. A later call will retry cleanup.
      }
      return true;
    },
  };
}
