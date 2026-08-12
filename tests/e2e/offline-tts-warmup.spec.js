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
              const wav = new Uint8Array(46);
              const view = new DataView(wav.buffer);
              view.setUint32(0, 0x52494646, false);
              view.setUint32(4, 38, true);
              view.setUint32(8, 0x57415645, false);
              view.setUint32(12, 0x666d7420, false);
              view.setUint32(16, 16, true);
              view.setUint16(20, 1, true);
              view.setUint16(22, 1, true);
              view.setUint32(24, 8000, true);
              view.setUint32(28, 16000, true);
              view.setUint16(32, 2, true);
              view.setUint16(34, 16, true);
              view.setUint32(36, 0x64617461, false);
              view.setUint32(40, 2, true);
              return { file: new Blob([wav], { type: "audio/wav" }), duration: 0.1 };
            }
          }
        `,
      });
    });
    await page.route("**/piper/en_US-ljspeech-high.onnx*", async (route) => {
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
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async () => {},
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

  test("does not leave the button busy when playback omits ended", async ({ page }) => {
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            async generate() {
              return { file: new Blob(["audio"], { type: "audio/wav" }), duration: 0.1 };
            }
          }
        `,
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
      const cacheStore = new Map([
        ["/piper/en_US-ljspeech-high.onnx.part-00", new Response(new Blob(["cached model 00"]))],
        ["/piper/en_US-ljspeech-high.onnx.part-01", new Response(new Blob(["cached model 01"]))],
        ["/piper/en_US-ljspeech-high.onnx.json", new Response("{}")],
      ]);
      Object.defineProperty(window, "caches", {
        configurable: true,
        value: { open: async () => ({ match: async (url) => cacheStore.get(url), put: async () => {} }) },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async () => {},
      });
    });

    await page.goto("/");
    await page.click('[data-mod="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();

    await expect(button).not.toBeDisabled({ timeout: 2500 });
  });

  test("keeps generated audio attached while Android playback is in progress", async ({ page }) => {
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            async generate() {
              const wav = new Uint8Array(46);
              const view = new DataView(wav.buffer);
              view.setUint32(0, 0x52494646, false);
              view.setUint32(4, 38, true);
              view.setUint32(8, 0x57415645, false);
              view.setUint32(12, 0x666d7420, false);
              view.setUint32(16, 16, true);
              view.setUint16(20, 1, true);
              view.setUint16(22, 1, true);
              view.setUint32(24, 8000, true);
              view.setUint32(28, 16000, true);
              view.setUint16(32, 2, true);
              view.setUint16(34, 16, true);
              view.setUint32(36, 0x64617461, false);
              view.setUint32(40, 2, true);
              return { file: new Blob([wav], { type: "audio/wav" }), duration: 0.5 };
            }
          }
        `,
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
      const cacheStore = new Map([
        ["/piper/en_US-ljspeech-high.onnx.part-00", new Response(new Blob(["cached model 00"]))],
        ["/piper/en_US-ljspeech-high.onnx.part-01", new Response(new Blob(["cached model 01"]))],
        ["/piper/en_US-ljspeech-high.onnx.json", new Response("{}")],
      ]);
      Object.defineProperty(window, "caches", {
        configurable: true,
        value: { open: async () => ({ match: async (url) => cacheStore.get(url), put: async () => {} }) },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value() {
          window.__audioPlayCalls = (window.__audioPlayCalls || 0) + 1;
          return Promise.resolve();
        },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "load", {
        configurable: true,
        value() {},
      });
    });

    await page.goto("/");
    await page.click('[data-mod="english"]');
    await page.locator("[data-speak]").first().click();

    await expect.poll(() => page.evaluate(() => window.__audioPlayCalls || 0), { timeout: 3000 }).toBe(1);
    await expect(page.locator("audio")).toHaveCount(1);
    await page.waitForTimeout(200);
    await expect(page.locator("audio")).toHaveCount(1);
    await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));
    await expect(page.locator("audio")).toHaveCount(0);
  });
});
