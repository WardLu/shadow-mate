import { test, expect } from "@playwright/test";

test.describe("System speech fallback", () => {
  test.use({ serviceWorkers: "block" });

  test("uses a completed Chinese Piper package before a browser-reported system voice", async ({ page }) => {
    await page.route("**/src/piper-tts.js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          export const ENGINE_LOAD_TIMEOUT_MS = 120000;
          export const SYNTHESIS_TIMEOUT_MS = 30000;
          export const isPiperVoiceCached = async (packageId) => {
            window.__cachedPackage = packageId;
            return true;
          };
          export const withTimeout = (promise) => promise;
          export const askDownloadVoice = async (packageId) => {
            window.__piperCalls = [...(window.__piperCalls || []), ["download", packageId]];
            return "ok";
          };
          export const prepareLocalVoice = async (packageId) => {
            window.__piperCalls = [...(window.__piperCalls || []), ["prepare", packageId]];
          };
          export const resetLocalVoiceEngine = async () => {};
          export const speakLocally = async (_text, packageId) => {
            window.__piperCalls = [...(window.__piperCalls || []), ["speak", packageId]];
            return { url: "blob:cached-chinese", duration: 0 };
          };
        `,
      });
    });
    await page.addInitScript(() => {
      const order = [];
      Object.defineProperty(window, "__systemSpeechOrder", { configurable: true, value: order });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {},
          getVoices() { return [{ lang: "zh", name: "Quark default voice" }]; },
          speak() { order.push("system"); },
        },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance() {},
      });
      window.localStorage.setItem(
        "shadow-mate-piper-cache-hints-v1",
        JSON.stringify(["matcha-icefall-zh-en-1.13.2"]),
      );
      Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: async function play() { this.onended?.(); },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();

    await expect.poll(() => page.evaluate(() => ({
      cached: window.__cachedPackage,
      piper: window.__piperCalls || [],
      system: window.__systemSpeechOrder,
    }))).toEqual({
      cached: "matcha-icefall-zh-en-1.13.2",
      piper: [
        ["download", "matcha-icefall-zh-en-1.13.2"],
        ["prepare", "matcha-icefall-zh-en-1.13.2"],
        ["speak", "matcha-icefall-zh-en-1.13.2"],
      ],
      system: [],
    });
  });

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
      ["piper", "matcha-icefall-zh-en-1.13.2"],
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
        ["download", "matcha-icefall-zh-en-1.13.2"],
        ["prepare", "matcha-icefall-zh-en-1.13.2"],
        ["speak", "matcha-icefall-zh-en-1.13.2"],
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
    await expect.poll(() => page.evaluate(() => window.__downloadCalls || [])).toEqual(["matcha-icefall-zh-en-1.13.2"]);
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
      downloads: ["matcha-icefall-zh-en-1.13.2"],
      prepared: ["matcha-icefall-zh-en-1.13.2"],
      spoken: ["matcha-icefall-zh-en-1.13.2"],
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
      window.__speechDialogResult = askDownloadVoice("matcha-icefall-zh-en-1.13.2").then((status) => {
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

});
