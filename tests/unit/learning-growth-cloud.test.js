import { describe, expect, it, vi } from "vitest";
import { createGrowthLoopTransport, fetchGrowthLoopSnapshot } from "../../src/learning-growth-cloud.js";
import { createGrowthLoopState, getBalance, mergeGrowthLoopSnapshot } from "../../src/learning-growth-loop.js";

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

describe("Growth Loop Supabase snapshot", () => {
  it("restores a 1001-row cloud ledger on another device despite the Data API row cap", async () => {
    const ledgerRows = Array.from({ length: 1001 }, (_, index) => ({
      id: `ledger-${String(index + 1).padStart(4, "0")}`,
      profile_id: "profile-1",
      delta: 1,
      entry_type: "legacy_import",
      request_id: `request-${String(index + 1).padStart(4, "0")}`,
    }));
    const ledgerRequests = [];
    const client = {
      from(table) {
        const state = { cursor: null, limit: 1000, orders: [] };
        const query = {
          select: () => query,
          eq: () => query,
          order(field, options) {
            state.orders.push([field, options]);
            return query;
          },
          gt(field, value) {
            if (field === "id") state.cursor = value;
            return query;
          },
          limit(value) {
            state.limit = value;
            return query;
          },
          then(resolve, reject) {
            let data = [];
            if (table === "learning_point_ledger") {
              ledgerRequests.push(structuredClone(state));
              data = ledgerRows
                .filter((row) => state.cursor === null || row.id > state.cursor)
                .slice(0, state.limit);
            }
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    };

    const result = await fetchGrowthLoopSnapshot(client, {
      householdId: "household-1",
      profileId: "profile-1",
    });

    expect(result.errors).toEqual([]);
    expect(result.snapshot.ledger).toHaveLength(1001);
    expect(result.snapshot.ledger.every((row) => row.status === "confirmed")).toBe(true);
    const secondDevice = mergeGrowthLoopSnapshot(
      result.snapshot,
      createGrowthLoopState({ household_id: "household-1", profile_id: "profile-1" }),
    );
    expect(secondDevice.ledger).toHaveLength(1001);
    expect(getBalance(secondDevice)).toBe(1001);
    expect(ledgerRequests).toEqual([
      expect.objectContaining({ cursor: null, orders: [["id", { ascending: true }]] }),
      expect.objectContaining({ cursor: "ledger-1000", orders: [["id", { ascending: true }]] }),
    ]);
  });
});
