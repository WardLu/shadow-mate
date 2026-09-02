import { test, expect } from "@playwright/test";

test.describe("System speech fallback", () => {
  test.use({ serviceWorkers: "block" });

  test("cancels Web Speech before entering the gated Mandarin Piper path without a usable voice", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const withTimeout = (promise) => promise;
          export const askDownloadVoice = async (packageId) => {
            window.__speechFallbackOrder.push(["piper", packageId]);
            return "gated";
          };
          export const prepareLocalVoice = async () => {};
          export const resetLocalVoiceEngine = async () => {
            window.__speechFallbackOrder.push(["reset"]);
          };
          export const speakLocally = async () => ({ url: "blob:unused", duration: 0 });
        `,
      });
    });
    await page.addInitScript(() => {
      const order = [];
      Object.defineProperty(window, "__speechFallbackOrder", { configurable: true, value: order });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() { order.push(["cancel"]); },
          getVoices() { return []; },
          speak() {},
        },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance() {},
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    await page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first().click();

    await expect.poll(() => page.evaluate(() => window.__speechFallbackOrder)).toEqual([
      ["cancel"],
      ["piper", "zh_CN-chaowen-medium"],
    ]);
  });

  test("resets a timed-out local engine before a fresh English retry", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const askDownloadVoice = async () => "ok";
          export const prepareLocalVoice = async () => {};
          export const withTimeout = (promise, _timeout, message) => {
            if (message === "发音合成超时" && (window.__localEngineAttempts || 0) === 1) {
              const error = new Error(message);
              error.name = "TimeoutError";
              return Promise.reject(error);
            }
            return promise;
          };
          export const speakLocally = async () => {
            const attempt = (window.__localEngineAttempts = (window.__localEngineAttempts || 0) + 1);
            if (attempt === 1) return new Promise(() => {});
            return { url: "blob:fresh-engine", duration: 0 };
          };
          export const resetLocalVoiceEngine = async () => {
            window.__localEngineResets = (window.__localEngineResets || 0) + 1;
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
          window.__freshRetryPlays = (window.__freshRetryPlays || 0) + 1;
          this.onended?.();
        },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__localEngineResets || 0)).toBe(1);

    await button.click();
    await expect.poll(() => page.evaluate(() => ({
      attempts: window.__localEngineAttempts,
      resets: window.__localEngineResets,
      plays: window.__freshRetryPlays || 0,
    }))).toEqual({ attempts: 2, resets: 1, plays: 1 });
  });

  test("cancels a system utterance that never starts before one English Piper playback", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 60000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const withTimeout = (promise) => promise;
          export const resetLocalVoiceEngine = async () => {};
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
          export const resetLocalVoiceEngine = async () => {};
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

  test("coordinates two speech dialogs so only one tab downloads the package", async ({ page, context }) => {
    await context.route("**/src/piper-resource-store.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const getPiperResourceStatus = async () => localStorage.getItem("piper-test-completed") === "yes" ? "completed" : "not-downloaded";
          export const getPiperResourceCachedBytes = async () => null;
          export const deletePiperResource = async () => localStorage.removeItem("piper-test-completed");
        `,
      });
    });
    await context.route("**/src/piper-resource-download.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const downloadPiperResource = async (_packageId, onProgress) => {
            const attempts = Number(localStorage.getItem("piper-test-attempts") || "0") + 1;
            localStorage.setItem("piper-test-attempts", String(attempts));
            onProgress?.(1, 2);
            await new Promise((resolve) => setTimeout(resolve, 500));
            localStorage.setItem("piper-test-completed", "yes");
            return { status: "completed" };
          };
          export const getPiperDownloadError = (error) => ({ code: error?.code || "network", message: error?.message || "failed" });
        `,
      });
    });
    const secondPage = await context.newPage();
    await Promise.all([page.goto("/"), secondPage.goto("/")]);
    await Promise.all([page, secondPage].map((target) => target.evaluate(async () => {
      const { askDownloadVoice } = await import("/src/piper-tts.js");
      window.__speechDialogResult = askDownloadVoice("en_US-ljspeech-medium").then((status) => {
        window.__speechDialogStatus = status;
      });
    })));
    await Promise.all([page, secondPage].map((target) => target.locator('#shadow-voice-dialog [data-action="ok"]').click()));

    await expect.poll(() => page.evaluate(() => localStorage.getItem("piper-test-attempts"))).toBe("1");
    await expect.poll(async () => Promise.all([
      page.evaluate(() => window.__speechDialogStatus),
      secondPage.evaluate(() => window.__speechDialogStatus),
    ])).toEqual(["ok", "ok"]);
    await secondPage.close();
  });

  test("reuses one validated model provider and object URL across repeated syntheses", async ({ page }) => {
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            constructor({ voiceProvider }) { this.voiceProvider = voiceProvider; }
            async generate(_text, voice) {
              const [, modelUrl] = await this.voiceProvider.fetch(voice);
              window.__providerModelUrls = [...(window.__providerModelUrls || []), modelUrl];
              return { file: new Blob(["audio"], { type: "audio/wav" }), duration: 1 };
            }
            destroy() {}
          }
        `,
      });
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "caches", {
        configurable: true,
        value: {
          open: async () => ({
            match: async (url) => {
              if (url.endsWith(".onnx.json")) {
                window.__metadataCacheReads = (window.__metadataCacheReads || 0) + 1;
                return new Response("{}");
              }
              window.__modelCacheReads = (window.__modelCacheReads || 0) + 1;
              return new Response(new Blob(["model"]));
            },
          }),
        },
      });
    });
    await page.goto("/");

    const result = await page.evaluate(async () => {
      const { resetLocalVoiceEngine, speakLocally } = await import("/src/piper-tts.js");
      const first = await speakLocally("first", "en_US-ljspeech-medium");
      const second = await speakLocally("second", "en_US-ljspeech-medium");
      URL.revokeObjectURL(first.url);
      URL.revokeObjectURL(second.url);
      const snapshot = {
        modelReads: window.__modelCacheReads,
        metadataReads: window.__metadataCacheReads,
        providerUrls: window.__providerModelUrls,
      };
      await resetLocalVoiceEngine();
      return snapshot;
    });

    expect(result.modelReads).toBe(1);
    expect(result.metadataReads).toBe(1);
    expect(result.providerUrls).toHaveLength(2);
    expect(new Set(result.providerUrls).size).toBe(1);
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

  test("replaces a hung Piper engine after synthesis timeout", async ({ page }) => {
    await page.route("**/piper-tts-web.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export class OnnxWebRuntime { constructor() {} }
          export class PhonemizeWebRuntime { constructor() {} }
          export class PiperWebEngine {
            constructor() { window.__timeoutEngines = (window.__timeoutEngines || 0) + 1; }
            async generate() {
              const call = (window.__timeoutGenerates = (window.__timeoutGenerates || 0) + 1);
              if (call === 1) return new Promise(() => {});
              return { file: new Blob(["audio"], { type: "audio/wav" }), duration: 1 };
            }
            destroy() { window.__timeoutDestroys = (window.__timeoutDestroys || 0) + 1; }
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
      const { resetLocalVoiceEngine, speakLocally, withTimeout } = await import("/src/piper-tts.js");
      const timedOut = await withTimeout(
        speakLocally("first", "en_US-ljspeech-medium"),
        5,
        "发音合成超时"
      ).then(() => null, (error) => error.name);
      await resetLocalVoiceEngine();
      const next = await speakLocally("second", "en_US-ljspeech-medium");
      URL.revokeObjectURL(next.url);
      return {
        timedOut,
        engines: window.__timeoutEngines,
        destroys: window.__timeoutDestroys,
        generates: window.__timeoutGenerates,
      };
    });

    expect(result).toEqual({ timedOut: "TimeoutError", engines: 2, destroys: 1, generates: 2 });
  });
});
