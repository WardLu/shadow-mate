import { test, expect } from "@playwright/test";

test.describe("Piper development asset", () => {
  test("serves the public module when Vite appends the import query", async ({ page }) => {
    const response = await page.request.get("/piper-tts-web.js?import");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("javascript");
  });

  test("serves the local speech worker runtimes", async ({ page }) => {
    for (const path of ["/worker/OnnxWebWorker.js", "/worker/PhonemizeWebWorker.js"]) {
      const response = await page.request.get(path);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("javascript");
    }
  });
});
