import { describe, expect, it } from "vitest";
import { createMemoryLearningDb } from "../../src/learning-local-db.js";

describe("local Growth Loop database", () => {
  it("isolates snapshots by household and profile scope", async () => {
    const db = createMemoryLearningDb();
    await db.putSnapshot("household-1:profile-1", { scope: { profile_id: "profile-1" }, value: 1 });
    await db.putSnapshot("household-1:profile-2", { scope: { profile_id: "profile-2" }, value: 2 });

    await expect(db.getSnapshot("household-1:profile-1")).resolves.toEqual({ scope: { profile_id: "profile-1" }, value: 1 });
    await expect(db.getSnapshot("household-1:profile-2")).resolves.toEqual({ scope: { profile_id: "profile-2" }, value: 2 });
  });

  it("assigns a monotonic sequence per scope and preserves outbox order", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-2", scope_key: "h:p", type: "point_record" });
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_item_upsert" });
    await db.appendOutbox({ event_id: "other", scope_key: "h:other", type: "point_record" });

    await expect(db.listOutbox("h:p")).resolves.toEqual([
      expect.objectContaining({ event_id: "event-2", sequence: 1 }),
      expect.objectContaining({ event_id: "event-1", sequence: 2 }),
    ]);
    await expect(db.listOutbox("h:other")).resolves.toEqual([
      expect.objectContaining({ event_id: "other", sequence: 1 }),
    ]);
  });

  it("does not duplicate the same event when an app retries the local write", async () => {
    const db = createMemoryLearningDb();
    const event = { event_id: "event-1", scope_key: "h:p", type: "point_record" };
    const first = await db.appendOutbox(event);
    const second = await db.appendOutbox(event);

    expect(second).toEqual(first);
    await expect(db.listOutbox("h:p")).resolves.toHaveLength(1);
  });

  it("keeps rejected events available for export instead of deleting them", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });
    await db.updateOutbox("event-1", { status: "rejected", error_code: "scope_deleted" });

    await expect(db.listOutbox("h:p", { statuses: ["rejected"] })).resolves.toEqual([
      expect.objectContaining({ event_id: "event-1", status: "rejected", error_code: "scope_deleted" }),
    ]);
  });

  it("claims an event once when two connections try to sync the same scope", async () => {
    const db = createMemoryLearningDb();
    await db.appendOutbox({ event_id: "event-1", scope_key: "h:p", type: "point_record" });

    await expect(db.claimOutbox("event-1", { worker_id: "tab-a", now: 1000, lease_ms: 5000 }))
      .resolves.toBe(true);
    await expect(db.claimOutbox("event-1", { worker_id: "tab-b", now: 1000, lease_ms: 5000 }))
      .resolves.toBe(false);
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      processing_by: "tab-a",
      lease_until: 6000,
    }));
  });

  it("moves pending local records and outbox events into the authenticated scope", async () => {
    const db = createMemoryLearningDb();
    await db.putSnapshot("pending:pending", { scope: { household_id: null, profile_id: null }, value: 1 });
    await db.appendOutbox({
      event_id: "event-1",
      scope_key: "pending:pending",
      household_id: null,
      profile_id: null,
      type: "point_record",
      payload: { profile_id: null },
    });

    await db.moveScope("pending:pending", "household-1:profile-1", {
      household_id: "household-1",
      profile_id: "profile-1",
    });

    await expect(db.getSnapshot("pending:pending")).resolves.toBeNull();
    await expect(db.getOutbox("event-1")).resolves.toEqual(expect.objectContaining({
      scope_key: "household-1:profile-1",
      household_id: "household-1",
      profile_id: "profile-1",
      payload: { profile_id: "profile-1" },
    }));
  });
});
