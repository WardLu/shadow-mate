import { test, expect } from "@playwright/test";

test.describe("System speech fallback", () => {
  test.use({ serviceWorkers: "block" });

  test("falls back to cached Piper when system speech never responds", async ({ page }) => {
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            constructor() {}
            async generate() {
              window.__piperGenerateCalls = (window.__piperGenerateCalls || 0) + 1;
              return { file: new Blob(["cached audio"], { type: "audio/wav" }), duration: 0.1 };
            }
          }
        `,
      });
    });
    await page.addInitScript(() => {
      let systemSpeechCalls = 0;
      Object.defineProperty(window, "__systemSpeechCalls", {
        configurable: true,
        get: () => systemSpeechCalls,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {},
          getVoices() { return [{ lang: "en-US" }]; },
          speak() { systemSpeechCalls += 1; },
        },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance(text) { this.text = text; },
      });
      Object.defineProperty(window, "caches", {
        configurable: true,
        value: {
          open: async () => ({
            match: async () => new Response(new Blob(["cached model"])),
            put: async () => {},
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
    await expect.poll(() => page.evaluate(() => window.__systemSpeechCalls), { timeout: 1000 }).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__piperGenerateCalls || 0), { timeout: 7000 }).toBe(1);
    await expect(button).not.toContainText("发音未响应");
  });
});
