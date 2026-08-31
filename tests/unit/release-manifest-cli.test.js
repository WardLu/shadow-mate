import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const eventPath = resolve(root, "tests/release-manifest-cli-event.json");
const outputPath = resolve(root, "tests/release-manifest-cli-output.json");
const cliPath = resolve(root, "scripts/release-manifest.mjs");
const MERGE_SHA = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  rmSync(eventPath, { force: true });
  rmSync(outputPath, { force: true });
});

function runCli(eventName, payload) {
  writeFileSync(eventPath, JSON.stringify(payload), "utf8");
  return execFileSync(process.execPath, [cliPath], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "WardLu/shadow-mate",
      GITHUB_SHA: MERGE_SHA,
      RELEASE_MANIFEST_OUTPUT: "tests/release-manifest-cli-output.json",
    },
    encoding: "utf8",
  });
}

describe("release manifest CLI", () => {
  it("writes an accepted manifest without serializing the event payload", () => {
    const stdout = runCli("pull_request", {
      action: "closed",
      pull_request: {
        number: 42,
        merged: true,
        merge_commit_sha: MERGE_SHA,
        merged_at: "2026-08-24T04:00:00Z",
        base: { ref: "main" },
      },
    });

    expect(stdout).toContain("release-manifest: accepted");
    expect(existsSync(outputPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(manifest.status).toBe("accepted");
    expect(manifest).not.toHaveProperty("pull_request");
    expect(manifest).not.toHaveProperty("payload");
  });

  it("removes a stale output for a skipped event", () => {
    writeFileSync(outputPath, "stale manifest", "utf8");

    const stdout = runCli("github.ping", { zen: "fixture" });

    expect(stdout).toContain("release-manifest: skipped reason=unsupported_event");
    expect(existsSync(outputPath)).toBe(false);
  });
});
