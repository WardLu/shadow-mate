const DEFAULT_RETRY_BASE_MS = 1000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

function createWorkerId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `growth-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function retryDelay(attempts, base, jitter, random = Math.random) {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, base * (2 ** Math.max(0, attempts - 1)));
  const spread = Math.max(0, Math.min(1, jitter));
  const multiplier = 1 - spread + (random() * spread * 2);
  return Math.round(exponential * multiplier);
}

export function createOutboxSync({
  db,
  transport,
  now = () => Date.now(),
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  jitter = 0.2,
  random = Math.random,
  workerId = createWorkerId(),
  leaseMs = 30_000,
  onConfirmed = async () => {},
  onRetryable = async () => {},
  onRejected = async () => {},
} = {}) {
  if (!db || !transport?.send) throw new Error("outbox_sync_dependencies_required");

  async function syncScope(scopeKey, options = {}) {
    const limit = options.limit || 100;
    const queuedEvents = await db.listOutbox(scopeKey, {
      statuses: ["pending", "retryable"],
      now: Number.MAX_SAFE_INTEGER,
      limit,
    });
    const currentTime = now();
    const events = [];
    let nextAttemptAt = null;
    for (const event of queuedEvents) {
      const eventAttemptAt = Number(event.next_attempt_at || 0);
      if (eventAttemptAt > currentTime) {
        // Preserve FIFO: a later pending event must not bypass the retryable
        // queue head while its backoff window is still active.
        nextAttemptAt = eventAttemptAt;
        break;
      }
      events.push(event);
    }
    const report = {
      confirmed: 0,
      duplicate: 0,
      retryable: 0,
      conflict: 0,
      rejected: 0,
      pending: queuedEvents.length,
      blocked: queuedEvents.length > 0 && events.length === 0,
      next_attempt_at: nextAttemptAt,
    };
    for (const event of events) {
      const claimed = await db.claimOutbox?.(event.event_id, {
        worker_id: workerId,
        now: now(),
        lease_ms: leaseMs,
      });
      if (db.claimOutbox && !claimed) continue;
      let result;
      try {
        result = await transport.send(event);
      } catch (error) {
        result = { status: "retryable", error_code: "network_error", error_message: error?.message || "network_error" };
      }
      const status = result?.status || "retryable";
      if (status === "confirmed" || status === "duplicate") {
        await db.updateOutbox(event.event_id, {
          status: "confirmed",
          confirmed_at: new Date(now()).toISOString(),
          error_code: null,
          error_message: null,
          response: result?.data || null,
          processing_by: null,
          lease_until: 0,
        });
        await onConfirmed(event, result);
        report[status] += 1;
        report.pending -= 1;
        continue;
      }
      if (status === "retryable") {
        const attempts = Number(event.attempts || 0) + 1;
        const retryAt = now() + retryDelay(attempts, retryBaseMs, jitter, random);
        await db.updateOutbox(event.event_id, {
          status: "retryable",
          attempts,
          next_attempt_at: retryAt,
          error_code: result?.error_code || "retryable_error",
          error_message: result?.error_message || null,
          processing_by: null,
          lease_until: 0,
        });
        await onRetryable(event, { ...result, status: "retryable" });
        report.retryable += 1;
        report.blocked = true;
        report.next_attempt_at = retryAt;
        break;
      }
      const terminalStatus = status === "conflict" ? "conflict" : "rejected";
      await db.updateOutbox(event.event_id, {
        status: terminalStatus,
        error_code: result?.error_code || `${terminalStatus}_error`,
        error_message: result?.error_message || null,
        processing_by: null,
        lease_until: 0,
      });
      await onRejected(event, { ...result, status: terminalStatus });
      report[terminalStatus] += 1;
      report.pending -= 1;
      report.blocked = true;
      break;
    }
    if (report.next_attempt_at !== null && report.pending > 0) report.blocked = true;
    return report;
  }

  return { syncScope };
}
