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
  onRejected = async () => {},
} = {}) {
  if (!db || !transport?.send) throw new Error("outbox_sync_dependencies_required");

  async function syncScope(scopeKey, options = {}) {
    const limit = options.limit || 100;
    const events = await db.listOutbox(scopeKey, {
      statuses: ["pending", "retryable"],
      now: now(),
      limit,
    });
    const report = { confirmed: 0, duplicate: 0, retryable: 0, conflict: 0, rejected: 0, pending: events.length, blocked: false };
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
        await db.updateOutbox(event.event_id, {
          status: "retryable",
          attempts,
          next_attempt_at: now() + retryDelay(attempts, retryBaseMs, jitter, random),
          error_code: result?.error_code || "retryable_error",
          error_message: result?.error_message || null,
          processing_by: null,
          lease_until: 0,
        });
        report.retryable += 1;
        report.blocked = true;
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
    return report;
  }

  return { syncScope };
}
