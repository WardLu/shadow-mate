import { test, expect } from "@playwright/test";
import { seedIssuedWritingPlan } from "./helpers/content-learning.js";
import { openSection } from "./helpers/sections.js";
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
    await openSection(page, "section-chinese-poem");
    const button = page.locator(".poem-read-all").first();
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

  test("reads literacy cards and every issued worksheet tap without system speech", async ({ page }) => {
    await installPublishedSpeechOnly(page);
    await page.clock.install({ time: new Date("2026-09-01T02:00:00.000Z") });
    await page.goto("/");
    await seedIssuedWritingPlan(page);
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    // 识字卡与写字练习单分属两个页签，依次切换后逐个点读。
    const literacyTargets = page.locator("[data-hanzi-mini]");
    const worksheetTargets = page.locator("[data-writing-worksheet] [data-speech-tap]:not([data-hanzi-meaning-row])");
    const literacyCount = await literacyTargets.count();
    const count = literacyCount + await worksheetTargets.count();
    expect(count).toBeGreaterThanOrEqual(22);
    let plays = 0;
    for (const [sectionId, targets] of [["section-chinese-literacy", literacyTargets], ["section-chinese-writing", worksheetTargets]]) {
      await openSection(page, sectionId);
      const sectionCount = await targets.count();
      for (let index = 0; index < sectionCount; index++) {
        await targets.nth(index).click();
        plays += 1;
        await expectPublishedPlays(page, plays);
        await expect(targets.nth(index)).not.toHaveAttribute("data-speech-failure", "true");
      }
    }
    expect(plays).toBe(count);
    await expect(page.locator('.hanzi-visual-value').first()).toBeVisible();
    await openSection(page, "section-chinese-literacy");
    await expect(page.locator('[data-hanzi-mini="0"] .big')).toBeVisible();
  });

  test("covers poetry, prompts and English without Web Speech API", async ({ page }) => {
    await installPublishedSpeechOnly(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    await openSection(page, "section-chinese-poem");

    await page.locator(".poem-title").first().click();
    await expectPublishedPlays(page, 1);
    await page.locator(".poem-line").first().click();
    await expectPublishedPlays(page, 2);

    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');
    await page.locator(".btn-read-prompt").first().click();
    await expectPublishedPlays(page, 3);
    await page.locator("[data-speak]").first().click();
    await expectPublishedPlays(page, 4);
    await page.locator('[data-cmod="english-vocabulary"]').click();
    await openSection(page, "section-english-review");
    await page.locator(".mr-chip[data-word]").first().click();
    await expectPublishedPlays(page, 5);
  });
});
