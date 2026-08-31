import { describe, expect, it } from "vitest";
import {
  classifyReleaseEvent,
  createReleaseManifest,
  validateReleaseManifest,
} from "../../scripts/release-manifest-lib.mjs";

const MERGE_SHA = "0123456789abcdef0123456789abcdef01234567";

function mergedPullRequestEvent(overrides = {}) {
  return {
    action: "closed",
    pull_request: {
      number: 42,
      merged: true,
      merge_commit_sha: MERGE_SHA,
      merged_at: "2026-08-24T04:00:00Z",
      base: { ref: "main" },
      labels: [{ name: "release-ready" }],
      ...overrides,
    },
  };
}

describe("release admission", () => {
  it("skips github.ping without creating issues or tasks", () => {
    const result = classifyReleaseEvent({ eventName: "github.ping", payload: {} });

    expect(result).toEqual({
      status: "skipped",
      reason: "unsupported_event",
      createdResources: { issues: 0, tasks: 0 },
    });
  });

  it("skips a closed pull request that was not merged", () => {
    const result = classifyReleaseEvent({
      eventName: "pull_request",
      payload: mergedPullRequestEvent({ merged: false }),
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "pull_request_not_merged",
      createdResources: { issues: 0, tasks: 0 },
    });
  });

  it("accepts a merged pull request for control-plane review only", () => {
    const manifest = createReleaseManifest({
      eventName: "pull_request",
      payload: mergedPullRequestEvent(),
      repository: "WardLu/shadow-mate",
      packageVersion: "1.3.6",
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      status: "accepted",
      project: "shadow-mate",
      repository: "WardLu/shadow-mate",
      commitSha: MERGE_SHA,
      packageVersion: "1.3.6",
      pullRequestNumber: 42,
      handoff: {
        target: "shadow-portal",
        mode: "proposal-only",
        migrationDecision: "control-plane-review-required",
        productionAction: "not_started",
      },
      createdResources: { issues: 0, tasks: 0 },
    });
    expect(manifest.releaseId).toMatch(/^[a-f0-9]{64}$/);
    expect(validateReleaseManifest(manifest)).toEqual([]);
    expect(manifest).not.toHaveProperty("pull_request");
    expect(manifest).not.toHaveProperty("payload");
  });

  it("reuses the same release id and result for the same merge event", () => {
    const input = {
      eventName: "pull_request",
      payload: mergedPullRequestEvent(),
      repository: "WardLu/shadow-mate",
      packageVersion: "1.3.6",
    };

    expect(createReleaseManifest(input)).toEqual(createReleaseManifest(input));
  });

  it("rejects sensitive or raw-payload fields in a manifest", () => {
    const manifest = createReleaseManifest({
      eventName: "pull_request",
      payload: mergedPullRequestEvent(),
      repository: "WardLu/shadow-mate",
      packageVersion: "1.3.6",
    });
    const findings = validateReleaseManifest({
      ...manifest,
      webhook_token: "redacted",
    });

    expect(findings).toContain("webhook_token: forbidden sensitive field");
  });
});
