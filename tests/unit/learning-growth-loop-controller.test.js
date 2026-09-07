import { describe, expect, it, vi } from "vitest";
import { createMemoryLearningDb } from "../../src/learning-local-db.js";
import { createGrowthLoopController } from "../../src/learning-growth-loop-controller.js";
import { createGrowthLoopState } from "../../src/learning-growth-loop.js";

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

describe("Growth Loop redemption actions", () => {
  const scope = { household_id: "household-1", profile_id: "profile-1" };

  it("confirms a cancellation refund and a later fulfillment through ordered outbox actions", async () => {
    const db = createMemoryLearningDb();
    const state = createGrowthLoopState(scope);
    state.rewards = [{ id: "reward-1", name: "去公园", cost_points: 5, is_active: true }];
    state.profile_rewards = [{ profile_id: scope.profile_id, reward_id: "reward-1", enabled: true }];
    state.ledger = [{
      id: "ledger-1",
      request_id: "point-1",
      profile_id: scope.profile_id,
      delta: 10,
      entry_type: "manual",
      status: "confirmed",
    }];
    await db.putSnapshot("household-1:profile-1", state);
    const controller = createGrowthLoopController({ db });
    await controller.loadScope(scope);

    await controller.redeemReward({ reward_id: "reward-1", request_id: "redeem-1" });
    await controller.sync({
      transport: {
        send: async (event) => event.type === "reward_redeem"
          ? { status: "confirmed", data: { id: "remote-redemption-1", status: "pending" } }
          : { status: "confirmed" },
      },
    });

    await controller.cancelRedemption({
      redemption_id: "remote-redemption-1",
      request_id: "cancel-1",
      note: "临时改约",
    });
    expect(controller.getSnapshot().redemptions[0]).toEqual(expect.objectContaining({
      status: "pending",
      cancel_requested: true,
    }));
    expect(controller.getSnapshot().ledger.at(-1)).toEqual(expect.objectContaining({
      entry_type: "refund",
      status: "pending",
      delta: 5,
    }));

    await controller.sync({
      transport: {
        send: async (event) => event.type === "redemption_cancel"
          ? { status: "confirmed", data: { id: "remote-redemption-1", status: "cancelled" } }
          : { status: "confirmed" },
      },
    });
    expect(controller.getSnapshot().redemptions[0]).toEqual(expect.objectContaining({
      status: "cancelled",
      cancel_requested: false,
    }));
    expect(controller.getSnapshot().ledger.at(-1)).toEqual(expect.objectContaining({ status: "confirmed" }));

    await controller.redeemReward({ reward_id: "reward-1", request_id: "redeem-2" });
    await controller.sync({
      transport: {
        send: async (event) => event.type === "reward_redeem"
          ? { status: "confirmed", data: { id: "remote-redemption-2", status: "pending" } }
          : { status: "confirmed" },
      },
    });
    await controller.fulfillRedemption({ redemption_id: "remote-redemption-2", request_id: "fulfill-2" });
    await controller.sync({
      transport: {
        send: async (event) => event.type === "redemption_fulfill"
          ? { status: "confirmed", data: { id: "remote-redemption-2", status: "fulfilled" } }
          : { status: "confirmed" },
      },
    });

    expect(controller.getSnapshot().redemptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "remote-redemption-2", status: "fulfilled", fulfill_requested: false }),
    ]));
  });

  it("passes userInitiated flag to onRewardFulfilled only when initiated in session", async () => {
    const db = createMemoryLearningDb();
    const state = createGrowthLoopState(scope);
    state.rewards = [{ id: "reward-1", name: "去公园", cost_points: 5, is_active: true }];
    state.profile_rewards = [{ profile_id: scope.profile_id, reward_id: "reward-1", enabled: true }];
    state.redemptions = [{ id: "remote-redemption-1", status: "pending", confirmed: true, cost_points_snapshot: 5 }];
    await db.putSnapshot("household-1:profile-1", state);

    const fulfilledEvents = [];
    const controller = createGrowthLoopController({
      db,
      onRewardFulfilled: (payload) => fulfilledEvents.push(payload),
    });
    await controller.loadScope(scope);

    // 1. User initiated in current session
    await controller.fulfillRedemption({ redemption_id: "remote-redemption-1", request_id: "fulfill-user" });
    await controller.sync({
      transport: {
        send: async () => ({ status: "confirmed", data: { id: "remote-redemption-1", status: "fulfilled" } }),
      },
    });
    expect(fulfilledEvents).toHaveLength(1);
    expect(fulfilledEvents[0].userInitiated).toBe(true);
    expect(fulfilledEvents[0].redemption.id).toBe("remote-redemption-1");

    // 2. Background sync / hydration of an existing unfulfilled redemption that is fulfilled remotely
    const controller2 = createGrowthLoopController({
      db,
      onRewardFulfilled: (payload) => fulfilledEvents.push(payload),
    });
    const state2 = createGrowthLoopState(scope);
    state2.redemptions = [{ id: "remote-redemption-2", status: "pending", confirmed: true, cost_points_snapshot: 5 }];
    await db.putSnapshot("household-1:profile-1", state2);
    await controller2.loadScope(scope);

    // Remote sync confirms fulfillment without controller2 having called fulfillRedemption
    // We simulate remote reconciliation of an outbox event that came from another tab / sync
    await controller2.sync({
      transport: {
        send: async () => ({ status: "confirmed", data: { id: "remote-redemption-2", status: "fulfilled" } }),
      },
    });
    // No outbox event was in controller2, so no onRewardFulfilled was triggered
    expect(fulfilledEvents).toHaveLength(1);
  });

  it("resets fulfill_requested and sets sync_error on sync failure allowing retry", async () => {
    const db = createMemoryLearningDb();
    const state = createGrowthLoopState(scope);
    state.rewards = [{ id: "reward-1", name: "去公园", cost_points: 5, is_active: true }];
    state.profile_rewards = [{ profile_id: scope.profile_id, reward_id: "reward-1", enabled: true }];
    state.redemptions = [{ id: "remote-redemption-1", status: "pending", confirmed: true, cost_points_snapshot: 5 }];
    await db.putSnapshot("household-1:profile-1", state);

    const controller = createGrowthLoopController({ db });
    await controller.loadScope(scope);

    await controller.fulfillRedemption({ redemption_id: "remote-redemption-1", request_id: "fulfill-1" });
    expect(controller.getSnapshot().redemptions[0].fulfill_requested).toBe(true);

    // Sync fails with retryable status
    await controller.sync({
      transport: {
        send: async () => ({ status: "retryable", error_code: "network_timeout" }),
      },
    });

    // fulfill_requested should be reset to false and sync_error set so retry/cancel is unblocked
    const afterFail = controller.getSnapshot().redemptions[0];
    expect(afterFail.fulfill_requested).toBe(false);
    expect(afterFail.sync_error).toBe("network_timeout");

    // Retry should now succeed locally without error
    const retryResult = await controller.fulfillRedemption({ redemption_id: "remote-redemption-1", request_id: "fulfill-retry" });
    expect(retryResult.error).toBeUndefined();
    expect(controller.getSnapshot().redemptions[0].fulfill_requested).toBe(true);
    expect(controller.getSnapshot().redemptions[0].sync_error).toBeNull();
  });

  it("allows unauthenticated controller to fulfill and cancel rewards immediately with celebration sound", async () => {
    const db = createMemoryLearningDb();
    const fulfilledEvents = [];
    const controller = createGrowthLoopController({
      db,
      onRewardFulfilled: (payload) => fulfilledEvents.push(payload),
    });
    // Unauthenticated initial state (scope = { household_id: null, profile_id: null })
    await controller.createReward({
      request_id: "reward-req-1",
      reward: { id: "reward-1", name: "去公园", cost_points: 5, category: "family" },
    });
    await controller.recordPoint({
      item: { id: "item-1", name: "做家务", default_points: 10 },
      occurred_on: "2026-08-14",
      request_id: "point-1",
    });

    // Redeem reward locally
    const redeemResult = await controller.redeemReward({ reward_id: "reward-1", request_id: "redeem-1" });
    expect(redeemResult.error).toBeUndefined();
    expect(redeemResult.redemptions[0].status).toBe("pending");
    expect(redeemResult.redemptions[0].confirmed).toBe(true);

    // Fulfill reward locally: immediately transitions to fulfilled and triggers sound
    const fulfillResult = await controller.fulfillRedemption({ redemption_id: "redeem-1", request_id: "fulfill-1" });
    expect(fulfillResult.error).toBeUndefined();
    expect(fulfillResult.redemptions[0].status).toBe("fulfilled");
    expect(fulfilledEvents).toHaveLength(1);
    expect(fulfilledEvents[0].userInitiated).toBe(true);
    expect(fulfilledEvents[0].redemption.status).toBe("fulfilled");
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
