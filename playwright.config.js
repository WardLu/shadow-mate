import { defineConfig, devices } from "@playwright/test";

const managedByRunner = process.env.E2E_EXTERNAL_SERVER === "1";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 5000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  ...(managedByRunner ? {} : {
    webServer: {
      command: process.platform === "win32"
        ? "node .\\node_modules\\vite\\bin\\vite.js --host 127.0.0.1"
        : "npm run dev -- --host 127.0.0.1",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  }),
});
