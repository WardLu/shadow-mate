import { describe, expect, it, vi } from "vitest";
import { createUsageAnalytics } from "../../src/usage-analytics.js";
import { installErrorMonitoring, sanitizeErrorEvent } from "../../src/error-monitoring.js";
const origin = "https://sm.shadow.wang";
const dsn = ["https://00000000000000000000000000000000", "o0.ingest.us.sentry.io/999"].join("@");
const sensitiveEvent = () => ({
  event_id: "a".repeat(32), timestamp: 123,
  user: { email: "private@example.com" }, request: { data: "child record" },
  breadcrumbs: [{ message: "private" }], extra: { state: "private" }, contexts: { trace: { secret: "private" } },
  exception: { values: [{ type: "TypeError", value: "private@example.com child record", stacktrace: { frames: [
    { filename: `${origin}/assets/app-ABC.js?email=private`, lineno: 7, colno: 9, vars: { child: "private" }, function: "private" },
    { filename: "https://third-party.test/track.js", lineno: 1 },
  ] } }] },
});
describe("error monitoring privacy boundary", () => {
  it("preserves own code location and removes arbitrary error data", () => {
    const result = sanitizeErrorEvent(sensitiveEvent(), origin);
    expect(result.exception.values[0]).toEqual({ type: "TypeError", value: "Unhandled application error", stacktrace: { frames: [{ filename: `${origin}/assets/app-ABC.js`, in_app: true, lineno: 7, colno: 9 }] }, mechanism: { type: "generic", handled: false } });
    expect(JSON.stringify(result)).not.toMatch(/private|child|email|request|breadcrumbs|contexts|vars|function/);
  });
  it("drops extension errors, non-error events and unstructured rejections", () => {
    expect(sanitizeErrorEvent({ type: "transaction", ...sensitiveEvent() }, origin)).toBeNull();
    const event = sensitiveEvent(); event.exception.values[0].stacktrace.frames = [{ filename: "chrome-extension://secret/a.js" }];
    expect(sanitizeErrorEvent(event, origin)).toBeNull();
    expect(sanitizeErrorEvent({ exception: { values: [{ type: "Error", value: "private" }] } }, origin)).toBeNull();
  });
  it("checks opt-out at send time and disables default SDK integrations", () => {
    let enabled = true;
    const initialize = vi.fn();
    expect(installErrorMonitoring({ dsn, origin, isEnabled: () => enabled, initialize })).toBe(true);
    const options = initialize.mock.calls[0][0];
    expect(options.defaultIntegrations).toBe(false);
    expect(options.integrations.map(i => i.name)).toEqual(["GlobalHandlers"]);
    expect(options.dataCollection.userInfo).toBe(false);
    expect(options.dataCollection.httpBodies).toEqual([]);
    expect(options.sendClientReports).toBe(false);
    expect(options.beforeSend(sensitiveEvent())).not.toBeNull();
    enabled = false;
    expect(options.beforeSend(sensitiveEvent())).toBeNull();
    expect(options.beforeSendLog({})).toBeNull();
    expect(options.beforeSendMetric({})).toBeNull();
  });
  it("stops both transports when readable storage becomes unwritable", async () => {
    let writable = true;
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => {
      if (!writable) throw new DOMException("full", "QuotaExceededError");
      values.set(key, value);
    }, removeItem: key => values.delete(key) };
    const fetcher = vi.fn();
    const usage = createUsageAnalytics({ dsn, origin, storage, navigator: {}, fetcher });
    const initialize = vi.fn();
    installErrorMonitoring({ dsn, origin, isEnabled: () => usage.status().enabled, initialize });
    const options = initialize.mock.calls[0][0];
    expect(options.beforeSend(sensitiveEvent())).not.toBeNull();
    writable = false;
    expect(usage.status().enabled).toBe(false);
    expect(options.beforeSend(sensitiveEvent())).toBeNull();
    expect(await usage.record("open")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not initialize locally, with invalid DSN or broken SDK", () => {
    const initialize = vi.fn();
    expect(installErrorMonitoring({ dsn, origin: "http://localhost:3000", isEnabled: () => true, initialize })).toBe(false);
    expect(installErrorMonitoring({ dsn: "invalid", origin, isEnabled: () => true, initialize })).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(installErrorMonitoring({ dsn, origin, isEnabled: () => true, initialize: () => { throw new Error(); } })).toBe(false);
  });
});
