import { spawn } from "node:child_process";
import { readdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Ensure local npm cache is preserved in sandboxes/worktrees
process.env.npm_config_cache = process.env.npm_config_cache || path.join(os.homedir(), ".npm");

export function ciEnvironment(extra = {}) {
  return {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
    CI: "1",
    NODE_ENV: "test",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
    SECURITY_CHECK_HISTORY: "1",
    ...extra,
  };
}

function findTestFiles(root, dir, ext = ".test.mjs") {
  const fullDir = path.join(root, dir);
  try {
    return readdirSync(fullDir)
      .filter((file) => file.endsWith(ext))
      .sort()
      .map((file) => path.join(dir, file));
  } catch {
    return [];
  }
}

export function offlineSteps(root) {
  const node = (name, ...args) => ({ name, argv: [process.execPath, ...args] });
  const ciTests = findTestFiles(root, "tests/ci");
  const contractTests = findTestFiles(root, "tests/release/contracts");

  return [
    node("public-check", "scripts/public-check.mjs"),
    node("security-check", "scripts/security-check.mjs"),
    node("check", "scripts/check.mjs"),
    node("ci-tests", "--test", ...ciTests),
    node("release-contracts", "--test", ...contractTests),
    { name: "unit", argv: [process.execPath, "node_modules/vitest/vitest.mjs", "run", "tests/unit"] },
    { name: "build", argv: [process.execPath, "node_modules/vite/bin/vite.js", "build"] },
    node("check-build", "scripts/check-build.mjs"),
    node("seo-audit", "scripts/seo/audit-prerendered-html.mjs"),
    node("release-metadata", "scripts/release-check.mjs"),
  ];
}

export const STEP_DEPENDENCIES = {
  "check-build": ["build"],
  "seo-audit": ["build"],
  "release-metadata": ["build"],
};

export function executeStep(executable, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    let finished = false;
    let timeoutId;

    const kill = () => {
      if (!child?.pid) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (err) {
        if (err.code !== "ESRCH") child.kill("SIGKILL");
      }
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      kill();
      process.removeListener("SIGTERM", terminate);
      process.removeListener("SIGINT", interrupt);
      resolve(result);
    };

    const terminate = () => finish({ status: null, signal: "SIGTERM" });
    const interrupt = () => finish({ status: null, signal: "SIGINT" });

    try {
      child = spawn(executable, args, {
        cwd: options.cwd || process.cwd(),
        env: options.env || ciEnvironment(),
        shell: false,
        stdio: options.stdio || "inherit",
        detached: true,
      });

      process.on("SIGTERM", terminate);
      process.on("SIGINT", interrupt);

      child.once("error", (error) => finish({ status: null, error: { code: error.code } }));
      child.once("exit", (status, signal) => finish({ status, signal }));

      if (options.timeout) {
        timeoutId = setTimeout(() => finish({ status: null, error: { code: "ETIMEDOUT" } }), options.timeout);
      }
    } catch (error) {
      finish({ status: null, error: { code: error.code } });
    }
  });
}

