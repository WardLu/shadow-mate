const EXPORT_SCHEMA_VERSION = 1;
const PRODUCT_ID = "shadow-mate";

const SENSITIVE_KEY_PATTERNS = [
  /auth/i,
  /email/i,
  /session/i,
  /secret/i,
  /token/i,
  /password/i,
  /device/i,
  /sound/i,
  /activity.?event/i,
  /analytics/i,
  /server.?audit/i,
  /internal.?audit/i,
  /audit.?log/i,
];

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeForExport(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeForExport);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.entries(value).reduce((result, [key, entry]) => {
    if (!isSensitiveKey(key)) {
      result[key] = sanitizeForExport(entry);
    }
    return result;
  }, {});
}

function pick(source, keys) {
  return keys.reduce((result, key) => {
    if (source && source[key] !== undefined) {
      result[key] = sanitizeForExport(source[key]);
    }
    return result;
  }, {});
}

function exportLearner(learner) {
  return pick(learner, [
    "id",
    "household_id",
    "display_name",
    "grade_level",
    "age_band",
    "avatar_key",
    "created_at",
    "updated_at",
    "state",
    "state_version",
    "state_updated_at",
  ]);
}

function exportConsent(consent) {
  return pick(consent, [
    "household_id",
    "profile_id",
    "consent_type",
    "policy_version",
    "consented_at",
    "created_at",
    "revoked_at",
    "source",
  ]);
}

function exportRows(rows) {
  return Array.isArray(rows) ? rows.map(sanitizeForExport) : [];
}

/**
 * Build the user-owned data export. The field allowlists keep credentials,
 * device preferences, raw analytics, and server-only audit data out of the
 * portable product history.
 */
export function buildHouseholdExport(input = {}) {
  const household = input.household || {};
  const growthLoop = input.growthLoop || {};

  return {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    product_id: PRODUCT_ID,
    exported_at: input.exportedAt || new Date().toISOString(),
    household: pick(household, ["id", "name"]),
    learners: Array.isArray(input.learners) ? input.learners.map(exportLearner) : [],
    consents: Array.isArray(input.consents) ? input.consents.map(exportConsent) : [],
    growth_loop: {
      point_items: exportRows(growthLoop.pointItems),
      profile_point_items: exportRows(growthLoop.profilePointItems),
      rewards: exportRows(growthLoop.rewards),
      profile_rewards: exportRows(growthLoop.profileRewards),
      ledger: exportRows(growthLoop.ledger),
      redemptions: exportRows(growthLoop.redemptions),
    },
  };
}
