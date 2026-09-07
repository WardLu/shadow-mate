import { test, expect } from "@playwright/test";

async function installSpeechMocks(page) {
  await page.route("**/*manifest.json*", (route) => route.fulfill({ status: 503, body: "fallback" }));
  await page.addInitScript(() => {
    window.__speechUtterances = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        getVoices() {
          return [
            { lang: "zh-CN", name: "Ting-Ting" },
            { lang: "en-US", name: "Samantha" },
          ];
        },
        speak(utterance) {
          window.__speechUtterances.push({
            text: utterance.text,
            lang: utterance.lang,
          });
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
  });
}

test.describe("Child-friendly voice prompts across learning modules", () => {
  test.use({ serviceWorkers: "block" });

  test("supports tap-to-read on literacy mini-cards and poem title/author", async ({ page }) => {
    await installSpeechMocks(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');

    // 1. Click today's new character card
    const miniCard = page.locator('[data-hanzi-mini="0"]');
    await expect(miniCard).toBeVisible();
    await expect(miniCard.locator(".big")).toBeVisible();
    await expect(miniCard.locator(".py")).toBeVisible();
    await expect(miniCard.locator(".label")).toBeVisible();
    await miniCard.click();

    await expect.poll(async () => {
      return await page.evaluate(() => window.__speechUtterances.map((u) => u.text));
    }).toHaveLength(1);

    // Verify card layout is preserved and not overwritten with plain text or button markup
    await expect(miniCard.locator(".big")).toBeVisible();
    await expect(miniCard.locator(".py")).toBeVisible();
    await expect(miniCard.locator(".label")).toBeVisible();

    // 2. Click poem title
    const poemTitle = page.locator(".poem-title");
    await expect(poemTitle).toBeVisible();
    await poemTitle.click();

    await expect.poll(async () => {
      return await page.evaluate(() => window.__speechUtterances.map((u) => u.text));
    }).toHaveLength(2);

    const utterances = await page.evaluate(() => window.__speechUtterances.map((u) => u.text));
    expect(utterances[1]).toContain("古诗");
  });

  test("supports tap-to-read on writing worksheet items (visual, word, sentence, hint)", async ({ page }) => {
    await installSpeechMocks(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="chinese"]');

    const worksheet = page.locator('[data-writing-worksheet]');
    await expect(worksheet).toBeVisible();

    // Visual card tap
    const visual = worksheet.locator('.hanzi-visual[data-speech-tap]').first();
    await expect(visual).toBeVisible();
    await visual.click();
    await expect.poll(async () => page.evaluate(() => window.__speechUtterances.length)).toBe(1);

    // Example word tap
    const exampleWord = worksheet.locator('.hanzi-example-word[data-speech-tap]').first();
    await expect(exampleWord).toBeVisible();
    await exampleWord.click();
    await expect.poll(async () => page.evaluate(() => window.__speechUtterances.length)).toBe(2);

    // Sentence tap
    const sentence = worksheet.locator('.hanzi-sentence[data-speech-tap]').first();
    await expect(sentence).toBeVisible();
    await sentence.click();
    await expect.poll(async () => page.evaluate(() => window.__speechUtterances.length)).toBe(3);

    // Writing hint tap
    const hint = worksheet.locator('.hanzi-writing-hint[data-speech-tap]').first();
    await expect(hint).toBeVisible();
    await hint.click();
    await expect.poll(async () => page.evaluate(() => window.__speechUtterances.length)).toBe(4);

    // Meaning row tap
    const meaning = worksheet.locator('.hanzi-meaning[data-hanzi-meaning-row]').first();
    await expect(meaning).toBeVisible();
    await meaning.click();
    await expect.poll(async () => page.evaluate(() => window.__speechUtterances.length)).toBe(5);
  });

  test("provides read prompt buttons in math (number sense and sudoku)", async ({ page }) => {
    await installSpeechMocks(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="math"]');

    // Number sense read prompt
    const mathPrompts = page.locator('.btn-read-prompt');
    await expect(mathPrompts.first()).toBeVisible();
    await mathPrompts.first().click();

    await expect.poll(async () => {
      return (await page.evaluate(() => window.__speechUtterances.length));
    }).toBe(1);

    const firstUtterance = await page.evaluate(() => window.__speechUtterances[0].text);
    expect(firstUtterance).toContain("点击问号格");

    // Sudoku read prompt
    const sudokuPrompt = mathPrompts.nth(1);
    await expect(sudokuPrompt).toBeVisible();
    await sudokuPrompt.click();

    await expect.poll(async () => {
      return (await page.evaluate(() => window.__speechUtterances.length));
    }).toBe(2);

    const secondUtterance = await page.evaluate(() => window.__speechUtterances[1].text);
    expect(secondUtterance).toContain("把一到四填入每行每列");
  });

  test("provides read prompt button and past words playback in English", async ({ page }) => {
    await installSpeechMocks(page);
    await page.goto("/");
    await page.click('[data-mod="learning"]');
    await page.click('[data-go="english"]');

    // English prompt button
    const promptBtn = page.locator('.btn-read-prompt').first();
    await expect(promptBtn).toBeVisible();
    await promptBtn.click();

    await expect.poll(async () => {
      return (await page.evaluate(() => window.__speechUtterances.length));
    }).toBe(1);

    // Past word chip
    const chip = page.locator('.mr-chip[data-word]').first();
    await expect(chip).toBeVisible();
    await chip.click();

    await expect.poll(async () => {
      return (await page.evaluate(() => window.__speechUtterances.length));
    }).toBe(2);
  });

  test("renders updated guide page with speech, growth loop and sound sections", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="guide"]');

    await expect(page.locator('[data-guide-section="speech-features"]')).toBeVisible();
    await expect(page.locator('[data-guide-section="growth-loop"]')).toBeVisible();
    await expect(page.locator('[data-guide-section="sound-settings"]')).toBeVisible();
    await expect(page.locator(".guide-page")).toContainText("确认兑现");
  });
});
