import { describe, expect, it } from "vitest";
import {
  applyLegacyPointsImport,
  applyCancelRedemption,
  applyFulfillRedemption,
  applyOpeningBalance,
  applyPointAction,
  applyRedemption,
  buildLegacyPointEntries,
  closePointPeriod,
  createGrowthLoopState,
  getActivePointAction,
  getBalance,
  getLegacyPointsImport,
  getOpeningBalance,
  getPointPeriodTotal,
  mergeGrowthLoopSnapshot,
  recommendedPointItems,
} from "../../src/learning-growth-loop.js";

const scope = { household_id: "household-1", profile_id: "profile-1" };

describe("Growth Loop local projection", () => {
  it("records a point action locally and creates an ordered sync event", () => {
    const item = { ...recommendedPointItems[0], id: "item-1" };
    const state = createGrowthLoopState(scope);
    const result = applyPointAction(state, {
      scope,
      item,
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });

    expect(result.snapshot.point_items).toHaveLength(1);
    expect(result.snapshot.profile_point_items).toEqual([
      expect.objectContaining({ profile_id: "profile-1", point_item_id: "item-1", enabled: true }),
    ]);
    expect(result.snapshot.ledger).toEqual([
      expect.objectContaining({ delta: 2, entry_type: "manual", status: "pending", occurred_on: "2026-08-14" }),
    ]);
    expect(result.events).toEqual([
      expect.objectContaining({ type: "point_item_upsert" }),
      expect.objectContaining({ type: "profile_point_item_upsert" }),
      expect.objectContaining({ type: "point_record", request_id: "request-1" }),
    ]);
    expect(getBalance(result.snapshot)).toBe(2);
    expect(getActivePointAction(result.snapshot, "item-1", "2026-08-14")).toBe(true);
  });

  it("uses an immutable reverse entry for a local undo", () => {
    const item = { ...recommendedPointItems[0], id: "item-1" };
    const first = applyPointAction(createGrowthLoopState(scope), {
      scope,
      item,
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });
    const second = applyPointAction(first.snapshot, {
      scope,
      item,
      occurred_on: "2026-08-14",
      request_id: "request-2",
    });

    expect(second.snapshot.ledger).toHaveLength(2);
    expect(second.snapshot.ledger[1]).toEqual(expect.objectContaining({ delta: -2, entry_type: "adjustment" }));
    expect(second.snapshot.ledger[1].metadata).toEqual(expect.objectContaining({ undo_of: "request-1" }));
    expect(getBalance(second.snapshot)).toBe(0);
    expect(getActivePointAction(second.snapshot, "item-1", "2026-08-14")).toBe(false);
  });

  it("keeps pending local actions when a cloud snapshot is merged", () => {
    const item = { ...recommendedPointItems[0], id: "item-1" };
    const local = applyPointAction(createGrowthLoopState(scope), {
      scope,
      item,
      occurred_on: "2026-08-14",
      request_id: "request-local",
    }).snapshot;
    const remote = createGrowthLoopState(scope);
    remote.point_items = [{ ...item, name: "云端名称" }];
    remote.ledger = [{
      id: "remote-ledger-1",
      request_id: "request-remote",
      profile_id: "profile-1",
      point_item_id: "item-1",
      delta: 3,
      status: "confirmed",
    }];

    const merged = mergeGrowthLoopSnapshot(remote, local);
    expect(merged.ledger.map((entry) => entry.request_id)).toEqual(["request-remote", "request-local"]);
    expect(merged.point_items[0].name).toBe("云端名称");
  });

  it("keeps a newly created local definition when the cloud already has other definitions", () => {
    const remote = createGrowthLoopState(scope);
    remote.point_items = [{ id: "remote-item", name: "云端项目", default_points: 2 }];
    const local = createGrowthLoopState(scope);
    local.point_items = [{ id: "local-item", name: "离线项目", default_points: 3 }];

    const merged = mergeGrowthLoopSnapshot(remote, local);
    expect(merged.point_items.map((item) => item.id)).toEqual(["local-item", "remote-item"]);
  });

  it("keeps an offline redemption pending and does not call it finally successful", () => {
    const state = createGrowthLoopState(scope);
    state.rewards = [{ id: "reward-1", name: "去公园", cost_points: 5, is_active: true }];
    state.profile_rewards = [{ profile_id: "profile-1", reward_id: "reward-1", enabled: true }];
    state.ledger = [{
      id: "ledger-1",
      request_id: "point-1",
      profile_id: "profile-1",
      delta: 8,
      entry_type: "manual",
      status: "confirmed",
    }];

    const result = applyRedemption(state, {
      scope,
      reward_id: "reward-1",
      request_id: "redeem-1",
    });

    expect(result.snapshot.redemptions[0]).toEqual(expect.objectContaining({ status: "pending", id: "redeem-1" }));
    expect(result.snapshot.ledger.at(-1)).toEqual(expect.objectContaining({ delta: -5, status: "pending", entry_type: "redemption" }));
    expect(getBalance(result.snapshot)).toBe(3);
    expect(result.events).toEqual([expect.objectContaining({ type: "reward_redeem", request_id: "redeem-1" })]);
  });

  it("queues fulfillment only after cloud confirmation", () => {
    const state = createGrowthLoopState(scope);
    state.redemptions = [{
      id: "redemption-1",
      request_id: "redeem-1",
      profile_id: scope.profile_id,
      reward_name_snapshot: "去公园",
      cost_points_snapshot: 5,
      status: "pending",
      confirmed: true,
    }];

    const result = applyFulfillRedemption(state, {
      scope,
      redemption_id: "redemption-1",
      request_id: "fulfill-1",
    });

    expect(result.error).toBeUndefined();
    expect(result.snapshot.redemptions[0]).toEqual(expect.objectContaining({
      status: "pending",
      confirmed: true,
      fulfill_requested: true,
      fulfill_request_id: "fulfill-1",
    }));
    expect(result.events).toEqual([expect.objectContaining({
      type: "redemption_fulfill",
      request_id: "fulfill-1",
      payload: { redemption_id: "redemption-1" },
    })]);
  });

  it("queues a pending refund without changing the redemption until cloud confirmation", () => {
    const state = createGrowthLoopState(scope);
    state.redemptions = [{
      id: "redemption-1",
      request_id: "redeem-1",
      profile_id: scope.profile_id,
      reward_name_snapshot: "去公园",
      cost_points_snapshot: 5,
      status: "pending",
      confirmed: true,
    }];
    state.ledger = [{
      id: "debit-1",
      request_id: "redeem-1:debit",
      profile_id: scope.profile_id,
      delta: -5,
      entry_type: "redemption",
      status: "confirmed",
      redemption_id: "redemption-1",
    }];

    const result = applyCancelRedemption(state, {
      scope,
      redemption_id: "redemption-1",
      request_id: "cancel-1",
      note: "孩子临时改约",
    });

    expect(result.error).toBeUndefined();
    expect(result.snapshot.redemptions[0]).toEqual(expect.objectContaining({
      status: "pending",
      cancel_requested: true,
      cancel_request_id: "cancel-1",
    }));
    expect(result.snapshot.ledger.at(-1)).toEqual(expect.objectContaining({
      delta: 5,
      entry_type: "refund",
      status: "pending",
      redemption_id: "redemption-1",
      request_id: "cancel-1:refund",
      note: "孩子临时改约",
    }));
    expect(result.events).toEqual([expect.objectContaining({
      type: "redemption_cancel",
      request_id: "cancel-1",
      payload: { redemption_id: "redemption-1", note: "孩子临时改约" },
    })]);
    expect(getBalance(result.snapshot)).toBe(0);
  });

  it("rejects fulfillment and cancellation before redemption confirmation", () => {
    const state = createGrowthLoopState(scope);
    state.redemptions = [{ id: "redemption-1", status: "pending", confirmed: false, cost_points_snapshot: 5 }];

    expect(applyFulfillRedemption(state, { scope, redemption_id: "redemption-1" }).error)
      .toBe("redemption_waiting_for_confirmation");
    expect(applyCancelRedemption(state, { scope, redemption_id: "redemption-1" }).error)
      .toBe("redemption_waiting_for_confirmation");
  });

  it("ends a point period with immutable adjustment entries while preserving history", () => {
    const item = { ...recommendedPointItems[0], id: "item-1" };
    const first = applyPointAction(createGrowthLoopState(scope), {
      scope,
      item,
      occurred_on: "2026-08-14",
      request_id: "request-1",
    });
    const closed = closePointPeriod(first.snapshot, {
      scope,
      period_key: "2026-08",
      request_id: "close-1",
    });

    expect(closed.snapshot.ledger).toHaveLength(2);
    expect(closed.snapshot.ledger.at(-1)).toEqual(expect.objectContaining({
      delta: -2,
      entry_type: "adjustment",
      status: "pending",
    }));
    expect(closed.snapshot.ledger.at(-1).metadata).toEqual(expect.objectContaining({
      period_close: "2026-08",
      undo_of: "request-1",
    }));
    expect(getPointPeriodTotal(closed.snapshot, "item-1", "2026-08")).toBe(0);
    expect(closed.snapshot.ledger[0]).toEqual(expect.objectContaining({ request_id: "request-1", delta: 2 }));
    expect(closed.events).toEqual([expect.objectContaining({ type: "point_record" })]);
  });
});

