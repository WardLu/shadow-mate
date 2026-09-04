import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildIntegrationReport,
  formatIntegrationReport,
  parseAheadBehind,
  strictExitCode,
} from "../../scripts/integration-check-lib.mjs";

describe("integration freshness report", () => {
  it("parses Git ahead/behind counts", () => {
    expect(parseAheadBehind("30\t67\n")).toEqual({ ahead: 30, behind: 67 });
    expect(() => parseAheadBehind("30")).toThrow("Invalid rev-list count");
    expect(() => parseAheadBehind("ahead behind")).toThrow("Invalid rev-list count");
  });

  it("reports a head that already contains the target base", () => {
    const report = buildIntegrationReport({
      head: "head-sha",
      base: "base-sha",
      mergeBase: "base-sha",
      ahead: 4,
      behind: 0,
      featurePaths: ["src/app.js", "docs/guide.md", "src/app.js"],
      basePaths: ["src/cloud.js"],
    });

    expect(report).toMatchObject({
      status: "up_to_date",
      needsIntegration: false,
      ahead: 4,
      behind: 0,
      overlapPaths: [],
      reasonCodes: [],
    });
    expect(report.featurePaths).toEqual(["docs/guide.md", "src/app.js"]);
    expect(strictExitCode(report, { strict: true })).toBe(0);
  });

  it("reports stale overlapping paths as integration-required", () => {
    const report = buildIntegrationReport({
      head: "head-sha",
      base: "origin/main",
      mergeBase: "common-sha",
      ahead: 30,
      behind: 67,
      featurePaths: ["src/app.js", "src/app.css", "docs/feature.md"],
      basePaths: ["src/app.css", "src/app.js", "README.md"],
    });

    expect(report).toMatchObject({
      status: "integration_required",
      needsIntegration: true,
      overlapPaths: ["src/app.css", "src/app.js"],
      reasonCodes: ["BASE_AHEAD_OF_HEAD", "OVERLAPPING_PATHS"],
    });
    expect(formatIntegrationReport(report)).toContain("integrate the target base");
    expect(strictExitCode(report, { strict: false })).toBe(0);
    expect(strictExitCode(report, { strict: true })).toBe(1);
  });

  it("distinguishes a stale branch without overlapping paths", () => {
    const report = buildIntegrationReport({
      head: "head-sha",
      base: "origin/main",
      mergeBase: "common-sha",
      ahead: 2,
      behind: 1,
      featurePaths: ["src/content/new-pack.json"],
      basePaths: ["docs/release.md"],
    });

    expect(report.status).toBe("integration_required");
    expect(report.overlapPaths).toEqual([]);
    expect(report.reasonCodes).toEqual(["BASE_AHEAD_OF_HEAD"]);
  });

  it("reports a missing base without trying to mutate refs", () => {
    const report = buildIntegrationReport({
      head: "head-sha",
      base: "origin/main",
      baseResolved: false,
    });

    expect(report).toMatchObject({
      status: "base_missing",
      needsIntegration: true,
      reasonCodes: ["BASE_REF_MISSING"],
      mergeBase: null,
    });
    expect(strictExitCode(report, { strict: true })).toBe(2);
  });

  it("runs the CLI against HEAD as a deterministic read-only smoke check", () => {
    const output = execFileSync(process.execPath, ["scripts/check-integration.mjs", "--base", "HEAD", "--json"], {
      encoding: "utf8",
    });
    const report = JSON.parse(output);
    expect(report.baseResolved).toBe(true);
    expect(report.mergeBase).toBe(report.head);
    expect(report.needsIntegration).toBe(false);
  });

  it("wires the local command and PR freshness workflow", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const workflow = await readFile(".github/workflows/integration-freshness.yml", "utf8");

    expect(packageJson.scripts["check:integration"]).toBe("node scripts/check-integration.mjs");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("github.event.pull_request.head.sha");
    expect(workflow).toContain("github.event.pull_request.base.sha");
    expect(workflow).toContain("--strict");
  });
});
