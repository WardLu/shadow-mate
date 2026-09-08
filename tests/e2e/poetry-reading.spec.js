import { test, expect } from "@playwright/test";

async function installSystemSpeech(page, voices = [{ lang: "zh-CN", name: "Ting-Ting" }]) {
  await page.route("**/tts/tencent-v1-manifest.json", (route) => route.fulfill({ status: 503, body: "test-system-fallback" }));
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
          setTimeout(() => utterance.onend?.(), 30);
        },
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: function SpeechSynthesisUtterance(text) {
        this.text = text;
        this.lang = "zh-CN";
      },
    });
  }, voices);
}

test.describe("Ancient poetry interactive reading", () => {
  test.use({ serviceWorkers: "block" });

  test("renders poem with interactive clickable lines and reads single line on tap", async ({ page }) => {
    await installSystemSpeech(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');

    const poemBox = page.locator(".poem-box");
    await expect(poemBox).toBeVisible();

    const lines = poemBox.locator(".poem-line");
    const lineCount = await lines.count();
    expect(lineCount).toBeGreaterThanOrEqual(2);

    // Click the first line to read it
    const firstLine = lines.first();
    await firstLine.click();
    await expect(firstLine).toHaveClass(/hi/);

    // Click the second line, second line should be highlighted while first loses highlight
    const secondLine = lines.nth(1);
    await secondLine.click();
    await expect(secondLine).toHaveClass(/hi/);
    await expect(firstLine).not.toHaveClass(/hi/);
  });

  test("reads entire poem sequentially and shows praise on completion", async ({ page }) => {
    await installSystemSpeech(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');

    const poemBox = page.locator(".poem-box");
    await expect(poemBox).toBeVisible();

    const readAllBtn = poemBox.locator(".poem-read-all");
    await expect(readAllBtn).toBeVisible();
    await readAllBtn.click();

    // Verify speaking state or praise appears after completion
    await expect(readAllBtn).toBeDisabled();
    // After sequence completes, read-all button re-enables
    await expect(readAllBtn).toBeEnabled({ timeout: 15000 });
    // Praise celebration appears
    await expect(page.locator(".big-praise")).toHaveText("念得真好！");
  });
});
