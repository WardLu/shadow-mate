const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const PRODUCTION_HOSTNAME = "sm.shadow.wang";
const PRODUCTION_SUPABASE_URL = "https://dutepjyocxcvecmsrtfp.supabase.co";
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_XmaIi9ud-k704g0aB9ZKcw_8KluvUWw";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function readEnvValue(env, name) {
  return typeof env?.[name] === "string" ? env[name].trim() : "";
}

function currentHostname() {
  return typeof globalThis.location?.hostname === "string"
    ? globalThis.location.hostname.trim().toLowerCase()
    : "";
}

function parseSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveCloudConfig({ env = {}, hostname = currentHostname() } = {}) {
  const normalizedHostname = String(hostname || "").trim().toLowerCase();
  const configuredUrl = readEnvValue(env, "VITE_SUPABASE_URL");
  const configuredKey = readEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
  const productionOrigin = normalizedHostname === PRODUCTION_HOSTNAME;
  const remoteOverride = readEnvValue(env, "VITE_SHADOW_ALLOW_PRODUCTION_SUPABASE") === "1";
  const requestedUrl = configuredUrl || (productionOrigin ? PRODUCTION_SUPABASE_URL : LOCAL_SUPABASE_URL);
  const parsedUrl = parseSupabaseUrl(requestedUrl);
  const isRemoteTarget = Boolean(parsedUrl && !LOOPBACK_HOSTNAMES.has(parsedUrl.hostname.toLowerCase()));
  const connectionBlocked = !parsedUrl || (isRemoteTarget && !productionOrigin && !remoteOverride);
  const supabaseUrl = connectionBlocked ? "" : requestedUrl;
  const supabasePublishableKey = connectionBlocked
    ? ""
    : configuredKey || (productionOrigin && requestedUrl === PRODUCTION_SUPABASE_URL
      ? PRODUCTION_SUPABASE_PUBLISHABLE_KEY
      : "");
  const authRedirectOrigin = !connectionBlocked
    && requestedUrl === PRODUCTION_SUPABASE_URL
    && (productionOrigin || remoteOverride)
    ? `https://${PRODUCTION_HOSTNAME}`
    : null;

  return Object.freeze({
    productId: "shadow-mate",
    supabaseUrl,
    supabasePublishableKey,
    authAccountDeletionEnabled: readEnvValue(env, "VITE_SUPABASE_AUTH_ACCOUNT_DELETION") === "1",
    authRedirectOrigin,
    connectionBlocked,
    connectionError: connectionBlocked
      ? (parsedUrl ? "remote_supabase_blocked" : "supabase_url_invalid")
      : null,
  });
}

const env = import.meta.env ?? {};

export const CLOUD_CONFIG = resolveCloudConfig({
  env,
  hostname: currentHostname(),
});
