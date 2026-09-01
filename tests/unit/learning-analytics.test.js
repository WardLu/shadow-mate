import { describe, expect, it } from "vitest";
import { ACTIVITY_EVENT_TYPES, activityEventIdFor, buildActivityEvent } from "../../src/learning-analytics.js";

describe("Growth Loop activity events", () => {
  it("builds an allowlisted event without child content or credentials", () => {
    const event = buildActivityEvent({
      event_type: ACTIVITY_EVENT_TYPES.CORE_ACTIVATION,
      household_id: "household-1",
      profile_id: "profile-1",
      occurred_at: "2026-08-14T10:00:00.000Z",
      client_version: "1.3.7",
      payload: {
        source: "point_item",
        child_name: "不应上传",
        email: "parent@example.com",
        error: "自由文本不应上传",
      },
    });

    expect(event).toEqual(expect.objectContaining({
      event_type: "core_activation",
      household_id: "household-1",
      profile_id: "profile-1",
      payload: { source: "point_item" },
    }));
    expect(JSON.stringify(event)).not.toContain("不应上传");
    expect(JSON.stringify(event)).not.toContain("parent@example.com");
  });

  it("rejects event types outside the product allowlist", () => {
    expect(() => buildActivityEvent({ event_type: "page_view", household_id: "h", profile_id: "p" }))
      .toThrow("activity_event_type_invalid");
  });

  it("creates a stable UUID for one scope and event bucket", () => {
    const first = activityEventIdFor({
      household_id: "household-1",
      profile_id: "profile-1",
      event_type: ACTIVITY_EVENT_TYPES.HOUSEHOLD_ACTIVATED,
      bucket: "once",
    });
    const second = activityEventIdFor({
      household_id: "household-1",
      profile_id: "profile-1",
      event_type: ACTIVITY_EVENT_TYPES.HOUSEHOLD_ACTIVATED,
      bucket: "once",
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
