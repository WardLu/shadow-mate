import { test, expect } from "@playwright/test";
import { captureAnalytics, readAnalytics } from "./helpers/analytics.js";

async function openChinese(page) {
  await page.goto("/");
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="chinese"]');
}

async function installSystemSpeech(page, voices = []) {
  await page.addInitScript((configuredVoices) => {
    window.__speechUtterances = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        getVoices() { return configuredVoices; },
        speak(utterance) {
          window.__speechUtterances.push({ text: utterance.text, lang: utterance.lang, voiceLang: utterance.voice?.lang });
          utterance.onstart?.();
          queueMicrotask(() => utterance.onend?.());
        },
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: function SpeechSynthesisUtterance(text) { this.text = text; },
    });
  }, voices);
}

test.describe("Published speech and system fallback", () => {
  test.use({ serviceWorkers: "block" });

  test("plays the shared CDN clip first with immediate busy feedback", async ({ page }) => {
    await installSystemSpeech(page, []);
    const audioUrl = "https://voice.shadow.wang/tts/tencent/v1/zh-CN/101030/test.mp3";
    let manifestRequests = 0;
    let audioRequests = 0;
    await page.route("**/tts/tencent-v1-manifest.json", (route) => { manifestRequests += 1; return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries: Array.from({ length: 32 }, (_, index) => ({ contentId: `hz-${String(index + 1).padStart(3, "0")}:glyph`, url: audioUrl })) }),
    }); });
    await page.route(audioUrl, (route) => { audioRequests += 1; return route.fulfill({
      status: 200,
      headers: { "content-type": "audio/mpeg", "access-control-allow-origin": "*" },
      body: Buffer.from([0x49, 0x44, 0x33, 1]),
    }); });
    await page.addInitScript(() => {
      window.__publishedAudioPlays = 0;
      Object.defineProperty(window, "Audio", {
        configurable: true,
        value: class AudioMock {
          play() {
            window.__publishedAudioPlays += 1;
            window.__finishPublishedAudio = () => this.onended?.();
            return Promise.resolve();
          }
          pause() {}
        },
      });
    });
    await openChinese(page);
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await expect(button).toHaveAttribute("data-speech-content-id", /^hz-/);
    await button.click({ noWaitAfter: true });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect.poll(async () => ({ manifestRequests, audioRequests, ...(await button.evaluate((element) => ({ plays: window.__publishedAudioPlays, error: element.dataset.publishedSpeechError || null, id: element.dataset.speechContentId }))) })).toMatchObject({ manifestRequests: 1, audioRequests: 1, plays: 1, error: null });
    expect(await page.evaluate(() => window.__speechUtterances)).toEqual([]);
    await page.evaluate(() => window.__finishPublishedAudio());
  });

  test("falls back only to a matching Mandarin system voice when CDN fails", async ({ page }) => {
    await captureAnalytics(page);
    await installSystemSpeech(page, [{ lang: "zh-CN", name: "Mandarin" }, { lang: "en-US", name: "English" }]);
    await page.route("**/tts/tencent-v1-manifest.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
    await openChinese(page);
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    const expectedText = await button.getAttribute("data-speech-text");
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
      { text: expectedText, lang: "zh-CN", voiceLang: "zh-CN" },
    ]);
    expect((await readAnalytics(page)).filter((event) => event.name === "tts_failed")).toEqual([]);
  });

  test("never uses an English voice for Chinese fallback and never requests Piper", async ({ page }) => {
    await installSystemSpeech(page, [{ lang: "en-US", name: "English" }]);
    let piperRequests = 0;
    await page.route("**/tts/tencent-v1-manifest.json", (route) => route.fulfill({ status: 404, body: "missing" }));
    await page.route(/https:\/\/voice\.shadow\.wang\/.*(?:piper|matcha).*/, (route) => { piperRequests += 1; return route.abort(); });
    await openChinese(page);
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();
    await expect(button).toContainText("AI 发音暂不可用");
    expect(await page.evaluate(() => window.__speechUtterances)).toEqual([]);
    expect(piperRequests).toBe(0);
  });
});
