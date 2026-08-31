import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const eventPath = resolve(root, "tests/release-manifest-output-event.json");
const outputPath = resolve(root, "tests/release-manifest-output.json");
const githubOutputPath = resolve(root, "tests/release-manifest-github-output.txt");
const cliPath = resolve(root, "scripts/release-manifest.mjs");
const MERGE_SHA = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  rmSync(eventPath, { force: true });
  rmSync(outputPath, { force: true });
  rmSync(githubOutputPath, { force: true });
});

describe("release manifest GitHub output", () => {
  it("exports only the stable id and allowlisted manifest JSON", () => {
    writeFileSync(eventPath, JSON.stringify({
      action: "closed",
      pull_request: {
        number: 42,
        merged: true,
        merge_commit_sha: MERGE_SHA,
        merged_at: "2026-08-24T04:00:00Z",
        base: { ref: "main" },
      },
    }), "utf8");

    execFileSync(process.execPath, [cliPath], {
      cwd: root,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "WardLu/shadow-mate",
        GITHUB_SHA: MERGE_SHA,
        GITHUB_OUTPUT: githubOutputPath,
        RELEASE_MANIFEST_OUTPUT: "tests/release-manifest-output.json",
      },
      encoding: "utf8",
    });

    const output = readFileSync(githubOutputPath, "utf8");
    expect(output).toContain("release_id=");
    expect(output).toContain("manifest_json<<RELEASE_MANIFEST_");
    expect(output).not.toContain('"pull_request"');
    expect(output).not.toContain('"payload"');
    expect(existsSync(outputPath)).toBe(true);
  });
});
