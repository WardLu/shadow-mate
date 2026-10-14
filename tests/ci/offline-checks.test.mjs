import test from "node:test";
import assert from "node:assert/strict";
import { offlineSteps, STEP_DEPENDENCIES, runOffline } from "../../scripts/ci/offline-checks.mjs";

test("offlineSteps generates all required steps for Shadow Mate", () => {
  const steps = offlineSteps(process.cwd());
  const names = steps.map((s) => s.name);
  assert.ok(names.includes("public-check"));
  assert.ok(names.includes("security-check"));
  assert.ok(names.includes("check"));
  assert.ok(names.includes("ci-tests"));
  assert.ok(names.includes("release-contracts"));
  assert.ok(names.includes("unit"));
  assert.ok(names.includes("build"));
  assert.ok(names.includes("check-build"));
  assert.ok(names.includes("seo-audit"));
  assert.ok(names.includes("release-metadata"));
});

test("STEP_DEPENDENCIES strictly requires build for check-build, seo-audit, release-metadata", () => {
  assert.deepEqual(STEP_DEPENDENCIES["check-build"], ["build"]);
  assert.deepEqual(STEP_DEPENDENCIES["seo-audit"], ["build"]);
  assert.deepEqual(STEP_DEPENDENCIES["release-metadata"], ["build"]);
});

test("runOffline succeeds when all mock steps succeed (serial & concurrent)", async () => {
  const mockExecute = async (executable, args) => ({ status: 0 });
  const serialResult = await runOffline({ execute: mockExecute, concurrent: false });
  assert.equal(serialResult.status, "offline_passed");
  assert.equal(serialResult.exitCode, 0);
  assert.equal(serialResult.passed.length, 10);

  const concurrentResult = await runOffline({ execute: mockExecute, concurrent: true });
  assert.equal(concurrentResult.status, "offline_passed");
  assert.equal(concurrentResult.exitCode, 0);
  assert.equal(concurrentResult.passed.length, 10);
});

test("runOffline aborts and skips downstream dependencies when build fails", async () => {
  const mockExecute = async (executable, args) => {
    if (args.includes("build")) return { status: 1 };
    return { status: 0 };
  };
  const result = await runOffline({ execute: mockExecute, concurrent: true });
  assert.equal(result.status, "failed");
  assert.equal(result.failed_step, "build");
  const checkBuildStep = result.steps.find((s) => s.name === "check-build");
  assert.equal(checkBuildStep.status, "unavailable");
});
