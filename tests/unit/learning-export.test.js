import { describe, expect, it } from "vitest";
import { buildHouseholdExport } from "../../src/learning-export.js";

describe("household export boundary", () => {
  it("exports stable household and learner history without auth, device, analytics, or server internals", () => {
    const payload = buildHouseholdExport({
      exportedAt: "2026-08-14T08:00:00.000Z",
      household: { id: "household-1", name: "测试家庭", internalAuditLog: "omit" },
      learners: [{
        id: "profile-1",
        household_id: "household-1",
        display_name: "小影",
        grade_level: 0,
        created_at: "2026-08-01T08:00:00.000Z",
        updated_at: "2026-08-14T08:00:00.000Z",
        state: {
          schema_version: 2,
          learning: { checkins: {} },
          activity_events: [{ event_type: "core_activation" }],
          beta_batches: [{ batch: "dogfood" }],
        },
        state_version: 4,
        state_updated_at: "2026-08-14T08:00:00.000Z",
        auth_email: "parent@example.com",
        session_key: "secret",
        sound_preferences: { volume: 0.6 },
        activity_events: [{ event_name: "core_activation" }],
        server_audit_log: [{ action: "read" }],
      }],
      consents: [{
        household_id: "household-1",
        consent_type: "learner_data_processing",
        policy_version: "privacy-v2",
        consented_at: "2026-08-01T08:00:00.000Z",
        created_at: "2026-08-01T08:00:00.000Z",
      }],
      growthLoop: {
        pointItems: [{ id: "item-1", profile_id: "profile-1", name: "整理玩具" }],
        profilePointItems: [{ profile_id: "profile-1", point_item_id: "item-1" }],
        rewards: [{ id: "reward-1", profile_id: "profile-1", name: "看绘本" }],
        profileRewards: [{ profile_id: "profile-1", reward_id: "reward-1" }],
        ledger: [{ id: "ledger-1", profile_id: "profile-1", delta: 2 }],
        redemptions: [{ id: "redemption-1", profile_id: "profile-1", status: "pending" }],
        activityEvents: [{ event_type: "core_activation" }],
        betaBatches: [{ household_id: "household-1", batch: "dogfood" }],
      },
      activityEvents: [{ event_type: "sync_failed" }],
      betaBatches: [{ household_id: "household-1", status: "active" }],
    });

    expect(payload).toMatchObject({
      export_schema_version: 1,
      product_id: "shadow-mate",
      exported_at: "2026-08-14T08:00:00.000Z",
      household: { id: "household-1", name: "测试家庭" },
      learners: [{
        id: "profile-1",
        household_id: "household-1",
        state_version: 4,
        state: { schema_version: 2 },
      }],
      consents: [{ consent_type: "learner_data_processing", policy_version: "privacy-v2", created_at: "2026-08-01T08:00:00.000Z" }],
      growth_loop: {
        point_items: [{ id: "item-1" }],
        profile_point_items: [{ profile_id: "profile-1" }],
        rewards: [{ id: "reward-1" }],
        profile_rewards: [{ profile_id: "profile-1" }],
        ledger: [{ id: "ledger-1" }],
        redemptions: [{ id: "redemption-1" }],
      },
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("parent@example.com");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("sound_preferences");
    expect(serialized).not.toContain("activity_events");
    expect(serialized).not.toContain("activityEvents");
    expect(serialized).not.toContain("beta_batches");
    expect(serialized).not.toContain("betaBatches");
    expect(serialized).not.toContain("server_audit_log");
    expect(serialized).not.toContain("internalAuditLog");
  });
});
