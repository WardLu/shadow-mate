import { describe, expect, it } from "vitest";
import {
  applyPointAction,
  applyRedemption,
  closePointPeriod,
  createGrowthLoopState,
  getActivePointAction,
  getBalance,
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
