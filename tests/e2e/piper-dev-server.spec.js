import { test, expect } from "@playwright/test";

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
});
