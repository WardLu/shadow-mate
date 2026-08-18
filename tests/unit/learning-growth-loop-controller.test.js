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
