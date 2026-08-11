import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

const host = "127.0.0.1";
const preferredPort = Number(process.env.E2E_PORT || 5173);
const e2eEnv = {
  ...process.env,
  FORCE_COLOR: "1",
  // Vite loads .env.local automatically, while Playwright only sees process
  // env. Keep the auth storage key derivation identical in both processes when
  // a real E2E Supabase URL was not explicitly supplied.
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://dutepjyocxcvecmsrtfp.supabase.co",
};
const viteEntry = resolve("node_modules/vite/bin/vite.js");
const playwrightEntry = resolve("node_modules/@playwright/test/cli.js");

function isPortAvailable(port) {
  return new Promise((resolvePromise) => {
    const probe = createServer();
    probe.once("error", () => resolvePromise(false));
    probe.listen(port, host, () => {
      probe.close(() => resolvePromise(true));
    });
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available E2E port found from ${startPort}`);
}

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

const port = await findAvailablePort(preferredPort);
const baseURL = `http://${host}:${port}`;
const vite = spawn(process.execPath, [viteEntry, "--host", host, "--port", String(port)], {
  // Vite otherwise selects a fallback port without telling Playwright which
  // server to use when the default port is occupied by another dev server.
  // Resolve the port first and pass it to both processes explicitly.
  stdio: "inherit",
  env: e2eEnv,
});

let exitCode = 1;
try {
  await waitForServer(baseURL);
  const playwright = spawnSync(process.execPath, [playwrightEntry, "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...e2eEnv, E2E_BASE_URL: baseURL, E2E_EXTERNAL_SERVER: "1" },
  });
  exitCode = playwright.status ?? 1;
} finally {
  stopProcessTree(vite);
}

process.exitCode = exitCode;
