import { describe, expect, it, vi } from "vitest";
import { createGrowthLoopTransport } from "../../src/learning-growth-cloud.js";

describe("Growth Loop Supabase transport", () => {
  it("maps a point event to the idempotent point RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: "ledger-1" }], error: null }));
    const transport = createGrowthLoopTransport({ client: { rpc } });

    await expect(transport.send({
      type: "point_record",
      request_id: "request-1",
      payload: {
        profile_id: "profile-1",
        point_item_id: "item-1",
        delta: 2,
        entry_type: "manual",
        note: null,
        occurred_on: "2026-08-14",
      },
    })).resolves.toEqual(expect.objectContaining({ status: "confirmed", data: { id: "ledger-1" } }));
    expect(rpc).toHaveBeenCalledWith("learning_record_points", expect.objectContaining({
      p_profile_id: "profile-1",
      p_point_item_id: "item-1",
      p_delta: 2,
      p_request_id: "request-1",
      p_occurred_on: "2026-08-14",
    }));
  });

  it("classifies network and idempotency errors without exposing a success state", async () => {
    const transport = createGrowthLoopTransport({
      client: { rpc: vi.fn(async () => ({ data: null, error: { status: 409, message: "idempotency_conflict" } })) },
    });
    await expect(transport.send({ type: "point_record", request_id: "request-1", payload: {} }))
      .resolves.toEqual(expect.objectContaining({ status: "conflict", error_code: "idempotency_conflict" }));
  });

  it("strips local-only metadata before writing public product tables", async () => {
    const upsert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: "item-1" }, error: null }) }),
    }));
    const transport = createGrowthLoopTransport({ client: { from: vi.fn(() => ({ upsert })) } });

    await transport.send({
      type: "point_item_upsert",
      payload: { point_item: {
        id: "item-1",
        household_id: "household-1",
        name: "整理玩具",
        description: "自定义成长任务",
        default_points: 2,
        item_kind: "custom",
        category: "growth",
        icon_key: "star",
        is_active: true,
        source: "local",
      } },
    });

    expect(upsert).toHaveBeenCalledWith(expect.not.objectContaining({ source: "local" }), { onConflict: "id" });
  });

  it("maps a legacy import event to the batch import RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: "row-1" }, { id: "row-2" }], error: null }));
    const transport = createGrowthLoopTransport({ client: { rpc } });

    await expect(transport.send({
      type: "legacy_points_import",
      request_id: "legacy-import-1",
      payload: {
        profile_id: "profile-1",
        entries: [
          { request_id: "entry-1", occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
          { request_id: "entry-2", occurred_on: "2026-08-02", delta: -10, item_name_snapshot: "撒谎", note: "旧积分记录" },
        ],
      },
    })).resolves.toEqual(expect.objectContaining({ status: "confirmed" }));
    expect(rpc).toHaveBeenCalledWith("learning_import_legacy_points", {
      p_profile_id: "profile-1",
      p_request_id: "legacy-import-1",
      p_entries: [
        { request_id: "entry-1", occurred_on: "2026-08-01", delta: 2, item_name_snapshot: "一起做家务", note: "旧积分记录" },
        { request_id: "entry-2", occurred_on: "2026-08-02", delta: -10, item_name_snapshot: "撒谎", note: "旧积分记录" },
      ],
    });
  });
});
