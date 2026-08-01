import { test, expect } from "@playwright/test";

test.describe("Offline mode (no login)", () => {
  test("app loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("影伴");
  });

  test("home page shows banner and stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".banner")).toBeVisible();
    await expect(page.locator(".stat-grid .stat")).toHaveCount(4);
  });

  test("login button is visible", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator("#accountButton");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("登录");
  });

  test("cloud error toast stays visible inside the open account dialog", async ({ page }) => {
    await page.goto("/");
    await page.route("**/auth/v1/otp**", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_request", error_description: "测试失败" }),
      });
    });
    await page.click("#accountButton");
    await page.fill('#emailLoginForm input[name="email"]', "test@example.com");
    await page.click('#emailLoginForm button[type="submit"]');
    const toast = page.locator("#syncToast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveClass(/in-dialog/);
    await expect(toast.evaluate((element) => element.parentElement?.id)).resolves.toBe("cloudPanel");
  });

  test("navigation switches between modules", async ({ page }) => {
    await page.goto("/");
    for (const [mod, label] of [
      ["chinese", "语文"],
      ["math", "数学"],
      ["english", "英语"],
      ["book", "绘本"],
      ["points", "积分"],
      ["grow", "成长"],
    ]) {
      await page.click(`[data-mod="${mod}"]`);
      await page.waitForSelector(".module-title h2",{timeout:5000});
      await expect(page.locator(".module-title h2")).toContainText(label);
    }
  });

  test("usage guide explains setup and speech downloads", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="guide"]');
    await expect(page.locator(".guide-page")).toBeVisible();
    await expect(page.locator(".guide-page h2")).toContainText("使用指南");
    await expect(page.locator('[data-guide-section="speech"]')).toContainText("听发音");
    await expect(page.locator('[data-guide-section="speech"] a[href*="support.microsoft.com"]')).toBeVisible();
    await expect(page.locator('[data-guide-section="speech"] a[href*="support.apple.com"]').first()).toBeVisible();
    await expect(page.locator('[data-guide-section="speech"] a[href*="support.google.com"]')).toBeVisible();
    await expect(page.locator('[data-guide-section="sync"]')).toContainText("按孩子分别同步");
  });

  test("speech button sends the displayed word to the browser speech API", async ({ page }) => {
    await page.addInitScript(() => {
      const calls = [];
      Object.defineProperty(window, "__speechCalls", { value: calls, writable: false });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance(text) { this.text = text; },
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { cancel() {}, speak(utterance) { calls.push(utterance.text); } },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="english"]');
    const word = await page.locator(".word-en").first().textContent();
    await page.locator("[data-speak]").first().click();
    await expect.poll(() => page.evaluate(() => window.__speechCalls)).toEqual([word]);
  });

  test("speech button explains when Windows has no usable voice", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const synth = window.speechSynthesis;
      Object.defineProperty(synth, "speak", { configurable: true, value() {} });
      Object.defineProperty(synth, "getVoices", { configurable: true, value() { return []; } });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: function SpeechSynthesisUtterance() {} });
    });
    await page.click('[data-mod="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();
    await expect(button).toContainText("安装英语语音");
    await expect(page.locator("[data-speech-guide]")).toBeVisible();
    await page.click("[data-speech-guide]");
    await expect(page.locator(".guide-page")).toBeVisible();
  });

  test("number sense keeps exactly one missing number in sequence", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="math"]');
    const cells = await page.locator(".num-grid .num-cell").allTextContents();
    const missingIndex = cells.indexOf("?");
    expect(missingIndex).toBeGreaterThan(0);
    expect(missingIndex).toBeLessThan(cells.length - 1);
    expect(Number(cells[missingIndex + 1])).toBe(Number(cells[missingIndex - 1]) + 2);
  });

  test("checkin marks module as done", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="chinese"]');
    const btn = page.locator('[data-cmod="chinese-literacy"]');
    const wasDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (!wasDone) {
      await btn.click();
      await expect(btn).toHaveClass(/done/);
    }
  });

  test("checkin can be cancelled by clicking again", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="book"]');
    const btn = page.locator('[data-cmod="book-reading"]');
    const initiallyDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (initiallyDone) await btn.click();
    await expect(btn).not.toHaveClass(/done/);
    await btn.click();
    await expect(btn).toHaveClass(/done/);
    await btn.click();
    await expect(btn).not.toHaveClass(/done/);
  });

  test("cancelling one checkin does not cancel other tasks in the module", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="chinese"]');
    const buttons = page.locator('[data-cmod^="chinese-"]');
    await expect(buttons).toHaveCount(3);
    for (const button of await buttons.all()) {
      if (await button.evaluate((el) => el.classList.contains("done"))) await button.click();
    }
    await buttons.first().click();
    await expect(buttons.first()).toHaveClass(/done/);
    await expect(buttons.nth(1)).not.toHaveClass(/done/);
    await expect(buttons.nth(2)).not.toHaveClass(/done/);
    await buttons.first().click();
    await expect(buttons.first()).not.toHaveClass(/done/);
  });

  test("points toggle changes card state", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');
    const toggle = page.locator(".pts-toggle").first();
    await expect(toggle).toBeVisible();
    const card = page.locator(".pts-card").first();
    const wasDone = await card.evaluate((el) => el.classList.contains("done"));
    await toggle.click();
    if (wasDone) {
      await expect(card).not.toHaveClass(/done/);
    } else {
      await expect(card).toHaveClass(/done/);
    }
  });

  test("math quiz shows feedback", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="math"]');
    await expect(page.locator("#qq")).toBeVisible();
    await page.fill("#qa", "999");
    await page.click("#qsubmit");
    const feedback = page.locator("#qf");
    await expect(feedback).not.toBeEmpty();
  });

  test("book shelf marks read status", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="book"]');
    const card = page.locator("[data-bk]").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS("opacity", "0.55");
    await card.click();
    await expect(card).toHaveCSS("opacity", "1");
    await card.click();
    await expect(card).toHaveCSS("opacity", "0.55");
  });

  test("reading log can be added and deleted", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="book"]');
    await page.fill("#pbTitle", "E2E Test Book");
    await page.locator('.pstar[data-n="5"]').click();
    await page.click("#pbAdd");

    const logRow = page.locator(".log-row").first();
    await expect(logRow).toContainText("E2E Test Book");
    await expect(logRow.locator(".log-stars")).toContainText("★★★★★");
    await logRow.locator("[data-del]").click();
    await expect(page.locator(".log-row")).toHaveCount(0);
  });

  test("points can be cleared for the current month", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');
    const toggle = page.locator(".pts-toggle").first();
    const card = page.locator(".pts-card").first();
    await toggle.click();
    await expect(card).toHaveClass(/done/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#ptclear");
    await expect(card).not.toHaveClass(/done/);
  });

  test("state persists across navigation", async ({ page }) => {
    await page.goto("/");
    // Do a checkin on chinese
    await page.click('[data-mod="chinese"]');
    const btn = page.locator('[data-cmod="chinese-literacy"]');
    const wasDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (!wasDone) await btn.click();
    // Navigate away and back
    await page.click('[data-mod="math"]');
    await page.click('[data-mod="chinese"]');
    // Checkin should still be done
    const btn2 = page.locator('[data-cmod="chinese-literacy"]');
    await expect(btn2).toHaveClass(/done/);
  });

  test("state persists across a reload", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="chinese"]');
    const btn = page.locator('[data-cmod="chinese-literacy"]');
    if (!(await btn.evaluate((el) => el.classList.contains("done")))) await btn.click();
    await page.reload();
    await page.click('[data-mod="chinese"]');
    await expect(page.locator('[data-cmod="chinese-literacy"]')).toHaveClass(/done/);
  });
});
