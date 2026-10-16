import { test, expect } from "@playwright/test";
import { openParentArea } from "./helpers/parent-gate.js";
import { openSection } from "./helpers/sections.js";

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

test.describe("Child-friendly math interactions", () => {
  test.use({ serviceWorkers: "block" });

  test("keeps mental arithmetic inside the selected package range", async ({ page }) => {
    await page.goto("/");
    for (const [packageId, maximum] of [["foundation-v2", 5], ["bridging-v1", 10]]) {
      await page.click('[data-mod="learning"]');
      await openParentArea(page, '[data-go-settings="learning"]');
      await page.locator(`[data-package-toggle="${packageId}"]`).check();
      for (const id of ["foundation-v2", "bridging-v1"]) {
        if (id !== packageId) {
          await page.locator(`[data-package-toggle="${id}"]`).uncheck();
        }
      }
      await page.click('[data-mod="learning"]');
      await page.click('[data-go="math"]');
      await expect(page.locator(".lvl-btn[data-lvl]")).toHaveText(
        packageId === "foundation-v2" ? ["5以内", "10以内"] : ["5以内", "10以内", "20以内"],
      );
      for (let attempt = 0; attempt < 6; attempt++) {
        await expect(page.locator(".card h3").filter({ hasText: "口算打卡" })).toContainText(`${maximum} 以内`);
        const match = (await page.locator("#qq").innerText()).match(/(\d+)\s*([+\-−])\s*(\d+)/);
        expect(match).toBeTruthy();
        const left = Number(match[1]);
        const right = Number(match[3]);
        const answer = match[2] === "+" ? left + right : left - right;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeGreaterThanOrEqual(0);
        expect(left).toBeLessThanOrEqual(maximum);
        expect(right).toBeLessThanOrEqual(maximum);
        expect(answer).toBeGreaterThanOrEqual(0);
        expect(answer).toBeLessThanOrEqual(maximum);
        await page.locator(`.lvl-btn[data-lvl="${maximum}"]`).click();
      }
    }
  });

  test("plays a mental-math question from CDN fragments without Web Speech API", async ({ page }) => {
    await page.addInitScript(() => {
      window.__publishedAudioPlays = 0;
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
      Object.defineProperty(window, "Audio", {
        configurable: true,
        value: class AudioMock {
          play() {
            window.__publishedAudioPlays += 1;
            queueMicrotask(() => this.onended?.());
            return Promise.resolve();
          }
          pause() {}
          remove() {}
        },
      });
    });
    const entry = (contentId) => ({ contentId, url: `https://voice.test/${encodeURIComponent(contentId)}.mp3` });
    const entries = [
      ...Array.from({ length: 101 }, (_, number) => entry(`math:number-${String(number).padStart(3, "0")}`)),
      entry("math:operator-plus"),
      entry("math:operator-minus"),
      entry("math:question-result"),
    ];
    await page.route("**/tts/tencent-v1-manifest.json", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries }),
    }));
    await page.route("https://voice.test/**", (route) => route.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from([0x49, 0x44, 0x33, 1]),
    }));
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="math"]');

    await page.locator(".btn-read-q").click();

    await expect.poll(() => page.evaluate(() => window.__publishedAudioPlays)).toBe(4);
    await expect(page.locator(".btn-read-q")).not.toHaveAttribute("data-speech-failure", "true");
  });

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
    await openSection(page, "section-math-sequence");

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
