import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PREVIEW_ORIGIN = "https://preview-sm.shadow.wang";

test.describe("Piper development asset", () => {
  test("serves the public module when Vite appends the import query", async ({ page }) => {
    const response = await page.request.get("/piper-tts-web.js?import");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("javascript");
  });
});

test.describe("Preview-only Piper resource smoke", () => {
  test.skip(process.env.PIPER_PREVIEW_SMOKE !== "1", "requires PIPER_PREVIEW_SMOKE=1; desktop Playwright is not Xiaomi acceptance");

  test("records service-worker version, one download, offline reload, and no second model GET", async ({ page, context }, testInfo) => {
    if (process.env.E2E_BASE_URL !== PREVIEW_ORIGIN) {
      throw new Error(`Preview smoke must target ${PREVIEW_ORIGIN}, received ${process.env.E2E_BASE_URL || "missing"}`);
    }
    let modelGetRequests = 0;
    await page.route("**/piper/en_US-ljspeech-medium.onnx", async (route) => {
      if (route.request().method() === "GET") modelGetRequests += 1;
      await route.continue();
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { cancel() {}, getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: function SpeechSynthesisUtterance() {} });
    });
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    const serviceWorkerVersion = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL || null;
    });
    await page.click('[data-mod="guide"]');
    const packageRow = page.locator('[data-piper-resource="en_US-ljspeech-medium"]');
    await expect(packageRow).toBeVisible();
    await packageRow.getByRole("button", { name: "下载" }).click();
    await expect(packageRow.locator("[data-piper-resource-status]")).toHaveAttribute("data-piper-resource-status", "completed", { timeout: 180_000 });
    const getRequestsAfterDownload = modelGetRequests;
    expect(getRequestsAfterDownload).toBeGreaterThan(0);

    await context.setOffline(true);
    await page.reload();
    await page.click('[data-mod="guide"]');
    await expect(packageRow.locator("[data-piper-resource-status]")).toHaveAttribute("data-piper-resource-status", "completed");
    await context.setOffline(false);
    expect(modelGetRequests).toBe(getRequestsAfterDownload);

    const evidence = { serviceWorkerVersion, packageStatus: "completed", modelGetRequests: getRequestsAfterDownload, offlineReload: true };
    testInfo.annotations.push({ type: "preview-piper-smoke", description: JSON.stringify(evidence) });
    console.log(`[preview-piper-smoke] ${JSON.stringify(evidence)}`);
  });

  test("synthesizes a Chinese sample from the approved CDN package", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (process.env.E2E_BASE_URL !== PREVIEW_ORIGIN) {
      throw new Error(`Preview smoke must target ${PREVIEW_ORIGIN}, received ${process.env.E2E_BASE_URL || "missing"}`);
    }
    let modelGetRequests = 0;
    let metadataGetRequests = 0;
    await page.route("**/piper/zh_CN-chaowen-medium.onnx", async (route) => {
      if (route.request().method() === "GET") modelGetRequests += 1;
      await route.continue();
    });
    await page.route("**/piper/zh_CN-chaowen-medium.onnx.json", async (route) => {
      if (route.request().method() === "GET") metadataGetRequests += 1;
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__chinesePiperPlays = 0;
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
          window.__chinesePiperPlays += 1;
          this.onended?.();
        },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');
    const button = page.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();
    const dialog = page.locator("#shadow-voice-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".voice-dialog-title")).toContainText("中文");
    await dialog.getByRole("button", { name: "下载" }).click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });
    await expect(button).not.toHaveAttribute("aria-busy", "true", { timeout: 180_000 });
    const evidence = await page.evaluate(async ({ modelGetRequests, metadataGetRequests }) => {
      const cache = await caches.open("shadow-mate-piper-zh_CN-chaowen-medium-1");
      const model = await cache.match("https://voice.shadow.wang/piper/zh_CN-chaowen-medium.onnx");
      const metadata = await cache.match("https://voice.shadow.wang/piper/zh_CN-chaowen-medium.onnx.json");
      return {
        packageId: "zh_CN-chaowen-medium",
        packageStatus: model?.ok && metadata?.ok ? "completed" : "incomplete",
        modelBytes: model ? (await model.arrayBuffer()).byteLength : 0,
        metadataBytes: metadata ? (await metadata.arrayBuffer()).byteLength : 0,
        modelGetRequests,
        metadataGetRequests,
        plays: window.__chinesePiperPlays || 0,
      };
    }, { modelGetRequests, metadataGetRequests });

    expect(evidence).toMatchObject({
      packageId: "zh_CN-chaowen-medium",
      packageStatus: "completed",
      modelBytes: 63221984,
      metadataBytes: 2927,
    });
    expect(evidence.modelGetRequests).toBeGreaterThan(0);
    expect(evidence.metadataGetRequests).toBeGreaterThan(0);
    expect(evidence.plays).toBe(1);
    testInfo.annotations.push({ type: "preview-chinese-piper-synthesis", description: JSON.stringify(evidence) });
    console.log(`[preview-chinese-piper-synthesis] ${JSON.stringify(evidence)}`);
  });
});

