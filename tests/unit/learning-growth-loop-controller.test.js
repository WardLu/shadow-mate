import { describe, expect, it, vi } from "vitest";
import { createMemoryLearningDb } from "../../src/learning-local-db.js";
import { createGrowthLoopController } from "../../src/learning-growth-loop-controller.js";

describe("Growth Loop controller scope adoption", () => {
  it("does not hydrate or create a local snapshot while the global write guard is blocked", async () => {
    const db = createMemoryLearningDb();
    let writes = 0;
    const putSnapshot = db.putSnapshot.bind(db);
    db.putSnapshot = async (...args) => {
      writes += 1;
      return putSnapshot(...args);
    };
    const controller = createGrowthLoopController({ db, canWrite: () => false });

    await controller.hydrate();
    await controller.loadScope({ household_id: "household-1", profile_id: "profile-1" });

    expect(writes).toBe(0);
    expect(await db.getSnapshot("pending:pending")).toBeNull();
    expect(await db.getSnapshot("household-1:profile-1")).toBeNull();
  });

  it("does not move pending data when the database transaction becomes stale", async () => {
    const db = createMemoryLearningDb();
    const controller = createGrowthLoopController({ db });
    await controller.loadScope({ household_id: null, profile_id: null });
    await controller.recordPoint({
      item: { id: "item-1", name: "整理玩具", default_points: 2 },
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });

    const moveScope = db.moveScope.bind(db);
    let resolveStarted;
    let release;
    const started = new Promise((resolve) => { resolveStarted = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    db.moveScope = async (...args) => {
      resolveStarted();
      await blocked;
      return moveScope(...args);
    };

    let current = true;
    const switching = controller.loadScope(
      { household_id: "household-1", profile_id: "profile-1" },
      { adoptPending: true, canCommit: () => current },
    );
    await started;
    current = false;
    release();
    await switching;

    expect(await db.getSnapshot("pending:pending")).not.toBeNull();
    expect(await db.getSnapshot("household-1:profile-1")).toBeNull();
    expect(controller.getScope()).toEqual({ household_id: null, profile_id: null });
  });

  it("rolls back a pending move when the database guard turns stale mid-transaction", async () => {
    const db = createMemoryLearningDb();
    const controller = createGrowthLoopController({ db });
    await controller.loadScope({ household_id: null, profile_id: null });
    await controller.recordPoint({
      item: { id: "item-1", name: "整理玩具", default_points: 2 },
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });

    const moveScope = db.moveScope.bind(db);
    db.moveScope = async (fromScopeKey, toScopeKey, scope, options = {}) => {
      let guardChecks = 0;
      return moveScope(fromScopeKey, toScopeKey, scope, {
        ...options,
        canCommit: () => guardChecks++ !== 2 && options.canCommit?.() !== false,
      });
    };

    await controller.loadScope(
      { household_id: "household-1", profile_id: "profile-1" },
      { adoptPending: true },
    );

    expect(await db.getSnapshot("pending:pending")).not.toBeNull();
    expect(await db.getSnapshot("household-1:profile-1")).toBeNull();
    expect(controller.getScope()).toEqual({ household_id: null, profile_id: null });
  });

  it("does not commit a snapshot when its database write becomes stale", async () => {
    const db = createMemoryLearningDb();
    const controller = createGrowthLoopController({ db });
    await controller.loadScope({ household_id: null, profile_id: null });

    const putSnapshot = db.putSnapshot.bind(db);
    let resolveStarted;
    let release;
    const started = new Promise((resolve) => { resolveStarted = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    db.putSnapshot = async (...args) => {
      resolveStarted();
      await blocked;
      return putSnapshot(...args);
    };

    let current = true;
    const switching = controller.loadScope(
      { household_id: "household-1", profile_id: "profile-1" },
      { canCommit: () => current },
    );
    await started;
    current = false;
    release();
    await switching;

    expect(await db.getSnapshot("household-1:profile-1")).toBeNull();
    expect(controller.getScope()).toEqual({ household_id: null, profile_id: null });
  });

  it("does not persist activity after its atomic write guard becomes stale", async () => {
    const db = createMemoryLearningDb();
    let writable = true;
    const controller = createGrowthLoopController({ db, canWrite: () => writable });
    await controller.loadScope({ household_id: "household-1", profile_id: "profile-1" });

    db.persistActivity = async (event, outboxEvent, { canCommit } = {}) => {
      writable = false;
      if (!canCommit?.()) return false;
      await db.putActivityEvent(event);
      await db.appendOutbox(outboxEvent);
      return true;
    };

    await controller.queueActivity({
      event_type: "household_activated",
      event_id: "activity-1",
    });

    expect(await db.listActivityEvents("household-1:profile-1")).toEqual([]);
    expect(await db.listOutbox("household-1:profile-1", { statuses: ["pending"] })).toEqual([]);
  });

  it("does not persist a scope after its commit guard becomes stale", async () => {
    const db = createMemoryLearningDb();
    const controller = createGrowthLoopController({ db });
    let snapshotWrites = 0;
    const putSnapshot = db.putSnapshot.bind(db);
    db.putSnapshot = async (...args) => {
      snapshotWrites += 1;
      return putSnapshot(...args);
    };

    await controller.loadScope({ household_id: null, profile_id: null });
    snapshotWrites = 0;
    await controller.loadScope(
      { household_id: "household-1", profile_id: "profile-1" },
      { canCommit: () => false },
    );

    expect(snapshotWrites).toBe(0);
    expect(controller.getScope()).toEqual({ household_id: null, profile_id: null });
    expect(await db.getSnapshot("household-1:profile-1")).toBeNull();
  });

  it("does not send a claimed event after a newer scope replaces its operation guard", async () => {
    const db = createMemoryLearningDb();
    const controller = createGrowthLoopController({ db });
    const firstScope = { household_id: "household-1", profile_id: "profile-1" };
    const secondScope = { household_id: "household-1", profile_id: "profile-2" };
    await controller.loadScope(firstScope);
    await controller.recordPoint({
      item: { id: "item-1", name: "整理玩具", default_points: 2 },
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });

    const claimOutbox = db.claimOutbox.bind(db);
    db.claimOutbox = async (...args) => {
      const claimed = await claimOutbox(...args);
      await controller.loadScope(secondScope);
      return claimed;
    };
    const send = vi.fn(async () => ({ status: "confirmed" }));

    await expect(controller.sync({ transport: { send } })).resolves.toEqual(
      expect.objectContaining({ skipped: true, reason: "stale_profile_scope" }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(controller.getScope()).toEqual(secondScope);
    await expect(db.getOutbox("request-1")).resolves.toEqual(expect.objectContaining({
      status: "pending",
      processing_by: null,
      lease_id: null,
      operation_id: null,
    }));
  });

  it("rebinds pending local actions before the first cloud sync", async () => {
    const controller = createGrowthLoopController({ db: createMemoryLearningDb() });
    await controller.loadScope({ household_id: null, profile_id: null });
    await controller.recordPoint({
      item: { id: "item-1", name: "整理玩具", default_points: 2 },
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });

    await controller.loadScope(
      { household_id: "household-1", profile_id: "profile-1" },
      { adoptPending: true },
    );

    const pending = await controller.pendingOutbox();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((event) => event.scope_key === "household-1:profile-1")).toBe(true);
    expect(pending.find((event) => event.type === "point_record")?.payload.profile_id).toBe("profile-1");
    expect(controller.getSnapshot().scope).toEqual({ household_id: "household-1", profile_id: "profile-1" });
    expect(controller.getSnapshot().ledger).toEqual([
      expect.objectContaining({ household_id: "household-1", profile_id: "profile-1" }),
    ]);
  });
});

describe("Growth Loop controller legacy points import", () => {
  const scope = { household_id: "household-1", profile_id: "profile-1" };
  const entries = [
    { occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
    { occurred_on: "2026-08-02", delta: 3, item_name_snapshot: "认真完成学习", note: "旧积分记录" },
  ];

  it("imports the batch locally and queues one sync event", async () => {
    const controller = createGrowthLoopController({ db: createMemoryLearningDb() });
    await controller.loadScope(scope);

    const result = await controller.importLegacyPoints({ entries, request_id: "legacy-import-1" });

    expect(result.error).toBeUndefined();
    expect(result.ledger).toHaveLength(2);
    expect(controller.legacyPointsImportStatus()).toEqual(expect.objectContaining({ count: 2, total: 5, pending: true }));
    const pending = await controller.pendingOutbox();
    expect(pending.find((event) => event.type === "legacy_points_import")?.payload.entries).toHaveLength(2);
  });

  it("refuses a second import once one batch is already imported", async () => {
    const controller = createGrowthLoopController({ db: createMemoryLearningDb() });
    await controller.loadScope(scope);
    await controller.importLegacyPoints({ entries, request_id: "legacy-import-1" });

    const second = await controller.importLegacyPoints({ entries, request_id: "legacy-import-2" });
    expect(second.error).toBe("legacy_points_already_imported");
  });

  it("marks the imported rows confirmed when the cloud accepts the batch", async () => {
    const controller = createGrowthLoopController({ db: createMemoryLearningDb() });
    await controller.loadScope(scope);
    const result = await controller.importLegacyPoints({ entries, request_id: "legacy-import-1" });
    const outbox = await controller.pendingOutbox();
    const event = outbox.find((item) => item.type === "legacy_points_import");

    await controller.sync({
      transport: {
        send: async () => ({ status: "confirmed", data: { id: "row-1" } }),
      },
    });

    expect(controller.getSnapshot().ledger.every((entry) => entry.status === "confirmed")).toBe(true);
    expect(controller.legacyPointsImportStatus()).toEqual(expect.objectContaining({ count: 2, total: 5, pending: false }));
    expect(controller.getSnapshot().sync.last_sync_report).toEqual(
      expect.objectContaining({ confirmed: 1, pending: 0 }),
    );
    expect(result.error).toBeUndefined();
  });

  it("marks the imported rows rejected when the cloud rejects the batch", async () => {
    const controller = createGrowthLoopController({ db: createMemoryLearningDb() });
    await controller.loadScope(scope);
    await controller.importLegacyPoints({ entries, request_id: "legacy-import-1" });

    await controller.sync({
      transport: {
        send: async () => ({ status: "rejected", error_code: "learning_point_forbidden", error_message: "forbidden" }),
      },
    });

    const ledger = controller.getSnapshot().ledger;
    expect(ledger.every((entry) => entry.status === "rejected")).toBe(true);
    expect(controller.legacyPointsImportStatus()).toEqual(expect.objectContaining({
      status: "rejected",
      error_code: "learning_point_forbidden",
    }));
  });

  it("marks the imported rows retryable when cloud confirmation is temporarily unavailable", async () => {
    const controller = createGrowthLoopController({ db: createMemoryLearningDb() });
    await controller.loadScope(scope);
    await controller.importLegacyPoints({ entries, request_id: "legacy-import-1" });

    await controller.sync({
      transport: {
        send: async () => ({ status: "retryable", error_code: "network_or_server_error" }),
      },
    });

    expect(controller.getSnapshot().ledger.every((entry) => entry.status === "retryable")).toBe(true);
    expect(controller.legacyPointsImportStatus()).toEqual(expect.objectContaining({
      status: "retryable",
      error_code: "network_or_server_error",
    }));
  });
});
