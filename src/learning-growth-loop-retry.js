const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 15 * 60 * 1000;
const DEFAULT_RETRY_JITTER = 0.2;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function growthLoopRemoteRetryDelay(failures, {
  baseMs = DEFAULT_RETRY_BASE_MS,
  maxMs = DEFAULT_RETRY_MAX_MS,
  jitter = DEFAULT_RETRY_JITTER,
  random = Math.random,
} = {}) {
  const attempt = Math.max(1, Math.floor(Number(failures) || 1));
  const base = Math.max(0, Number(baseMs) || DEFAULT_RETRY_BASE_MS);
  const cap = Math.max(base, Number(maxMs) || DEFAULT_RETRY_MAX_MS);
  const exponential = Math.min(cap, base * (2 ** Math.min(52, attempt - 1)));
  const spread = Math.max(0, Math.min(1, Number(jitter) || 0));
  const randomValue = Math.max(0, Math.min(1, Number(random()) || 0));
  const multiplier = 1 - spread + (randomValue * spread * 2);
  return Math.min(cap, Math.max(0, Math.round(exponential * multiplier)));
}

export function createGrowthLoopRetryScheduler({
  now = () => Date.now(),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  onTimer = () => {},
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
  jitter = DEFAULT_RETRY_JITTER,
  random = Math.random,
} = {}) {
  let timer = null;
  let scheduledAt = null;
  let remoteFailures = 0;

  function clearScheduledTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    scheduledAt = null;
  }

  function scheduleAt(targetAt) {
    const currentTime = now();
    const normalizedTarget = Number(targetAt);
    const nextAt = Math.max(currentTime, Number.isFinite(normalizedTarget) ? normalizedTarget : currentTime);
    if (timer !== null && scheduledAt !== null && scheduledAt <= nextAt) return scheduledAt;

    clearScheduledTimer();
    scheduledAt = nextAt;
    timer = setTimer(() => {
      timer = null;
      scheduledAt = null;
      void onTimer();
    }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, nextAt - currentTime)));
    return nextAt;
  }

  function recordRemoteFailure() {
    remoteFailures += 1;
    const delay = growthLoopRemoteRetryDelay(remoteFailures, {
      baseMs: retryBaseMs,
      maxMs: retryMaxMs,
      jitter,
      random,
    });
    return scheduleAt(now() + delay);
  }

  function resetRemoteFailures({ clearTimer: shouldClearTimer = false } = {}) {
    remoteFailures = 0;
    if (shouldClearTimer) clearScheduledTimer();
  }

  return {
    scheduleAt,
    scheduleNow: () => scheduleAt(now()),
    recordRemoteFailure,
    resetRemoteFailures,
  };
}
