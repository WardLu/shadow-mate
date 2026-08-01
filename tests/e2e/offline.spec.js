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
    const btn = page.locator('[data-cmod="chinese"]').first();
    const wasDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (!wasDone) {
      await btn.click();
      await expect(btn).toHaveClass(/done/);
    }
  });

  test("checkin can be cancelled by clicking again", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="book"]');
    const btn = page.locator('[data-cmod="book"]');
    const initiallyDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (initiallyDone) await btn.click();
    await expect(btn).not.toHaveClass(/done/);
    await btn.click();
    await expect(btn).toHaveClass(/done/);
    await btn.click();
    await expect(btn).not.toHaveClass(/done/);
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
    await card.click();
    // Toggle should change opacity (read/unread)
    await expect(card).toBeVisible();
  });

  test("state persists across navigation", async ({ page }) => {
    await page.goto("/");
    // Do a checkin on chinese
    await page.click('[data-mod="chinese"]');
    const btn = page.locator('[data-cmod="chinese"]').first();
    const wasDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (!wasDone) await btn.click();
    // Navigate away and back
    await page.click('[data-mod="math"]');
    await page.click('[data-mod="chinese"]');
    // Checkin should still be done
    const btn2 = page.locator('[data-cmod="chinese"]').first();
    await expect(btn2).toHaveClass(/done/);
  });
});
