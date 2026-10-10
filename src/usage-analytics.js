import usageConfig from "../config/usage-analytics.json";

// Optional product analytics via Sentry's documented log envelope protocol.
// No SDK, autocapture, replay, or account identity.
export const usageDsn = `https://${usageConfig.publicKey}@${usageConfig.ingestHost}/${usageConfig.projectId}`;

const ID_KEY = "shadow_mate_usage_v1";
const STORAGE_PROBE_KEY = "shadow_mate_usage_storage_probe_v1";
const CONSENT_KEY = "shadow_mate_usage_consent_v1";
const MAX_AGE_MS = 30 * 86400000;
const MODES = new Set(["local", "signed_in", "unknown"]);
const ACTIONS = new Set(["open", "active_day", "checkin", "point_recorded", "reward_redeemed", "reward_fulfilled"]);
const VIEWS = new Set(["home", "learning", "chinese", "math", "english", "book", "points", "grow", "guide", "settings"]);

export function sentryUsageEndpoint(dsn) {
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" || !/^o\d+\.ingest\.(us|de)\.sentry\.io$/.test(url.hostname)
      || !/^[a-f0-9]{32}$/.test(url.username) || url.password || url.port || url.search || url.hash
      || !/^\/\d+$/.test(url.pathname)) return null;
    return `${url.origin}/api${url.pathname}/envelope/?sentry_key=${url.username}&sentry_version=7`;
  } catch { return null; }
}

function stringAttribute(value) { return { type: "string", value }; }

export function usageLogEnvelope({ dsn, event, browserId, time, day, mode, traceId, environment = "production" }) {
  const sdk = { name: "shadow-mate.usage", version: "1.0.0" };
  return [
    JSON.stringify({ dsn, sent_at: time.toISOString(), sdk }),
    JSON.stringify({ type: "log", item_count: 1, content_type: "application/vnd.sentry.items.log+json" }),
    JSON.stringify({
      version: 2, ingest_settings: { infer_ip: "never", infer_user_agent: "never" },
      items: [{
        timestamp: time.getTime() / 1000, trace_id: traceId, level: "info", severity_number: 9, body: event,
        attributes: {
          "usage.browser_id": stringAttribute(browserId),
          "usage.event": stringAttribute(event),
          "usage.mode": stringAttribute(mode),
          "usage.day": stringAttribute(day),
          "product": stringAttribute("shadow-mate"),
          "sentry.environment": stringAttribute(environment),
          "sentry.sdk.name": stringAttribute(sdk.name),
          "sentry.sdk.version": stringAttribute(sdk.version),
        },
      }],
    }),
  ].join("\n") + "\n";
}

