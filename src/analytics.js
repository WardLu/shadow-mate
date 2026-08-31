import { track } from "@vercel/analytics";

export const ANALYTICS_EVENTS = Object.freeze({
  activation: "app_activated",
  firstCheckin: "first_checkin",
  threeDayStreak: "streak_3_days",
  syncFailed: "sync_failed",
  ttsFailed: "tts_failed",
});

const EVENT_FLAG_PREFIX = "shadow_mate_analytics_v1";
const ALLOWED_EVENTS = new Set(Object.values(ANALYTICS_EVENTS));

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch (_) {
    return null;
  }
}

export function recordAnalyticsEvent(eventName, {
  once = false,
  storage = getDefaultStorage(),
  tracker = track,
} = {}) {
  if (!ALLOWED_EVENTS.has(eventName)) return false;

  const flagKey = `${EVENT_FLAG_PREFIX}:${eventName}`;
  if (once && storage?.getItem(flagKey) === "1") return false;

  try {
    // Deliberately send no properties: event names are the complete payload.
    tracker(eventName);
  } catch (_) {
    return false;
  }

  if (once) {
    try {
      storage?.setItem(flagKey, "1");
    } catch (_) {
      // Analytics must never break the product when storage is unavailable.
    }
  }
  return true;
}

export function hasConsecutiveCheckinDays(checkins = {}, minimum = 3) {
  if (!Number.isInteger(minimum) || minimum < 1) return false;
  const timestamps = Object.entries(checkins)
    .filter(([, value]) => value && typeof value === "object" && Object.keys(value).length > 0)
    .map(([date]) => Date.parse(`${date}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  let streak = 0;
  let previous = null;
  for (const timestamp of timestamps) {
    streak = previous !== null && timestamp - previous === 86_400_000 ? streak + 1 : 1;
    if (streak >= minimum) return true;
    previous = timestamp;
  }
  return false;
}
