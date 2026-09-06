import { test, expect } from "@playwright/test";
import { captureAnalytics, readAnalytics } from "./helpers/analytics.js";

test.describe("Published voice errors", () => {
  test.use({ serviceWorkers: "block" });

  test("shows a stable error when published and same-language system speech are unavailable", async ({ page }) => {
    await captureAnalytics(page);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/tts/tencent-v1-manifest.json", (route) => route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "unavailable",
    }));
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { cancel() {}, getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance() {},
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();

    await expect(button).toContainText("AI 发音暂不可用，且未检测到对应系统语音，请稍后重试");
    expect(pageErrors).toEqual([]);
    expect((await readAnalytics(page)).filter((event) => event.name === "tts_failed")).toEqual([{ name: "tts_failed" }]);
  });

  test("does not record a speech failure after its button leaves the page", async ({ page }) => {
    await captureAnalytics(page);
    let releaseManifest;
    const manifestReady = new Promise((resolve) => { releaseManifest = resolve; });
    await page.route("**/tts/tencent-v1-manifest.json", async (route) => {
      await manifestReady;
      await route.fulfill({ status: 503, body: "unavailable" });
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { cancel() {}, getVoices() { return []; }, speak() {} },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.evaluate((element) => { window.__detachedSpeechButton = element; });
    await button.click();
    await page.click('[data-mod="home"]');
    releaseManifest();
    // Wait for the terminal failure on the old button, not an arbitrary quiet period.
    await expect.poll(() => page.evaluate(() => ({
      connected: window.__detachedSpeechButton.isConnected,
      failed: window.__detachedSpeechButton.dataset.speechFailure,
    }))).toEqual({ connected: false, failed: "true" });
    expect((await readAnalytics(page)).filter((event) => event.name === "tts_failed")).toEqual([]);
  });

});
