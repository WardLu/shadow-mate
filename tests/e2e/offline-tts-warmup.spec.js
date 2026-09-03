import { test, expect } from "@playwright/test";

const ENGLISH_PACKAGE = "en_US-ljspeech-medium";

async function installNoSystemSpeech(page) {
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
}

async function openEnglish(page) {
  await page.goto("/");
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="english"]');
}

test.describe("Offline voice warmup", () => {
  test.use({ serviceWorkers: "block" });

  test("starts the named package engine after its download completes", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const withTimeout = (promise) => promise;
          export const resetLocalVoiceEngine = async () => {};
          export const askDownloadVoice = (packageId) => new Promise((resolve) => {
            window.__releasePackageDownload = () => resolve("ok");
          });
          export const prepareLocalVoice = async (packageId) => {
            window.__warmupPackages = [...(window.__warmupPackages || []), packageId];
          };
          export const speakLocally = async (_text, packageId) => {
            window.__synthesisPackages = [...(window.__synthesisPackages || []), packageId];
            return { url: "blob:warmup", duration: 0 };
          };
        `,
      });
    });
    await installNoSystemSpeech(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async function play() { this.onended?.(); },
      });
    });
    await openEnglish(page);
    await page.locator("[data-speak]").first().click();

    await expect.poll(() => page.evaluate(() => typeof window.__releasePackageDownload)).toBe("function");
    await expect.poll(() => page.evaluate(() => window.__warmupPackages || [])).toEqual([]);
    await page.evaluate(() => window.__releasePackageDownload());
    await expect.poll(() => page.evaluate(() => window.__warmupPackages || [])).toEqual([ENGLISH_PACKAGE]);
    await expect.poll(() => page.evaluate(() => window.__synthesisPackages || [])).toEqual([ENGLISH_PACKAGE]);
  });

  test("keeps generated local audio attached until playback ends", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const withTimeout = (promise) => promise;
          export const resetLocalVoiceEngine = async () => {};
          export const askDownloadVoice = async () => "ok";
          export const prepareLocalVoice = async () => {};
          export const speakLocally = async (_text, packageId) => {
            window.__audioPackage = packageId;
            return { url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", duration: 60_000 };
          };
        `,
      });
    });
    await installNoSystemSpeech(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
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
    await openEnglish(page);
    await page.locator("[data-speak]").first().click();

    await expect.poll(() => page.evaluate(() => ({
      packageId: window.__audioPackage,
      plays: window.__audioPlayCalls || 0,
    }))).toEqual({ packageId: ENGLISH_PACKAGE, plays: 1 });
    await expect(page.locator("audio")).toHaveCount(1);
    await page.locator("audio").evaluate((audio) => audio.dispatchEvent(new Event("ended")));
    await expect(page.locator("audio")).toHaveCount(0);
  });
});