describe("Growth Loop opening balance", () => {
  it("confirms an opening balance once and counts it in the balance", () => {
    const state = createGrowthLoopState(scope);
    const result = applyOpeningBalance(state, {
      scope,
      balance: 128,
      note: "期初积分",
      request_id: "opening-1",
    });

    expect(result.error).toBeUndefined();
    expect(result.snapshot.ledger).toEqual([
      expect.objectContaining({
        delta: 128,
        entry_type: "initial_balance",
        item_name_snapshot: "期初积分",
        request_id: "opening-1",
        status: "pending",
      }),
    ]);
    expect(result.events).toEqual([
      expect.objectContaining({ type: "opening_balance_confirm", request_id: "opening-1" }),
    ]);
    expect(getOpeningBalance(result.snapshot)).toEqual(expect.objectContaining({ delta: 128, entry_type: "initial_balance" }));
    expect(getBalance(result.snapshot)).toBe(128);
  });

  it("rejects a second confirmation for the same child", () => {
    const first = applyOpeningBalance(createGrowthLoopState(scope), { scope, balance: 50, request_id: "opening-1" });
    const second = applyOpeningBalance(first.snapshot, { scope, balance: 200, request_id: "opening-2" });

    expect(second.error).toBe("opening_balance_already_confirmed");
    expect(second.entry).toEqual(expect.objectContaining({ delta: 50 }));
    expect(second.snapshot.ledger).toHaveLength(1);
  });

  it("rejects invalid opening balances", () => {
    for (const invalid of [0, -5, 1000001, "abc", undefined, null]) {
      const result = applyOpeningBalance(createGrowthLoopState(scope), { scope, balance: invalid });
      expect(result.error).toBe("opening_balance_invalid");
      expect(result.snapshot.ledger).toHaveLength(0);
      expect(result.events).toEqual([]);
    }
  });

  it("keeps opening balance out of effective-action metrics", () => {
    const result = applyOpeningBalance(createGrowthLoopState(scope), { scope, balance: 10, request_id: "opening-1" });
    expect(result.snapshot.ledger.map((entry) => entry.entry_type)).toEqual(["initial_balance"]);
  });
});

