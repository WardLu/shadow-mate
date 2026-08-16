import { describe, expect, it, vi } from "vitest";
import { createMemoryLearningDb } from "../../src/learning-local-db.js";
import { createGrowthLoopController } from "../../src/learning-growth-loop-controller.js";

describe("Growth Loop controller scope adoption", () => {
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

describe("Growth Loop controller reward fulfillment", () => {
  async function setupController({ onRewardFulfilled } = {}) {
    const db = createMemoryLearningDb();
    const controller = createGrowthLoopController({ db, onRewardFulfilled });
    await controller.loadScope({ household_id: "h-1", profile_id: "p-1" });
    await controller.recordPoint({
      item: { id: "item-1", name: "整理玩具", default_points: 10 },
      occurred_on: "2026-08-14",
      request_id: "point-1",
    });
    await controller.createReward({
      request_id: "reward-1",
      reward: { id: "reward-1", name: "周末去公园", cost_points: 5, category: "family", icon_key: "gift" },
    });
    await controller.redeemReward({ reward_id: "reward-1", request_id: "redeem-1" });
    return { db, controller };
  }

  async function confirmRedeem(controller) {
    const transport = {
      send: vi.fn(async (event) => event.type === "reward_redeem"
        ? { status: "confirmed", data: { id: "server-redemption-1", status: "pending", reward_id: "reward-1" } }
        : { status: "confirmed", data: { id: `server-${event.event_id}` } }),
    };
    await controller.sync({ transport });
  }

  it("enqueues a redemption_fulfill only for a confirmed pending redemption", async () => {
    const onRewardFulfilled = vi.fn();
    const { db, controller } = await setupController({ onRewardFulfilled });
    await confirmRedeem(controller);
    expect(onRewardFulfilled).not.toHaveBeenCalled();

    const row = controller.getSnapshot().redemptions.find((item) => item.id === "server-redemption-1");
    expect(row).toEqual(expect.objectContaining({ status: "pending", confirmed: true }));

    const result = await controller.fulfillRedemption({ redemption_id: "server-redemption-1" });
    expect(result.error).toBeUndefined();
    expect(controller.getSnapshot().redemptions.find((item) => item.id === "server-redemption-1").fulfill_requested).toBe(true);

    const pending = await controller.pendingOutbox();
    const fulfillEvent = pending.find((event) => event.type === "redemption_fulfill");
    expect(fulfillEvent).toEqual(expect.objectContaining({ payload: { redemption_id: "server-redemption-1" } }));

    // 已请求兑现后再次请求被拒绝，避免重复入队。
    const again = await controller.fulfillRedemption({ redemption_id: "server-redemption-1" });
    expect(again.error).toBe("redemption_not_pending");
  });

  it("fires onRewardFulfilled only once when the server confirms fulfillment", async () => {
    const onRewardFulfilled = vi.fn();
    const { db, controller } = await setupController({ onRewardFulfilled });
    await confirmRedeem(controller);
    await controller.fulfillRedemption({ redemption_id: "server-redemption-1" });

    const fulfillTransport = {
      send: vi.fn(async (event) => event.type === "redemption_fulfill"
        ? { status: "confirmed", data: { id: "server-redemption-1", status: "fulfilled", fulfilled_at: "2026-08-16T00:00:00Z" } }
        : { status: "confirmed", data: { id: `server-${event.event_id}` } }),
    };
    await controller.sync({ transport: fulfillTransport });

    expect(onRewardFulfilled).toHaveBeenCalledTimes(1);
    expect(onRewardFulfilled).toHaveBeenCalledWith(expect.objectContaining({
      redemption: expect.objectContaining({ id: "server-redemption-1", status: "fulfilled" }),
    }));
    expect(controller.getSnapshot().redemptions.find((item) => item.id === "server-redemption-1")).toEqual(
      expect.objectContaining({ status: "fulfilled" }),
    );

    // 重复的确认事件（幂等重放）不会再次触发。
    await db.appendOutbox({
      event_id: "duplicate-fulfill",
      request_id: "duplicate-1",
      scope_key: "h-1:p-1",
      household_id: "h-1",
      profile_id: "p-1",
      type: "redemption_fulfill",
      payload: { redemption_id: "server-redemption-1" },
    });
    await controller.sync({ transport: fulfillTransport });
    expect(onRewardFulfilled).toHaveBeenCalledTimes(1);
  });

  it("rejects fulfillment for an unknown redemption", async () => {
    const onRewardFulfilled = vi.fn();
    const { controller } = await setupController({ onRewardFulfilled });
    expect((await controller.fulfillRedemption({ redemption_id: "missing" })).error).toBe("redemption_not_found");
    expect(onRewardFulfilled).not.toHaveBeenCalled();
  });
});
