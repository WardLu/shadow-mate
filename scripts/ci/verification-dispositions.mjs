import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function determineDisposition(stepId, mode, releaseContracts, stepResult) {
  if (stepResult?.outcome === "success") {
    return { disposition: "executed_pass", evidence: "Step completed successfully" };
  }
  if (stepResult?.outcome === "failure") {
    return { disposition: "failed", evidence: "Step execution failed" };
  }
  if (stepResult?.outcome === "skipped") {
    if (mode === "docs") {
      return { disposition: "scope_exempt", evidence: "Exempt in docs-only mode" };
    }
    if (mode === "release" && [
      "supabase_start", "supabase_config", "db_tests", "db_lint",
      "function_serve", "function_tests", "browsers", "desktop_e2e", "mobile_e2e"
    ].includes(stepId)) {
      return { disposition: "scope_exempt", evidence: "Exempt in release-only mode" };
    }
    if (stepId === "release_contracts" && releaseContracts !== "true") {
      return { disposition: "scope_exempt", evidence: "Release contracts not affected" };
    }
    return { disposition: "skipped", evidence: "Step was skipped" };
  }
  return { disposition: "unknown", evidence: stepResult?.outcome || "Status unavailable" };
}

export function buildDispositions({ mode, releaseContracts, steps }) {
  const allChecks = [
    { id: "checkout", label: "Check out repository", category: "bootstrap" },
    { id: "lockfile", label: "Require lockfile", category: "bootstrap" },
    { id: "node", label: "Set up Node.js", category: "bootstrap" },
    { id: "scope", label: "Select CI scope", category: "bootstrap" },
    { id: "ci_scope_tests", label: "Test CI scope and required gate", category: "bootstrap" },
    { id: "docs_verify", label: "Lightweight docs security checks", category: "docs" },
    { id: "install", label: "Install locked dependencies", category: "code" },
    { id: "source", label: "Verify source and build", category: "code" },
    { id: "release_metadata", label: "Validate release metadata baseline", category: "code" },
    { id: "audit", label: "Audit dependencies", category: "code" },
    { id: "release_contracts", label: "Test release contracts", category: "release" },
    { id: "supabase_start", label: "Start local Supabase", category: "integration" },
    { id: "supabase_config", label: "Configure local Supabase for E2E", category: "integration" },
    { id: "db_tests", label: "Run database tests", category: "integration" },
    { id: "db_lint", label: "Lint database schema", category: "integration" },
    { id: "function_serve", label: "Serve account deletion function", category: "integration" },
    { id: "function_tests", label: "Test account deletion guard", category: "integration" },
    { id: "browsers", label: "Install Playwright browsers", category: "integration" },
    { id: "desktop_e2e", label: "Run desktop E2E tests", category: "integration" },
    { id: "mobile_e2e", label: "Run mobile E2E tests", category: "integration" },
  ];

  const results = allChecks.map((check) => {
    const stepResult = steps?.[check.id];
    const { disposition, evidence } = determineDisposition(check.id, mode, releaseContracts, stepResult);
    return {
      id: check.id,
      label: check.label,
      category: check.category,
      disposition,
      evidence,
    };
  });

  return {
    mode,
    releaseContracts,
    checks: results,
  };
}

export function renderMarkdown(summary) {
  const lines = [
    "## CI Check Dispositions (Explanation View)",
    "",
    `> **CI Mode**: \`${summary.mode}\` | **Release Contracts**: \`${summary.releaseContracts}\``,
    "",
    "| Check | Category | Disposition | Evidence |",
    "| :--- | :--- | :--- | :--- |",
  ];

  for (const c of summary.checks) {
    const badge = c.disposition === "executed_pass" ? "✅ `executed_pass`"
      : c.disposition === "scope_exempt" ? "⚪ `scope_exempt`"
      : c.disposition === "failed" ? "❌ `failed`"
      : `⚠️ \`${c.disposition}\``;
    lines.push(`| **${c.label}** (\`${c.id}\`) | \`${c.category}\` | ${badge} | ${c.evidence} |`);
  }

  lines.push("", "_Authority: explanation_only. This summary consumes workflow step outcomes and does not alter gating decisions._\n");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.env.CI_MODE || "unknown";
  const releaseContracts = process.env.RELEASE_CONTRACTS || "false";
  let steps = {};
  try {
    steps = JSON.parse(process.env.STEP_RESULTS || "{}");
  } catch {
    steps = {};
  }

  const summary = buildDispositions({ mode, releaseContracts, steps });
  const md = renderMarkdown(summary);
  console.log(md);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, md, "utf8");
    } catch (err) {
      console.warn("Could not write to GITHUB_STEP_SUMMARY:", err.message);
    }
  }
}
