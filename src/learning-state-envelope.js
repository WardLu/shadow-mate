import { defaultContentConfig } from "./learning-content-package.js";

const LEGACY_STATE_KEYS = new Set([
  "checkins",
  "extra",
  "points",
  "bookShelf",
  "peanutLog",
  "peanutRead",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneRecord(value) {
  return isRecord(value) ? structuredClone(value) : {};
}

function cloneArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

function normalizeScope(scope = {}) {
  return {
    household_id: scope.householdId ?? scope.household_id ?? null,
    profile_id: scope.profileId ?? scope.profile_id ?? null,
  };
}

export function getLearningStateStorageKey(scope = {}) {
  const householdId = scope.householdId ?? scope.household_id;
  const profileId = scope.profileId ?? scope.profile_id;
  if (!householdId || !profileId) return "shadow_mate_learning_v2:pending";
  return `shadow_mate_learning_v2:${encodeURIComponent(householdId)}:${encodeURIComponent(profileId)}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isEnvelope(value) {
  return isRecord(value) && value.schema_version === 2 && isRecord(value.learning);
}

export function migrateLegacyLearningState(source, scope = {}) {
  if (isEnvelope(source)) return structuredClone(source);

  const legacy = isRecord(source) ? source : {};
  const sourceHash = hashString(stableStringify(legacy));
  const legacyUnknown = Object.fromEntries(
    Object.entries(legacy).filter(([key]) => !LEGACY_STATE_KEYS.has(key)),
  );

  return {
    schema_version: 2,
    product_id: "shadow-mate",
    scope: normalizeScope(scope),
    learning: {
      checkins: cloneRecord(legacy.checkins),
      extra: cloneRecord(legacy.extra),
      bookShelf: cloneRecord(legacy.bookShelf),
      peanutLog: cloneArray(legacy.peanutLog),
      peanutRead: cloneRecord(legacy.peanutRead),
      content_config: defaultContentConfig(),
    },
    legacy: {
      points_readonly: cloneRecord(legacy.points),
    },
    extensions: {
      legacy_unknown: structuredClone(legacyUnknown),
    },
    migration: {
      source_schema: "legacy-v1",
      source_key: "shadow_mate_workbench_v1",
      source_hash: sourceHash,
      migration_id: `legacy-v1:${sourceHash}`,
      migrated_at: null,
    },
  };
}
