import { test, expect } from "@playwright/test";

async function installSystemSpeech(page, voices = [{ lang: "zh-CN", name: "Ting-Ting" }]) {
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

test.describe("Child-friendly math interactions", () => {
  test.use({ serviceWorkers: "block" });

  test("provides spoken question button for mental math", async ({ page }) => {
    await installSystemSpeech(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="math"]');

    const readQBtn = page.locator(".btn-read-q");
    await expect(readQBtn).toBeVisible();
    await readQBtn.click();

    // Verify utterance was queued
    await expect.poll(async () => {
      return page.evaluate(() => (window.__speechUtterances || []).length);
    }).toBeGreaterThanOrEqual(1);

    const spoken = await page.evaluate(() => window.__speechUtterances[0]);
    expect(spoken.text).toContain("等于几");
  });

  test("submitting correct mental math answer triggers praise celebration", async ({ page }) => {
    await installSystemSpeech(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="math"]');

    // Read question and calculate answer
    const qText = await page.locator("#qq").innerText();
    const match = qText.match(/(\d+)\s*([+\-−])\s*(\d+)/);
    expect(match).toBeTruthy();
    const a = Number(match[1]);
    const b = Number(match[3]);
    const ans = match[2] === "+" ? a + b : a - b;

    await page.fill("#qa", String(ans));
    await page.click("#qsubmit");

    await expect(page.locator(".feedback.ok")).toBeVisible();
    await expect(page.locator(".big-praise")).toHaveText("答对啦！");
  });

  test("number sense replaces prompt with inline keypad and validates choice", async ({ page }) => {
    await installSystemSpeech(page);
    let promptCalled = false;
    page.on("dialog", () => { promptCalled = true; });

    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="math"]');

    const missCell = page.locator(".num-cell.miss");
    await expect(missCell).toBeVisible();
    const expectedNum = await missCell.getAttribute("data-num");

    // Click missing cell
    await missCell.click();

    // Verify browser prompt was NOT called
    expect(promptCalled).toBe(false);

    // Verify inline math-pad appeared with candidate buttons
    const mathPad = page.locator("#mathPad");
    await expect(mathPad).toBeVisible();

    const correctBtn = mathPad.locator(`.math-pad-btn[data-val="${expectedNum}"]`);
    await expect(correctBtn).toBeVisible();
    await correctBtn.click();

    // Verify success state
    await expect(page.locator("#nf")).toHaveClass(/ok/);
    await expect(missCell).toHaveClass(/found/);
    await expect(mathPad).toBeHidden();
    await expect(page.locator(".big-praise")).toHaveText("太棒了！");
  });
});
