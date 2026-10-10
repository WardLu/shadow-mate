import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const coreSteps = [
  "checkout", "scope", "lockfile", "node", "install", "ci_scope_tests",
  "source", "release_metadata", "audit",
];
const integrationSteps = [
  "supabase_start", "supabase_config", "db_tests", "db_lint", "function_serve",
  "function_tests", "browsers", "desktop_e2e", "mobile_e2e",
];

export function validateGate({ mode, releaseContracts, steps }) {
  if (!steps || typeof steps !== "object") throw new Error("CI step results are unavailable");
  if (!(["docs", "release", "full"].includes(mode))
    || !(["true", "false"].includes(releaseContracts))
    || (mode === "docs" && releaseContracts !== "false")
    || (mode === "release" && releaseContracts !== "true")) {
    throw new Error("Invalid or missing CI scope");
  }

  const required = [
    ...coreSteps,
    ...(releaseContracts === "true" ? ["release_contracts"] : []),
    ...(mode === "full" ? integrationSteps : []),
  ];
  for (const id of required) {
    if (steps[id]?.outcome !== "success") {
      throw new Error(`Required CI step ${id} did not succeed: ${steps[id]?.outcome ?? "missing"}`);
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
