/**
 * Version guard: detects stale client builds and JS error storms.
 *
 * - Polls /index.html for changed <script type="module"> src attributes
 *   and auto-reloads when a new deploy is detected.
 * - Counts uncaught errors within a sliding window; if they exceed a
 *   threshold the page reloads once, preventing a broken old build from
 *   looping forever.
 * - A sessionStorage cooldown stops reload storms (e.g. the new build is
 *   also broken).
 */

const RELOAD_COOLDOWN_KEY = "shadow_mate_reload_cooldown";
const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000; // 1 min
const DEFAULT_MAX_ERRORS = 5;
const DEFAULT_ERROR_WINDOW_MS = 10_000;
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Extract all <script type="module" src="…"> paths from an HTML string.
 * @param {string} html
 * @returns {string[]}
 */
export function extractScriptSources(html) {
  if (!html) return [];
  const sources = [];
  const re = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    sources.push(match[1]);
  }
  return sources;
}

/**
 * Compare two arrays of script sources (order-independent).
 * @param {string[]} current
 * @param {string[]} fetched
 * @returns {boolean}
 */
export function scriptSourcesDiffer(current, fetched) {
  if (current.length !== fetched.length) return true;
  const set = new Set(current);
  for (const src of fetched) {
    if (!set.has(src)) return true;
  }
  return false;
}

/**
 * Sliding-window error counter.
 * @param {{maxErrors?: number, windowMs?: number, now?: () => number}} options
 */
export function createErrorTracker({ maxErrors = DEFAULT_MAX_ERRORS, windowMs = DEFAULT_ERROR_WINDOW_MS, now = Date.now } = {}) {
  let timestamps = [];
  return {
    record() {
      const t = now();
      timestamps.push(t);
      const cutoff = t - windowMs;
      timestamps = timestamps.filter((ts) => ts >= cutoff);
    },
    shouldReload() {
      const t = now();
      const cutoff = t - windowMs;
      timestamps = timestamps.filter((ts) => ts >= cutoff);
      return timestamps.length >= maxErrors;
    },
    reset() {
      timestamps = [];
    },
    get count() {
      const t = now();
      const cutoff = t - windowMs;
      return timestamps.filter((ts) => ts >= cutoff).length;
    },
  };
}

function recentlyReloaded() {
  const last = Number(sessionStorage.getItem(RELOAD_COOLDOWN_KEY) || 0);
  return Date.now() - last < RELOAD_COOLDOWN_MS;
}

function markReload() {
  sessionStorage.setItem(RELOAD_COOLDOWN_KEY, String(Date.now()));
}

/**
 * Force a reload to the newest build. Deletes service-worker caches first so
 * the stale index.html / assets can never pin an old client after a deploy.
 */
async function reloadToLatest() {
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache clearing is best-effort; still reload.
    }
  }
  markReload();
  window.location.reload();
}

/**
 * Start the version guard. Call once on page load.
 * @param {{checkIntervalMs?: number, maxErrors?: number, errorWindowMs?: number}} options
 */
export function startVersionGuard(options = {}) {
  const {
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    maxErrors = DEFAULT_MAX_ERRORS,
    errorWindowMs = DEFAULT_ERROR_WINDOW_MS,
  } = options;

  const tracker = createErrorTracker({ maxErrors, windowMs: errorWindowMs });
  const currentSources = extractScriptSources(document.documentElement.outerHTML);

  // --- Error self-healing ---
  const onError = () => {
    tracker.record();
    if (tracker.shouldReload() && !recentlyReloaded()) {
      markReload();
      window.location.reload();
    }
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);

  // --- Version check ---
  let timer = null;
  const checkVersion = async () => {
    try {
      const res = await fetch(`/?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const html = await res.text();
      const fetchedSources = extractScriptSources(html);
      if (fetchedSources.length && scriptSourcesDiffer(currentSources, fetchedSources)) {
        if (!recentlyReloaded()) {
          await reloadToLatest();
        }
      }
    } catch {
      // Network errors are expected when offline; stay silent.
    }
  };

  // Only poll when the tab is visible to avoid wasting battery.
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      checkVersion();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  timer = window.setInterval(checkVersion, checkIntervalMs);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onError);
    document.removeEventListener("visibilitychange", onVisibility);
    if (timer) window.clearInterval(timer);
  };
}
