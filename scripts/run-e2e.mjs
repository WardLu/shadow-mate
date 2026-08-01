import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = 5173;
const viteEntry = resolve("node_modules/vite/bin/vite.js");
const playwrightEntry = resolve("node_modules/@playwright/test/cli.js");

function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const poll = async () => {
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      try {
        await fetch(url);
        resolvePromise();
      } catch {
        setTimeout(poll, 200);
      }
    };
    poll();
  });
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    child.kill();
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5000,
    });
  } else {
    child.kill("SIGTERM");
  }
}

const vite = spawn(process.execPath, [viteEntry, "--host", host], {
  stdio: "inherit",
  env: { ...process.env, FORCE_COLOR: "1" },
});

let exitCode = 1;
try {
  await waitForServer(`http://${host}:${port}`);
  const playwright = spawnSync(process.execPath, [playwrightEntry, "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, E2E_EXTERNAL_SERVER: "1" },
  });
  exitCode = playwright.status ?? 1;
} finally {
  stopProcessTree(vite);
}

process.exitCode = exitCode;
