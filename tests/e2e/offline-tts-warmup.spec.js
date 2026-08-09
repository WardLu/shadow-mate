import { test, expect } from "@playwright/test";

test.describe("Offline voice warmup", () => {
  test.use({ serviceWorkers: "block" });

  test("starts loading the local engine while the voice package downloads", async ({ page }) => {
    let releaseDownload;
    const downloadBlocked = new Promise((resolve) => {
      releaseDownload = resolve;
    });

    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            constructor() {
              window.__piperEngineCreated = (window.__piperEngineCreated || 0) + 1;
            }
            async generate() {
              window.__piperGenerateCalls = (window.__piperGenerateCalls || 0) + 1;
              return { file: new Blob(["audio"], { type: "audio/wav" }), duration: 0.1 };
            }
          }
        `,
      });
    });
    await page.route("**/piper/en_US-lessac-medium.onnx*", async (route) => {
      const request = route.request();
      const isConfig = request.url().endsWith(".json");
      if (request.method() === "HEAD") {
        await route.fulfill({ status: 200, headers: { "content-length": isConfig ? "2" : "5" } });
        return;
      }
      if (!isConfig) await downloadBlocked;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": isConfig ? "application/json" : "application/octet-stream",
          "content-length": isConfig ? "2" : "5",
        },
        body: isConfig ? "{}" : "model",
      });
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance() {},
      });
      const cacheStore = new Map();
      Object.defineProperty(window, "caches", {
        configurable: true,
        value: {
          open: async () => ({
            match: async (url) => cacheStore.get(url),
            put: async (url, response) => cacheStore.set(url, response),
          }),
        },
      });
      Object.defineProperty(window, "Audio", {
        configurable: true,
        value: function Audio() {
          this.play = async () => this.onended?.();
        },
      });
    });

    await page.goto("/");
    await page.click('[data-mod="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();
    await page.click('.voice-dialog-actions [data-action="ok"]');

    await expect.poll(() => page.evaluate(() => window.__piperEngineCreated || 0), { timeout: 1500 }).toBe(1);
    releaseDownload();
    await expect.poll(() => page.evaluate(() => window.__piperGenerateCalls || 0), { timeout: 3000 }).toBe(1);
    await expect(button).not.toContainText("发音失败");
  });
});
