import { test, expect } from "@playwright/test";

test.describe("Published voice errors", () => {
  test.use({ serviceWorkers: "block" });

  test("shows a stable error when published and same-language system speech are unavailable", async ({ page }) => {
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
  });
});