test.describe("Local Chinese Piper compatibility probe", () => {
  test.skip(!process.env.PIPER_LOCAL_ZH_MODEL_DIR, "requires PIPER_LOCAL_ZH_MODEL_DIR; does not run in normal CI");

  test("synthesizes a Chinese sample with the bundled browser runtime", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const modelDir = process.env.PIPER_LOCAL_ZH_MODEL_DIR;
    const model = await readFile(join(modelDir, "zh_CN-chaowen-medium.onnx"));
    const metadata = await readFile(join(modelDir, "zh_CN-chaowen-medium.onnx.json"), "utf8");
    await page.route("https://voice.shadow.wang/piper/zh_CN-chaowen-medium.onnx", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: model });
    });
    await page.route("https://voice.shadow.wang/piper/zh_CN-chaowen-medium.onnx.json", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: metadata });
    });
    await page.goto("/");
    const evidence = await page.evaluate(async () => {
      const packageId = "zh_CN-chaowen-medium";
      const { getPiperResourcePackage } = await import("/src/piper-resource-registry.js");
      const resourcePackage = getPiperResourcePackage(packageId);
      const { createPiperResourceStore } = await import("/src/piper-resource-store.js");
      const store = createPiperResourceStore({
        packages: [resourcePackage],
        cacheStorage: caches,
        getCapabilities: () => ({ canDownload: true }),
      });
      const cache = await caches.open(store.getCacheName(resourcePackage));
      for (const file of resourcePackage.files) {
        const response = await fetch(`${resourcePackage.baseUrl}${file.suffix}`);
        if (!response.ok) throw new Error(`Chinese ${file.key} fetch failed with HTTP ${response.status}`);
        await cache.put(`${resourcePackage.baseUrl}${file.suffix}`, response.clone());
      }
      await store.writeCompletionMarker(resourcePackage);
      const { speakLocally } = await import("/src/piper-tts.js");
      const synthesis = await speakLocally("火", packageId);
      const audioResponse = await fetch(synthesis.url);
      const audioBytes = (await audioResponse.arrayBuffer()).byteLength;
      URL.revokeObjectURL(synthesis.url);
      return {
        packageId,
        packageStatus: await store.getPiperResourceStatus(packageId),
        duration: synthesis.duration,
        audioContentType: audioResponse.headers.get("content-type"),
        audioBytes,
        phonemes: synthesis.phonemes,
        phonemeIds: synthesis.phonemeIds,
      };
    });
    expect(evidence).toMatchObject({
      packageId: "zh_CN-chaowen-medium",
      packageStatus: "completed",
      audioContentType: expect.stringMatching(/^audio\/(?:x-)?wav/i),
      phonemes: ["h", "uo", "3"],
      phonemeIds: [1, 14, 51, 66, 0, 2],
    });
    expect(evidence.duration).toBeGreaterThan(0);
    expect(evidence.audioBytes).toBeGreaterThan(1000);
    testInfo.annotations.push({ type: "local-chinese-piper-synthesis", description: JSON.stringify(evidence) });
    console.log(`[local-chinese-piper-synthesis] ${JSON.stringify(evidence)}`);
  });
});
