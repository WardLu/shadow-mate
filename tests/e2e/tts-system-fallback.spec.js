import { test, expect } from "@playwright/test";

test.describe("System speech fallback", () => {
  test.use({ serviceWorkers: "block" });

  test("cancels a system utterance that never starts before one English Piper playback", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const withTimeout = (promise) => promise;
          export const askDownloadVoice = async (packageId) => {
            window.__piperPackages = [...(window.__piperPackages || []), ["download", packageId]];
            return "ok";
          };
          export const prepareLocalVoice = async (packageId) => {
            window.__piperPackages = [...(window.__piperPackages || []), ["prepare", packageId]];
          };
          export const speakLocally = async (_text, packageId) => {
            window.__piperPackages = [...(window.__piperPackages || []), ["speak", packageId]];
            return { url: "blob:local-piper", duration: 0 };
          };
        `,
      });
    });
    await page.addInitScript(() => {
      let cancels = 0;
      Object.defineProperty(window, "__systemCancels", { configurable: true, get: () => cancels });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() { cancels += 1; },
          getVoices() { return [{ lang: "en-US" }]; },
          speak() {},
        },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance(text) { this.text = text; },
      });
      Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async function play() {
          window.__localAudioPlays = (window.__localAudioPlays || 0) + 1;
          this.onended?.();
        },
      });
    });
    await page.clock.install();
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');

    await page.locator("[data-speak]").first().click();
    await page.clock.fastForward(4001);

    await expect.poll(() => page.evaluate(() => ({
      cancels: window.__systemCancels,
      packages: window.__piperPackages || [],
      plays: window.__localAudioPlays || 0,
    }))).toEqual({
      cancels: 2,
      packages: [
        ["download", "en_US-ljspeech-medium"],
        ["prepare", "en_US-ljspeech-medium"],
        ["speak", "en_US-ljspeech-medium"],
      ],
      plays: 1,
    });
  });

  test("keeps rapid repeated clicks to one English package download and one playback", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const withTimeout = (promise) => promise;
          export const askDownloadVoice = (packageId) => new Promise((resolve) => {
            window.__downloadCalls = [...(window.__downloadCalls || []), packageId];
            window.__finishDownload = () => resolve("ok");
          });
          export const prepareLocalVoice = async (packageId) => {
            window.__prepareCalls = [...(window.__prepareCalls || []), packageId];
          };
          export const speakLocally = async (_text, packageId) => {
            window.__speakCalls = [...(window.__speakCalls || []), packageId];
            return { url: "blob:one-playback", duration: 0 };
          };
        `,
      });
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { cancel() {}, getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance() {},
      });
      Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async function play() {
          window.__rapidAudioPlays = (window.__rapidAudioPlays || 0) + 1;
          this.onended?.();
        },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__downloadCalls || [])).toEqual(["en_US-ljspeech-medium"]);
    await page.evaluate(() => {
      const speakButton = document.querySelector("[data-speak]");
      speakButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      speakButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      window.__finishDownload();
    });

    await expect.poll(() => page.evaluate(() => ({
      downloads: window.__downloadCalls || [],
      prepared: window.__prepareCalls || [],
      spoken: window.__speakCalls || [],
      plays: window.__rapidAudioPlays || 0,
    }))).toEqual({
      downloads: ["en_US-ljspeech-medium"],
      prepared: ["en_US-ljspeech-medium"],
      spoken: ["en_US-ljspeech-medium"],
      plays: 1,
    });
  });

  test("destroys a failed engine so the next local request creates a fresh one", async ({ page }) => {
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            constructor() { window.__piperEngines = (window.__piperEngines || 0) + 1; }
            async generate() {
              const call = (window.__piperGenerates = (window.__piperGenerates || 0) + 1);
              if (call === 1) throw new Error("broken ONNX session");
              return { file: new Blob(["audio"], { type: "audio/wav" }), duration: 1 };
            }
            destroy() { window.__piperDestroys = (window.__piperDestroys || 0) + 1; }
          }
        `,
      });
    });
    await page.addInitScript(() => {
      const cacheStore = new Map([
        ["https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx", new Response(new Blob(["model"]))],
        ["https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx.json", new Response("{}")],
      ]);
      Object.defineProperty(window, "caches", {
        configurable: true,
        value: { open: async () => ({ match: async (url) => cacheStore.get(url) }) },
      });
    });
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const { speakLocally } = await import("/src/piper-tts.js");
      const failed = await speakLocally("first", "en_US-ljspeech-medium")
        .then(() => null, (error) => error.code);
      const next = await speakLocally("second", "en_US-ljspeech-medium");
      URL.revokeObjectURL(next.url);
      return {
        failed,
        engines: window.__piperEngines,
        destroys: window.__piperDestroys,
        generates: window.__piperGenerates,
      };
    });

    expect(result).toEqual({ failed: "error", engines: 2, destroys: 1, generates: 2 });
  });
});