async function executeConcurrentSteps({ steps, root, temporary, budget, started, execute, now }) {
  const stepResultsMap = new Map();
  const passedSet = new Set();
  const stepPromises = new Map();
  let firstFailure = null;
  let aborted = false;
  const stepNames = new Set(steps.map((s) => s.name));

  for (const step of steps) {
    const deps = (STEP_DEPENDENCIES[step.name] ?? []).filter((dep) => stepNames.has(dep));

    const promise = (async () => {
      for (const dep of deps) {
        const depPromise = stepPromises.get(dep);
        if (depPromise) {
          const depResult = await depPromise;
          if (depResult.status !== "passed" || aborted) {
            const skipped = { name: step.name, status: "unavailable", durationMs: 0 };
            stepResultsMap.set(step.name, skipped);
            return skipped;
          }
        }
      }

      if (aborted) {
        const skipped = { name: step.name, status: "unavailable", durationMs: 0 };
        stepResultsMap.set(step.name, skipped);
        return skipped;
      }

      const remaining = budget - (now() - started);
      if (remaining <= 0) {
        aborted = true;
        firstFailure = firstFailure || {
          status: "unavailable",
          failed_step: step.name,
          reason: "verification_timeout",
          exitCode: 2,
        };
        const timedOut = { name: step.name, status: "unavailable", durationMs: 0 };
        stepResultsMap.set(step.name, timedOut);
        return timedOut;
      }

      console.log(`[offline-ci] ${step.name}`);
      const env = ciEnvironment({ TMPDIR: temporary });
      if (["build", "seo-audit", "check-build"].includes(step.name)) env.NODE_ENV = "production";
      const stepStarted = now();

      const result = await execute(step.argv[0], step.argv.slice(1), {
        cwd: root,
        env,
        stdio: "inherit",
        timeout: Math.min(5 * 60 * 1000, remaining),
      });

      const durationMs = Math.max(0, Math.round(now() - stepStarted));
      const stepResult = { name: step.name, durationMs };

      if (result.error || result.signal || !Number.isInteger(result.status)) {
        aborted = true;
        firstFailure = firstFailure || {
          status: "unavailable",
          failed_step: step.name,
          reason: "execution_unavailable",
          exitCode: 2,
        };
        stepResult.status = "unavailable";
      } else if (result.status !== 0) {
        aborted = true;
        firstFailure = firstFailure || {
          status: "failed",
          failed_step: step.name,
          exitCode: result.status,
        };
        stepResult.status = "failed";
      } else {
        stepResult.status = "passed";
        passedSet.add(step.name);
      }

      stepResultsMap.set(step.name, stepResult);
      return stepResult;
    })();

    stepPromises.set(step.name, promise);
  }

  await Promise.all(steps.map((s) => stepPromises.get(s.name)));

  const stepResults = steps.map(
    (s) => stepResultsMap.get(s.name) ?? { name: s.name, status: "unavailable", durationMs: 0 }
  );
  const passed = steps.filter((s) => passedSet.has(s.name)).map((s) => s.name);

  if (firstFailure) {
    return { ...firstFailure, passed, steps: stepResults };
  }
  return { status: "offline_passed", passed, steps: stepResults, exitCode: 0 };
}

export async function runOffline({
  root = process.cwd(),
  execute = executeStep,
  now = () => performance.now(),
  concurrent = false,
} = {}) {
  const passed = [];
  const stepResults = [];
  let temporary;
  const started = now();
  const budget = 15 * 60 * 1000;
  const steps = offlineSteps(root);

  try {
    temporary = mkdtempSync(path.join(os.tmpdir(), "mate-offline-ci-"));

    if (concurrent) {
      return await executeConcurrentSteps({ steps, root, temporary, budget, started, execute, now });
    }

    for (const step of steps) {
      const remaining = budget - (now() - started);
      if (remaining <= 0) {
        return {
          status: "unavailable",
          failed_step: step.name,
          reason: "verification_timeout",
          passed,
          steps: stepResults,
          exitCode: 2,
        };
      }

      console.log(`[offline-ci] ${step.name}`);
      const env = ciEnvironment({ TMPDIR: temporary });
      if (["build", "seo-audit", "check-build"].includes(step.name)) env.NODE_ENV = "production";
      const stepStarted = now();

      const result = await execute(step.argv[0], step.argv.slice(1), {
        cwd: root,
        env,
        stdio: "inherit",
        timeout: Math.min(5 * 60 * 1000, remaining),
      });

      const durationMs = Math.max(0, Math.round(now() - stepStarted));
      const stepResult = { name: step.name, durationMs };

      if (result.error || result.signal || !Number.isInteger(result.status)) {
        stepResults.push({ ...stepResult, status: "unavailable" });
        return {
          status: "unavailable",
          failed_step: step.name,
          reason: "execution_unavailable",
          passed,
          steps: stepResults,
          exitCode: 2,
        };
      }
      if (result.status !== 0) {
        stepResults.push({ ...stepResult, status: "failed" });
        return {
          status: "failed",
          failed_step: step.name,
          passed,
          steps: stepResults,
          exitCode: result.status,
        };
      }

      stepResults.push({ ...stepResult, status: "passed" });
      passed.push(step.name);
    }

    return { status: "offline_passed", passed, steps: stepResults, exitCode: 0 };
  } catch (error) {
    return {
      status: "unavailable",
      reason: "verification_prerequisite_failed",
      error: error.message,
      passed,
      exitCode: 2,
    };
  } finally {
    if (temporary) {
      try {
        rmSync(temporary, { recursive: true, force: true });
      } catch {}
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const parallel = args.includes("--parallel");
  const result = await runOffline({ concurrent: parallel });
  const json = JSON.stringify(result, null, 2);
  console.log("\n--- Offline Checks Result ---");
  console.log(json);

  const outDir = process.env.RUNNER_TEMP;
  if (outDir) {
    try {
      writeFileSync(path.join(outDir, "ci-offline-result.json"), json, "utf8");
    } catch {}
  }

  process.exitCode = result.exitCode;
}
