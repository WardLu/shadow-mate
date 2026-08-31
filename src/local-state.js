import { normalizeLearningState } from "./learning-state.js";

const ENVELOPE_SCHEMA_VERSION = 1;
const ANONYMOUS_SCOPE = "anonymous";

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
