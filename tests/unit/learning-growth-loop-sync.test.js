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
});
