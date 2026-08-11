export const COMMERCIAL_CONTRACT_VERSION = 1;

export const CAPABILITY_KEYS = Object.freeze([
  "cloud_sync",
  "core_incentives",
  "ai_task_fun",
  "ai_activity_generator",
  "weekly_growth_plan",
  "advanced_growth_report",
  "premium_content",
  "extra_storage",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRemaining(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeResetAt(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function normalizeCapability(value) {
  if (typeof value === "boolean") {
    return { enabled: value, remaining: null, resetAt: null };
  }

  if (!isRecord(value)) {
    return { enabled: false, remaining: null, resetAt: null };
  }

  return {
    enabled: value.enabled === true,
    remaining: normalizeRemaining(value.remaining),
    resetAt: normalizeResetAt(value.resetAt),
  };
}

export function normalizeCapabilitySnapshot(input = {}) {
  const source = isRecord(input) ? input : {};
  const capabilities = {};

  for (const key of CAPABILITY_KEYS) {
    capabilities[key] = normalizeCapability(source[key]);
  }

  return {
    contractVersion: COMMERCIAL_CONTRACT_VERSION,
    capabilities,
  };
}

export function hasCapability(snapshot, key) {
  return Boolean(
    snapshot?.contractVersion === COMMERCIAL_CONTRACT_VERSION
      && CAPABILITY_KEYS.includes(key)
      && snapshot.capabilities?.[key]?.enabled === true
  );
}
