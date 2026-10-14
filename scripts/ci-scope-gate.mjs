import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BOOTSTRAP_STEPS = ["checkout", "scope", "lockfile", "node", "ci_scope_tests"];
export const DOCS_STEPS = ["docs_verify"];
export const CODE_STEPS = ["install", "source", "release_metadata", "audit"];
export const INTEGRATION_STEPS = [
  "supabase_start", "supabase_config", "db_tests", "db_lint",
  "function_serve", "function_tests", "browsers", "desktop_e2e", "mobile_e2e",
];

export function validateGate({ mode, releaseContracts, steps }) {
  if (!steps || typeof steps !== "object") throw new Error("CI step results are unavailable");
  if (!["docs", "release", "full"].includes(mode) || !["true", "false"].includes(releaseContracts)) {
    throw new Error("Invalid or missing CI scope");
  }

  const required = [...BOOTSTRAP_STEPS];
  const forbidden = [];

  if (mode === "docs") {
    if (releaseContracts !== "false") throw new Error("Invalid or missing CI scope");
    required.push(...DOCS_STEPS);
    forbidden.push(...CODE_STEPS, ...INTEGRATION_STEPS, "release_contracts");
  } else if (mode === "release") {
    if (releaseContracts !== "true") throw new Error("Invalid or missing CI scope");
    required.push(...CODE_STEPS, "release_contracts");
    forbidden.push(...DOCS_STEPS, ...INTEGRATION_STEPS);
  } else if (mode === "full") {
    required.push(...CODE_STEPS, ...INTEGRATION_STEPS);
    if (releaseContracts === "true") {
      required.push("release_contracts");
    } else {
      forbidden.push("release_contracts");
    }
    forbidden.push(...DOCS_STEPS);
  }

  for (const id of required) {
    if (steps[id]?.outcome !== "success") {
      throw new Error(`Required CI step ${id} did not succeed: ${steps[id]?.outcome ?? "missing"}`);
    }
  }

  for (const id of forbidden) {
    if (steps[id] && steps[id].outcome !== "skipped") {
      throw new Error(`Forbidden CI step ${id} unexpectedly ran: ${steps[id].outcome}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateGate({
    mode: process.env.CI_MODE,
    releaseContracts: process.env.RELEASE_CONTRACTS,
    steps: JSON.parse(process.env.STEP_RESULTS || "null"),
  });
  console.log(`CI gate passed for ${process.env.CI_MODE} route.`);
}
