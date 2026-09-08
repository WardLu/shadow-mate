import { test, expect } from "@playwright/test";
import { CORE_LEARNING_SPEECH_ENTRIES } from "../../src/content/core-learning-speech.js";

async function installPublishedSpeechOnly(page) {
  await page.addInitScript(() => {
    window.__publishedAudioPlays = 0;
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: class AudioMock {
        play() {
          window.__publishedAudioPlays += 1;
          queueMicrotask(() => this.onended?.());
          return Promise.resolve();
        }
        pause() {}
        remove() {}
      },
    });
  });
  const entries = CORE_LEARNING_SPEECH_ENTRIES.map(({ contentId }) => ({
    contentId,
    url: `https://voice.test/${encodeURIComponent(contentId)}.mp3`,
  }));
  await page.route("**/tts/tencent-v1-manifest.json", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ entries }),
  }));
  await page.route("https://voice.test/**", (route) => route.fulfill({
    contentType: "audio/mpeg",
    body: Buffer.from([0x49, 0x44, 0x33, 1]),
  }));
}

async function expectPublishedPlays(page, count) {
  await expect.poll(() => page.evaluate(() => window.__publishedAudioPlays)).toBe(count);
}

test.describe("Core learning published speech", () => {
  test.use({ serviceWorkers: "block" });

  test("can restart the whole poem after a line tap cancels CDN playback", async ({ page }) => {
    await installPublishedSpeechOnly(page);
    await page.addInitScript(() => {
      window.Audio.prototype.play = function () {
        window.__publishedAudioPlays += 1;
        return Promise.resolve();
      };
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    const button = page.locator(".poem-read-all");
    await button.click();
    await expectPublishedPlays(page, 1);
    await expect(button).toBeDisabled();
    await page.locator(".poem-line").first().click();
    await expectPublishedPlays(page, 2);
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute("aria-busy", "true");
    // Wait out the application's 500 ms duplicate-click guard before restarting.
    await page.waitForTimeout(550);
    await button.click();
    await expectPublishedPlays(page, 3);
    await expect(button).toBeDisabled();
  });

  test("reads both literacy cards and every worksheet tap without system speech", async ({ page }) => {
    await installPublishedSpeechOnly(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    const targets = page.locator('[data-hanzi-mini], [data-writing-worksheet] [data-speech-tap]:not([data-hanzi-meaning-row])');
    const count = await targets.count();
    expect(count).toBeGreaterThanOrEqual(22);
    for (let index = 0; index < count; index++) {
      await targets.nth(index).click();
      await expectPublishedPlays(page, index + 1);
      await expect(targets.nth(index)).not.toHaveAttribute("data-speech-failure", "true");
    }
    await expect(page.locator('[data-hanzi-mini="0"] .big')).toBeVisible();
    await expect(page.locator('.hanzi-visual-value').first()).toBeVisible();
  });

  test("covers poetry, prompts and English without Web Speech API", async ({ page }) => {
    await installPublishedSpeechOnly(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');

    await page.locator(".poem-title").click();
    await expectPublishedPlays(page, 1);
    await page.locator(".poem-line").first().click();
    await expectPublishedPlays(page, 2);

    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');
    await page.locator(".btn-read-prompt").first().click();
    await expectPublishedPlays(page, 3);
    await page.locator("[data-speak]").first().click();
    await expectPublishedPlays(page, 4);
    await page.locator(".btn-read-prompt").nth(1).click();
    await expectPublishedPlays(page, 5);
    await page.locator(".mr-chip[data-word]").first().click();
    await expectPublishedPlays(page, 6);
  });
});
