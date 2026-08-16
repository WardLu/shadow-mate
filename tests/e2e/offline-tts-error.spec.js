import { test, expect } from "@playwright/test";

test.describe("Offline voice download errors", () => {
  test.use({ serviceWorkers: "block" });

  test("keeps a failed voice download visible to the user", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine { constructor() {} }
        `,
      });
    });
    await page.route("https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx", async (route) => {
      await route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" });
    });
    await page.goto("/");
    await page.evaluate(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance() {},
      });
    });
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();
    await page.click('.voice-dialog-actions [data-action="ok"]');

    await expect(button).toContainText("下载失败");
    expect(pageErrors).toEqual([]);
  });
});