describe("Legacy points import", () => {
  it("rebuilds the old daily check-in records into ordered ledger entries", () => {
    const entries = buildLegacyPointEntries({
      "2026-7": { "0": { 5: 1, 6: 1 }, "3": { 7: 1 } },
      "2026-08": { "1": { 1: 1 }, "4": { 2: 1 } },
    });

    expect(entries).toEqual([
      { occurred_on: "2026-07-05", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
      { occurred_on: "2026-07-06", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
      { occurred_on: "2026-07-07", delta: 3, item_name_snapshot: "古诗词跟读", note: "旧积分记录" },
      { occurred_on: "2026-08-01", delta: 3, item_name_snapshot: "认真完成学习", note: "旧积分记录" },
      { occurred_on: "2026-08-02", delta: -10, item_name_snapshot: "撒谎", note: "旧积分记录" },
    ]);
  });

  it("skips unknown item indexes, non-existent dates, and duplicate records", () => {
    const entries = buildLegacyPointEntries({
      "2026-8": { "0": { 5: 1, 5: 1 }, "99": { 1: 1 } },
      "bad-month": { "0": { 1: 1 } },
      "2026-02": { "0": { 31: 1 } },
    });

    expect(entries).toEqual([
      { occurred_on: "2026-08-05", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
    ]);
  });

  it("returns an empty list for missing or empty records", () => {
    expect(buildLegacyPointEntries()).toEqual([]);
    expect(buildLegacyPointEntries({})).toEqual([]);
    expect(buildLegacyPointEntries(null)).toEqual([]);
  });

  it("imports a full daily batch into pending ledger entries and one sync event", () => {
    const result = applyLegacyPointsImport(createGrowthLoopState(scope), {
      scope,
      entries: [
        { occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
        { occurred_on: "2026-08-02", delta: 3, item_name_snapshot: "认真完成学习", note: "旧积分记录" },
        { occurred_on: "2026-08-03", delta: -10, item_name_snapshot: "撒谎", note: "旧积分记录" },
      ],
      request_id: "legacy-1",
    });

    expect(result.error).toBeUndefined();
    expect(result.snapshot.ledger).toHaveLength(3);
    expect(result.snapshot.ledger.every((entry) => entry.entry_type === "legacy_import")).toBe(true);
    expect(result.snapshot.ledger.every((entry) => entry.status === "pending")).toBe(true);
    expect(result.snapshot.ledger.map((entry) => entry.delta)).toEqual([2, 3, -10]);
    expect(getBalance(result.snapshot)).toBe(-5);
    expect(getLegacyPointsImport(result.snapshot)).toEqual(
      expect.objectContaining({ count: 3, total: -5, pending: true, status: "pending" }),
    );
    expect(result.events).toEqual([
      expect.objectContaining({
        type: "legacy_points_import",
        request_id: "legacy-1",
        payload: expect.objectContaining({
          profile_id: "profile-1",
          entries: result.snapshot.ledger.map((entry) => ({
            request_id: entry.request_id,
            occurred_on: entry.occurred_on,
            delta: entry.delta,
            item_name_snapshot: entry.item_name_snapshot,
            note: "旧积分记录",
          })),
        }),
      }),
    ]);
  });

  it("reports retryable and rejected legacy import attempts without calling them confirmed", () => {
    const retryable = createGrowthLoopState(scope);
    retryable.ledger = [{
      id: "legacy-retryable",
      request_id: "entry-retryable",
      profile_id: scope.profile_id,
      delta: 2,
      entry_type: "legacy_import",
      status: "retryable",
      sync_error: "network_or_server_error",
    }];
    expect(getLegacyPointsImport(retryable)).toEqual(expect.objectContaining({
      status: "retryable",
      pending: true,
      error_code: "network_or_server_error",
    }));

    const rejected = createGrowthLoopState(scope);
    rejected.ledger = [{
      id: "legacy-rejected",
      request_id: "entry-rejected",
      profile_id: scope.profile_id,
      delta: 2,
      entry_type: "legacy_import",
      status: "rejected",
      sync_error: "permission_denied",
    }];
    expect(getLegacyPointsImport(rejected)).toEqual(expect.objectContaining({
      status: "rejected",
      pending: false,
      error_code: "permission_denied",
    }));
  });

  it("keeps a confirmed cloud import authoritative over a later rejected local attempt", () => {
    const state = createGrowthLoopState(scope);
    state.ledger = [
      {
        id: "legacy-confirmed",
        request_id: "entry-confirmed",
        legacy_import_batch_id: "batch-confirmed",
        profile_id: scope.profile_id,
        delta: 5,
        entry_type: "legacy_import",
        status: "confirmed",
        created_at: "2026-08-19T10:00:00Z",
      },
      {
        id: "legacy-rejected",
        request_id: "entry-rejected",
        legacy_import_batch_id: "batch-rejected",
        profile_id: scope.profile_id,
        delta: 1000,
        entry_type: "legacy_import",
        status: "rejected",
        created_at: "2026-08-19T10:01:00Z",
      },
    ];

    expect(getLegacyPointsImport(state)).toEqual(expect.objectContaining({
      status: "confirmed",
      count: 1,
      total: 5,
    }));
  });

  it("rejects a second import for the same child", () => {
    const first = applyLegacyPointsImport(createGrowthLoopState(scope), {
      scope,
      entries: [{ occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务" }],
      request_id: "legacy-1",
    });
    const second = applyLegacyPointsImport(first.snapshot, {
      scope,
      entries: [{ occurred_on: "2026-08-02", delta: 3, item_name_snapshot: "认真完成学习" }],
      request_id: "legacy-2",
    });

    expect(second.error).toBe("legacy_points_already_imported");
    expect(second.snapshot.ledger).toHaveLength(1);
    expect(second.events).toEqual([]);
  });

  it("blocks legacy import when a manual opening balance is already confirmed", () => {
    const withOpening = applyOpeningBalance(createGrowthLoopState(scope), { scope, balance: 50, request_id: "opening-1" });
    const result = applyLegacyPointsImport(withOpening.snapshot, {
      scope,
      entries: [{ occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务" }],
      request_id: "legacy-1",
    });

    expect(result.error).toBe("legacy_points_already_imported");
  });

  it("blocks a local opening balance after legacy recovery was selected", () => {
    const imported = applyLegacyPointsImport(createGrowthLoopState(scope), {
      scope,
      entries: [{ occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务" }],
      request_id: "legacy-1",
    });

    const opening = applyOpeningBalance(imported.snapshot, {
      scope,
      balance: 50,
      request_id: "opening-1",
    });

    expect(opening.error).toBe("opening_balance_already_confirmed");
    expect(opening.snapshot.ledger).toHaveLength(1);
  });

  it("rejects the whole batch when any entry is malformed, matching the server", () => {
    const badDate = applyLegacyPointsImport(createGrowthLoopState(scope), {
      scope,
      entries: [
        { occurred_on: "2026-02-31", delta: 2, item_name_snapshot: "一起做家务" },
        { occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务" },
      ],
      request_id: "legacy-1",
    });
    expect(badDate.error).toBe("legacy_points_entries_invalid");
    expect(badDate.snapshot.ledger).toHaveLength(0);

    const badDelta = applyLegacyPointsImport(createGrowthLoopState(scope), {
      scope,
      entries: [{ occurred_on: "2026-08-01", delta: 2000, item_name_snapshot: "一起做家务" }],
      request_id: "legacy-2",
    });
    expect(badDelta.error).toBe("legacy_points_entries_invalid");

    const badName = applyLegacyPointsImport(createGrowthLoopState(scope), {
      scope,
      entries: [{ occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "" }],
      request_id: "legacy-3",
    });
    expect(badName.error).toBe("legacy_points_entries_invalid");
  });

  it("requires a non-empty batch", () => {
    const empty = applyLegacyPointsImport(createGrowthLoopState(scope), { scope, entries: [] });
    expect(empty.error).toBe("legacy_points_entries_required");

    const missing = applyLegacyPointsImport(createGrowthLoopState(scope), { scope });
    expect(missing.error).toBe("legacy_points_entries_required");
  });
});
