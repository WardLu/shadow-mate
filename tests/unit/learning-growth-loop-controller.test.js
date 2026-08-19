import { describe, expect, it } from "vitest";
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
    expect(controller.legacyPointsImportStatus()).toBeNull();
  });
});
