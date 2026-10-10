import { describe, expect, it, vi } from "vitest";
import { createUsageAnalytics, sentryUsageEndpoint } from "../../src/usage-analytics.js";

const TEST_DSN = ["https://00000000000000000000000000000000", "o0.ingest.us.sentry.io/999"].join("@");
function logItem(request) { return JSON.parse(request.body.trim().split("\n")[2]).items[0]; }

function setup(overrides = {}) {
  const values = new Map([["shadow_mate_usage_consent_v1", "1"]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const fetcher = vi.fn(async () => ({ ok: true }));
  const options = { origin: "https://sm.shadow.wang", dsn: TEST_DSN, storage, fetcher,
    navigator: {}, randomId: () => "00000000-0000-4000-8000-000000000001", getMode: () => "local", now: () => new Date("2026-10-10T04:00:00Z"), ...overrides };
  return { analytics: createUsageAnalytics(options), storage, fetcher, options };
}

describe("optional independent usage analytics", () => {
  it("requires production configuration and enables new browsers by default", async () => {
    for (const options of [{ origin: "http://localhost:5173" }, { dsn: "" }, { dsn: TEST_DSN.replace("0".repeat(32), "personalSecret") }, { dsn: TEST_DSN.replace("o0.ingest.us.sentry.io", "evil.test") }]) {
      const { analytics, fetcher } = setup(options);
      expect(await analytics.record("checkin")).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
    }
    const { analytics, storage, fetcher } = setup();
    storage.removeItem("shadow_mate_usage_consent_v1");
    expect(await analytics.record("open")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit earlier opt-out across reloads and rejects invalid preferences", async () => {
    const { storage, fetcher, options } = setup();
    for (const value of ["0", "invalid"]) {
      storage.setItem("shadow_mate_usage_consent_v1", value);
      const analytics = createUsageAnalytics(options);
      expect(await analytics.record("open")).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
    const analytics = createUsageAnalytics(options);
    expect(analytics.setConsent(true)).toBe(true);
    expect(await analytics.record("open")).toBe(true);
  });

  it("does not collect when browser storage is unavailable", async () => {
    const { analytics, fetcher } = setup({ storage: null });
    expect(await analytics.record("open")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks DNT and GPC before creating a browser identifier", async () => {
    for (const navigator of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
      const { analytics, fetcher, storage } = setup({ navigator });
      expect(await analytics.record("open")).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      expect(storage.getItem("shadow_mate_usage_v1")).toBeNull();
    }
  });

  it("sends only a fixed event and random browser identity, without account or content properties", async () => {
    const { analytics, fetcher } = setup();
    await analytics.record("checkin", { learner_name: "private", url: "private", delta: 99 });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://o0.ingest.us.sentry.io/api/999/envelope/?sentry_key=00000000000000000000000000000000&sentry_version=7");
    expect(request.credentials).toBe("omit");
    expect(request.referrerPolicy).toBe("no-referrer");
    const lines = request.body.trim().split("\n").map(line => JSON.parse(line));
    expect(lines[0].dsn).toBe(TEST_DSN);
    expect(lines[1]).toEqual({ type: "log", item_count: 1, content_type: "application/vnd.sentry.items.log+json" });
    expect(lines[2].ingest_settings).toEqual({ infer_ip: "never", infer_user_agent: "never" });
    expect(logItem(request)).toEqual({
      timestamp: new Date("2026-10-10T04:00:00Z").getTime() / 1000,
      trace_id: "00000000000040008000000000000001", level: "info", severity_number: 9, body: "sm_local_checkin",
      attributes: {
        "usage.browser_id": { type: "string", value: "sm_00000000-0000-4000-8000-000000000001" },
        "usage.event": { type: "string", value: "sm_local_checkin" },
        "usage.mode": { type: "string", value: "local" },
        "usage.day": { type: "string", value: "2026-10-10" },
        product: { type: "string", value: "shadow-mate" },
        "sentry.environment": { type: "string", value: "production" },
        "sentry.sdk.name": { type: "string", value: "shadow-mate.usage" },
        "sentry.sdk.version": { type: "string", value: "1.0.0" },
      },
    });
    expect(await analytics.record("learner_name")).toBe(false);
    expect(await analytics.record("view", { view: "private-profile-id" })).toBe(false);
  });

  it("deduplicates concurrent and repeated daily actions but records another day's use", async () => {
    let time = new Date("2026-10-10T04:00:00Z");
    const { analytics, fetcher } = setup({ now: () => time });
    await Promise.all([analytics.record("checkin"), analytics.record("checkin"), analytics.record("point_recorded")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await analytics.record("checkin")).toBe(false);
    expect(await analytics.record("point_recorded")).toBe(false);
    time = new Date("2026-10-11T04:00:00Z");
    expect(await analytics.record("checkin")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("coordinates concurrent tabs using the shared browser lock", async () => {
    let tail = Promise.resolve();
    const locks = { request: (_key, callback) => {
      const task = tail.then(callback);
      tail = task.catch(() => {});
      return task;
    } };
    let finish;
    const fetcher = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const { analytics, options } = setup({ navigator: { locks }, fetcher });
    const otherTab = createUsageAnalytics(options);
    const pending = [analytics.record("checkin"), otherTab.record("checkin")];
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    finish({ ok: true });
    expect(await Promise.all(pending)).toEqual([true, false]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("marks only successful core operations as active days, not rewards or page views", async () => {
    const { analytics, fetcher } = setup();
    await analytics.record("view", { view: "points", meaningful: true });
    await analytics.record("reward_redeemed", { meaningful: true });
    expect(fetcher.mock.calls.map(([, r]) => logItem(r).body)).not.toContain("sm_local_active_day");
    await analytics.record("checkin", { meaningful: true });
    expect(fetcher.mock.calls.map(([, r]) => logItem(r).body)).toContain("sm_local_active_day");
  });

  it("does not mark failed transport as delivered and never throws into learning", async () => {
    const { analytics, fetcher } = setup({ fetcher: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true }) });
    expect(await analytics.record("checkin")).toBe(false);
    expect(await analytics.record("checkin")).toBe(true);
    const broken = setup({ storage: { getItem() { throw new Error("blocked"); } } });
    expect(await broken.analytics.record("open")).toBe(false);
    expect(broken.analytics.setConsent(true)).toBe(false);
  });

  it("withdrawal removes local identity and prevents an in-flight response from restoring it", async () => {
    let resolve;
    const { analytics, storage } = setup({ fetcher: () => new Promise(r => { resolve = r; }) });
    const pending = analytics.record("checkin");
    expect(analytics.setConsent(false)).toBe(true);
    resolve({ ok: true });
    expect(await pending).toBe(false);
    expect(storage.getItem("shadow_mate_usage_v1")).toBeNull();
    expect(await analytics.record("open")).toBe(false);
  });

  it("stops reporting for the current session even if withdrawal cannot persist", async () => {
    const { analytics, storage, fetcher } = setup();
    storage.removeItem = () => { throw new Error("quota"); };
    expect(analytics.setConsent(false)).toBe(false);
    expect(analytics.status().enabled).toBe(false);
    expect(await analytics.record("checkin")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries a failed active-day category independently of an already delivered check-in", async () => {
    let dailyAttempts = 0;
    const fetcher = vi.fn(async (_url, request) => ({ ok: logItem(request).body !== "sm_local_active_day" || ++dailyAttempts > 1 }));
    const { analytics } = setup({ fetcher });
    await analytics.record("checkin", { meaningful: true });
    await analytics.record("checkin", { meaningful: true });
    expect(dailyAttempts).toBe(2);
    expect(fetcher.mock.calls.filter(([, r]) => logItem(r).body === "sm_local_checkin")).toHaveLength(1);
  });

  it("rotates the pseudonymous ID after 30 days and keeps auth modes distinct", async () => {
    let time = new Date("2026-10-10T04:00:00Z");
    let mode = "unknown";
    const randomId = vi.fn().mockReturnValueOnce("00000000-0000-4000-8000-000000000001").mockReturnValue("00000000-0000-4000-8000-000000000002");
    const { analytics, fetcher } = setup({ now: () => time, getMode: () => mode, randomId });
    await analytics.record("open");
    mode = "signed_in";
    await analytics.record("checkin");
    time = new Date("2026-11-10T04:00:00Z");
    await analytics.record("checkin");
    const events = fetcher.mock.calls.map(([, r]) => logItem(r));
    expect(events[0].body).toBe("sm_unknown_open");
    expect(events[1].body).toBe("sm_signed_in_checkin");
    expect(events[2].attributes["usage.browser_id"].value).not.toBe(events[1].attributes["usage.browser_id"].value);
  });
});


describe("Sentry transport limits", () => {
  it("rejects secret-bearing, non-Sentry, and malformed DSNs", () => {
    for (const dsn of [TEST_DSN.replace("https:", "http:"), TEST_DSN + "?x=1", TEST_DSN + "#x", TEST_DSN.replace("@", ":secret@"), TEST_DSN.replace("999", "999/other")]) {
      expect(sentryUsageEndpoint(dsn)).toBeNull();
    }
  });
  it("honors log quota signals even on HTTP 200 and permits a later retry", async () => {
    let time = new Date("2026-10-10T04:00:00Z");
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ "x-sentry-rate-limits": "60:log_item;log_byte:organization" }) }).mockResolvedValue({ ok: true, status: 200 });
    const { analytics } = setup({ fetcher, now: () => time });
    expect(await analytics.record("checkin")).toBe(false);
    expect(await analytics.record("checkin")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = new Date("2026-10-10T04:01:01Z");
    expect(await analytics.record("checkin")).toBe(true);
  });
});
