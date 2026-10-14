import test from "node:test";
import assert from "node:assert/strict";
import { determineDisposition, buildDispositions, renderMarkdown } from "../../scripts/ci/verification-dispositions.mjs";

test("determineDisposition classifies success, failure, and scope_exempt correctly", () => {
  assert.equal(determineDisposition("install", "docs", "false", { outcome: "skipped" }).disposition, "scope_exempt");
  assert.equal(determineDisposition("install", "full", "false", { outcome: "success" }).disposition, "executed_pass");
  assert.equal(determineDisposition("install", "full", "false", { outcome: "failure" }).disposition, "failed");
  assert.equal(determineDisposition("desktop_e2e", "release", "true", { outcome: "skipped" }).disposition, "scope_exempt");
  assert.equal(determineDisposition("release_contracts", "full", "false", { outcome: "skipped" }).disposition, "scope_exempt");
  assert.equal(determineDisposition("unknown_step", "full", "false", undefined).disposition, "unknown");
});

test("buildDispositions and renderMarkdown produce valid markdown table", () => {
  const steps = {
    "checkout": { outcome: "success" },
    scope: { outcome: "success" },
    docs_verify: { outcome: "success" },
    install: { outcome: "skipped" },
    source: { outcome: "skipped" },
  };
  const summary = buildDispositions({ mode: "docs", releaseContracts: "false", steps });
  assert.equal(summary.mode, "docs");
  assert.ok(summary.checks.length > 0);

  const md = renderMarkdown(summary);
  assert.ok(md.includes("## CI Check Dispositions"));
  assert.ok(md.includes("`scope_exempt`"));
  assert.ok(md.includes("`executed_pass`"));
});