function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function createUsageAnalytics({
  dsn = usageDsn,
  origin = globalThis.location?.origin,
  storage = safeStorage(),
  navigator = globalThis.navigator,
  fetcher = globalThis.fetch?.bind(globalThis),
  now = () => new Date(),
  randomId = () => globalThis.crypto.randomUUID(),
  getMode = () => "unknown",
} = {}) {
  const endpoint = sentryUsageEndpoint(dsn);
  const configured = origin === "https://sm.shadow.wang" && Boolean(endpoint);
  const inFlight = new Set();
  let retryAt = 0;
  let traceId;
  let generation = 0;
  let forcedDisabled = false;

  // Keep the existing preference key so an earlier explicit opt-out survives.
  function preferenceEnabled() {
    const value = storage?.getItem(CONSENT_KEY);
    return !forcedDisabled && (value === null || value === "1");
  }

  function storageUsable() {
    try {
      storage.setItem(STORAGE_PROBE_KEY, "1");
      const usable = storage.getItem(STORAGE_PROBE_KEY) === "1";
      storage.removeItem(STORAGE_PROBE_KEY);
      return usable;
    } catch { return false; }
  }

  function allowed() {
    try {
      return configured && typeof fetcher === "function" && preferenceEnabled()
        && navigator?.globalPrivacyControl !== true && navigator?.doNotTrack !== "1" && storageUsable();
    } catch { return false; }
  }

  function status() {
    let consent = false;
    try { consent = preferenceEnabled(); } catch { /* unavailable */ }
    return { configured, consent, enabled: allowed() };
  }

  function setConsent(enabled) {
    generation += 1;
    forcedDisabled = true;
    try {
      storage?.removeItem(ID_KEY);
      storage?.setItem(CONSENT_KEY, enabled ? "1" : "0");
      if (storage?.getItem(CONSENT_KEY) !== (enabled ? "1" : "0")) return false;
      forcedDisabled = !enabled;
      return true;
    } catch { return false; }
  }

  async function record(action, options = {}) {
    try {
      if (typeof navigator?.locks?.request === "function") {
        return await navigator.locks.request("shadow-mate-usage-v1", () => recordUnlocked(action, options));
      }
      return await recordUnlocked(action, options);
    } catch { return false; }
  }

  async function recordUnlocked(action, { view, meaningful = false } = {}) {
    try {
      if (!allowed()) return false;
      const mode = getMode();
      if (!MODES.has(mode) || !(ACTIONS.has(action) || action === "view" && VIEWS.has(view))) return false;
      // Each call comes after a saved core operation. Report the daily signal
      // independently, including when a prior category succeeded but its daily signal failed.
      if (meaningful && ["checkin", "point_recorded"].includes(action)) void record("active_day");
      const event = `sm_${mode}_${action === "view" ? `view_${view}` : action}`;
      const time = now();
      if (time.getTime() < retryAt) return false;
      const day = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, "0")}-${String(time.getDate()).padStart(2, "0")}`;
      let state;
      try { state = JSON.parse(storage.getItem(ID_KEY)); } catch { /* reset invalid flags */ }
      if (!state || !/^sm_[a-f0-9-]{36}$/.test(state.id) || !Number.isFinite(state.created_at)
        || time.getTime() - state.created_at >= MAX_AGE_MS || time.getTime() < state.created_at) {
        state = { id: `sm_${randomId()}`, created_at: time.getTime(), day, sent: [] };
      }
      if (state.day !== day || !Array.isArray(state.sent)) state = { ...state, day, sent: [] };
      const flightKey = `${state.id}:${day}:${event}`;
      if (state.sent.includes(event) || inFlight.has(flightKey)) return false;
      // Persist the random browser ID before starting concurrent requests.
      storage.setItem(ID_KEY, JSON.stringify(state));
      traceId ||= randomId().replaceAll("-", "");
      const startGeneration = generation;
      inFlight.add(flightKey);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      let response;
      try {
        response = await fetcher(endpoint, {
          method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "application/x-sentry-envelope" }, signal: controller.signal,
          body: usageLogEnvelope({ dsn, event, browserId: state.id, time, day, mode, traceId }),
        });
      } finally { clearTimeout(timer); inFlight.delete(flightKey); }
      const rateLimits = response?.headers?.get?.("x-sentry-rate-limits") || "";
      let limited = false;
      for (const quota of rateLimits.split(",")) {
        const [seconds, categories] = quota.trim().split(":");
        if (Number(seconds) > 0 && (categories === "" || categories?.split(";").some(category => ["log_item", "log_byte"].includes(category)))) {
          retryAt = Math.max(retryAt, time.getTime() + Number(seconds) * 1000);
          limited = true;
        }
      }
      if (response?.status === 429) {
        const retryAfter = response.headers?.get?.("retry-after");
        const duration = Number(retryAfter);
        retryAt = Math.max(retryAt, time.getTime() + (duration > 0 ? duration : 60) * 1000);
        return false;
      }
      if (limited) return false;
      if (!response?.ok || generation !== startGeneration || !allowed()) return false;
      // Read again so concurrent actions cannot overwrite each other's flags.
      const latest = JSON.parse(storage.getItem(ID_KEY));
      if (latest?.id !== state.id || latest.day !== day) return false;
      latest.sent = [...new Set([...(latest.sent || []), event])];
      storage.setItem(ID_KEY, JSON.stringify(latest));
      return true;
    } catch { return false; } // Measurement must never block local learning.
  }

  return { record, status, setConsent };
}
