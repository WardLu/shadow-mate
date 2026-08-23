import { describe, expect, it, vi } from "vitest";
import { createMemoryLearningDb } from "../../src/learning-local-db.js";
import { createOutboxSync } from "../../src/learning-growth-loop-sync.js";

describe("Growth Loop outbox sync", () => {
  it("submits events in sequence and removes only confirmed events", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", sequence: 1, type: "point_item_upsert" });
    await db.appendOutbox({ event_id: "event-2", scope_key: "h:p", sequence: 2, type: "point_record" });
    const seen = [];
    const sync = createOutboxSync({
      db,
      transport: { send: vi.fn(async (event) => { seen.push(event.event_id); return { status: "confirmed" }; }) },
      now: () => 1000,
      jitter: 0,
      random: () => 0,
    });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({ confirmed: 2, pending: 0 }));
    expect(seen).toEqual(["event-1", "event-2"]);
    await expect(db.listOutbox("h:p")).resolves.toEqual([]);
  });

  it("backs off a retryable failure and stops before sending later events", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_item_upsert" });
    await db.appendOutbox({ event_id: "event-2", scope_key: "h:p", type: "point_record" });
    const send = vi.fn(async () => ({ status: "retryable", error_code: "timeout" }));
    const onRetryable = vi.fn();
    const sync = createOutboxSync({
      db,
      transport: { send },
      now: () => 1000,
      retryBaseMs: 100,
      jitter: 0,
      random: () => 0,
      onRetryable,
    });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({ retryable: 1, pending: 2 }));
    expect(send).toHaveBeenCalledTimes(1);
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      status: "retryable",
      attempts: 1,
      next_attempt_at: 1100,
    }));
    expect(onRetryable).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: "event-1" }),
      expect.objectContaining({ status: "retryable", error_code: "timeout" }),
    );
  });

  it("stops at the queue head when another worker owns its lease", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", sequence: 1, type: "point_item_upsert" });
    await db.appendOutbox({ event_id: "event-2", scope_key: "h:p", sequence: 2, type: "point_record" });
    const claimOutbox = db.claimOutbox.bind(db);
    db.claimOutbox = async (eventId, options) => (
      eventId === "event-1" ? false : claimOutbox(eventId, options)
    );
    const send = vi.fn(async () => ({ status: "confirmed" }));
    const sync = createOutboxSync({ db, transport: { send }, now: () => 1000, jitter: 0, random: () => 0 });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({
      confirmed: 0,
      pending: 2,
      blocked: true,
    }));
    expect(send).not.toHaveBeenCalled();
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({ status: "pending" }));
    await expect(db.getOutbox("event-2")).resolves.toEqual(expect.objectContaining({ status: "pending" }));
  });

  it("does not send an event while one of its dependencies is unconfirmed", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", sequence: 1, type: "point_item_upsert", status: "conflict" });
    await db.appendOutbox({
      event_id: "event-2",
      scope_key: "h:p",
      sequence: 2,
      type: "point_record",
      depends_on: ["event-1"],
    });
    const send = vi.fn(async () => ({ status: "confirmed" }));
    const sync = createOutboxSync({ db, transport: { send }, now: () => 1000, jitter: 0, random: () => 0 });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({
      confirmed: 0,
      pending: 1,
      blocked: true,
    }));
    expect(send).not.toHaveBeenCalled();
    await expect(db.getOutbox("event-2")).resolves.toEqual(expect.objectContaining({
      status: "pending",
      depends_on: ["event-1"],
    }));
  });

  it("waits for next_attempt_at and retries the same batch, request, and payload", async () => {
    const db = createMemoryLearningDb();
    const payload = {
      profile_id: "profile-1",
      entries: [{ request_id: "entry-1", occurred_on: "2026-08-01", delta: 2 }],
    };
    await db.appendOutbox({
      event_id: "event-1",
      scope_key: "h:p",
      type: "legacy_points_import",
      request_id: "batch-1",
      payload,
    });
    let currentTime = 1000;
    const send = vi.fn()
      .mockResolvedValueOnce({ status: "retryable", error_code: "network_or_server_error" })
      .mockResolvedValueOnce({ status: "confirmed", data: [{ id: "ledger-1" }] });
    const sync = createOutboxSync({
      db,
      transport: { send },
      now: () => currentTime,
      retryBaseMs: 100,
      jitter: 0,
    });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({
      retryable: 1,
      next_attempt_at: 1100,
    }));
    currentTime = 1099;
    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({
      blocked: true,
      next_attempt_at: 1100,
    }));
    expect(send).toHaveBeenCalledTimes(1);

    currentTime = 1100;
    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({ confirmed: 1, pending: 0 }));
    expect(send).toHaveBeenCalledTimes(2);
    for (const [event] of send.mock.calls) {
      expect(event).toEqual(expect.objectContaining({
        event_id: "event-1",
        request_id: "batch-1",
        payload,
      }));
    }
  });

  it("records a conflict and does not silently delete the event", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    const sync = createOutboxSync({
      db,
      transport: { send: vi.fn(async () => ({ status: "conflict", error_code: "idempotency_conflict" })) },
      now: () => 1000,
      jitter: 0,
      random: () => 0,
    });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({ conflict: 1, blocked: true }));
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({ status: "conflict" }));
  });

  it("does not send the same event twice when two sync connections race", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    let sends = 0;
    const transport = {
      send: vi.fn(async () => {
        sends += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { status: "confirmed", data: { id: "remote-1" } };
      }),
    };
    const createSync = (workerId) => createOutboxSync({
      db,
      transport,
      workerId,
      now: () => 1000,
      leaseMs: 5000,
      jitter: 0,
      random: () => 0,
    });

    const [first, second] = await Promise.all([
      createSync("tab-a").syncScope("h:p"),
      createSync("tab-b").syncScope("h:p"),
    ]);

    expect(sends).toBe(1);
    expect(first.confirmed + second.confirmed).toBe(1);
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({ status: "confirmed" }));
  });

  it("does not send the same event twice when concurrent operations share one worker", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    let sends = 0;
    const transport = {
      send: vi.fn(async () => {
        sends += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { status: "confirmed", data: { id: "remote-1" } };
      }),
    };
    const createSync = () => createOutboxSync({
      db,
      transport,
      workerId: "same-worker",
      now: () => 1000,
      leaseMs: 5000,
      jitter: 0,
      random: () => 0,
    });

    const [first, second] = await Promise.all([
      createSync().syncScope("h:p"),
      createSync().syncScope("h:p"),
    ]);

    expect(sends).toBe(1);
    expect(first.confirmed + second.confirmed).toBe(1);
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({ status: "confirmed" }));
  });

  it("re-reads the current lease immediately before sending", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    await db.appendOutbox({ event_id: "event-2", scope_key: "h:p", type: "point_record" });
    const originalGetOutbox = db.getOutbox.bind(db);
    let replaced = false;
    db.getOutbox = async (eventId) => {
      const current = await originalGetOutbox(eventId);
      if (!replaced && current?.processing_by === "worker-a") {
        replaced = true;
        await db.updateOutbox(eventId, {
          processing_by: "worker-b",
          operation_id: "operation-b",
          lease_id: "lease-b",
          lease_until: 6000,
        });
      }
      return originalGetOutbox(eventId);
    };
    const send = vi.fn(async () => ({ status: "confirmed" }));
    const sync = createOutboxSync({
      db,
      transport: { send },
      workerId: "worker-a",
      now: () => 1000,
      leaseMs: 5000,
      jitter: 0,
      random: () => 0,
    });

    await expect(sync.syncScope("h:p")).resolves.toEqual(
      expect.objectContaining({ confirmed: 0, pending: 2, blocked: true }),
    );
    expect(send).not.toHaveBeenCalled();
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      processing_by: "worker-b",
      operation_id: "operation-b",
      lease_id: "lease-b",
    }));
    await expect(db.getOutbox("event-2")).resolves.toEqual(expect.objectContaining({ status: "pending" }));
  });

  it("blocks malformed dependency metadata instead of treating it as no dependency", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({
      event_id: "event-1",
      scope_key: "h:p",
      type: "point_record",
      depends_on: [""],
    });
    const send = vi.fn(async () => ({ status: "confirmed" }));
    const sync = createOutboxSync({ db, transport: { send }, now: () => 1000, jitter: 0, random: () => 0 });

    await expect(sync.syncScope("h:p")).resolves.toEqual(expect.objectContaining({
      confirmed: 0,
      pending: 1,
      blocked: true,
    }));
    expect(send).not.toHaveBeenCalled();
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      status: "pending",
      depends_on: [""],
    }));
  });

  it("does not send after the immutable operation becomes stale immediately after claim", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    let current = true;
    const claimOutbox = db.claimOutbox.bind(db);
    db.claimOutbox = async (...args) => {
      const claimed = await claimOutbox(...args);
      current = false;
      return claimed;
    };
    const send = vi.fn(async () => ({ status: "confirmed" }));
    const sync = createOutboxSync({
      db,
      transport: { send },
      workerId: "tab-a",
      now: () => 1000,
      jitter: 0,
      random: () => 0,
    });

    await expect(sync.syncScope("h:p", { canCommit: () => current })).resolves.toEqual(
      expect.objectContaining({ skipped: true, reason: "stale_profile_scope" }),
    );
    expect(send).not.toHaveBeenCalled();
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      status: "pending",
      processing_by: null,
      lease_until: 0,
      lease_id: null,
      operation_id: null,
    }));
  });
});
