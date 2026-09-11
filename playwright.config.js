import { defineConfig, devices } from "@playwright/test";

const managedByRunner = process.env.E2E_EXTERNAL_SERVER === "1";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

// 移动端视口专项(roadmap「移动端学习体验」第 1 步):
// mobile-*/tablet-* project 只跑视口 spec,桌面 chromium 排除它,
// 避免既有 e2e 套件在每个断点重复执行。
// iPhone/iPad 设备用 Playwright 默认的 WebKit 引擎(最接近 iOS Safari);
// 本地/CI 需要执行 npx playwright install chromium webkit。
const MOBILE_VIEWPORT_SPEC = /mobile-viewport\.spec\.js/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 5000,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: [MOBILE_VIEWPORT_SPEC],
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
      },
    },
    {
      // 360px 小屏安卓(Pixel 7 UA,viewport 压到 360)
      name: "mobile-360",
      testMatch: [MOBILE_VIEWPORT_SPEC],
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 800 } },
    },
    {
      // 390px 档 iPhone(iPhone 15 为 393pt,覆盖 390+ 断点),WebKit 引擎
      name: "mobile-390",
      testMatch: [MOBILE_VIEWPORT_SPEC],
      use: devices["iPhone 15"],
    },
    {
      name: "tablet-portrait",
      testMatch: [MOBILE_VIEWPORT_SPEC],
      use: devices["iPad Mini"],
    },
    {
      name: "tablet-landscape",
      testMatch: [MOBILE_VIEWPORT_SPEC],
      use: { ...devices["iPad Mini"], viewport: { width: 1024, height: 768 } },
    },
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
