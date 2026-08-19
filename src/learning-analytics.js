export const ACTIVITY_EVENT_TYPES = Object.freeze({
  HOUSEHOLD_ACTIVATED: "household_activated",
  LEARNER_CREATED: "learner_created",
  CORE_ACTIVATION: "core_activation",
  GROWTH_ACTIVITY_RECORDED: "growth_activity_recorded",
  RETENTION_QUALIFIED: "retention_qualified",
  REWARD_REDEEMED: "reward_redeemed",
  SYNC_FAILED: "sync_failed",
  TTS_FAILED: "tts_failed",
});

const ALLOWED_TYPES = new Set(Object.values(ACTIVITY_EVENT_TYPES));
const COMMON_PAYLOAD_KEYS = new Set(["source", "entry_type", "error_code", "retryable", "days", "count"]);

function clone(value) {
  return structuredClone(value);
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hash32(value, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function activityEventIdFor({ household_id, profile_id, event_type, bucket = "once" } = {}) {
  const input = `${household_id || ""}:${profile_id || ""}:${event_type || ""}:${bucket}`;
  const hex = [0, 1, 2, 3].map((seed) => hash32(input, seed)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sanitizePayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.entries(payload).reduce((result, [key, value]) => {
    if (!COMMON_PAYLOAD_KEYS.has(key)) return result;
    if (typeof value === "string") result[key] = value.slice(0, 80);
    else if (typeof value === "number" || typeof value === "boolean") result[key] = value;
    return result;
  }, {});
}

export function buildActivityEvent({
  event_type,
  household_id,
  profile_id,
  occurred_at = new Date().toISOString(),
  client_version = null,
  timezone = null,
  payload = {},
  event_id = null,
} = {}) {
  if (!ALLOWED_TYPES.has(event_type)) throw new Error("activity_event_type_invalid");
  if (!household_id || !profile_id) throw new Error("activity_event_scope_required");
  return {
    event_id: event_id || createId(),
    scope_key: `${household_id}:${profile_id}`,
    product_id: "shadow-mate",
    event_type,
    household_id,
    profile_id,
    occurred_at,
    timezone: timezone ? String(timezone).slice(0, 64) : null,
    client_version: client_version ? String(client_version).slice(0, 32) : null,
    payload: clone(sanitizePayload(payload)),
  };
}

export function isAllowedActivityEvent(eventType) {
  return ALLOWED_TYPES.has(eventType);
}
