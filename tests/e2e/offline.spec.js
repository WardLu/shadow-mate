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

  test("footer exposes social links and the WeChat QR dialog", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-footer")).toBeVisible();
    await expect(page.locator('a[href="https://www.shadow.wang/"]')).toHaveAttribute("target", "_blank");
    await expect(page.locator(".site-footer-links > .site-footer-link").first()).toContainText("Shadow Nexus");
    await expect(page.locator('a[href="/privacy"]')).toHaveAttribute("target", "_blank");
    await expect(page.locator('a[href="https://xhslink.cn/m/4W1NWyRrxv5"]')).toBeVisible();
    await expect(page.locator('a[href="https://v.douyin.com/1y06PMohfoE/"]')).toBeVisible();
    await expect(page.locator('a[href="https://x.com/Gollumgulu"]')).toHaveAccessibleName("打开 X");
    await expect(page.locator('a[href^="mailto:support@shadow.wang"]')).toHaveAccessibleName("发送问题反馈邮件至 support@shadow.wang");

    await page.locator("#wechatButton").click();
    await expect(page.locator("#wechatDialog")).toBeVisible();
    await expect(page.locator("#wechatDialog img")).toHaveAttribute("src", "/brand_assets/wechat-public-account.jpg");
    await expect(page.locator("#wechatDialog img")).toHaveAttribute("alt", "微信公众号二维码");
    await page.locator("#wechatDialogClose").click();
    await expect(page.locator("#wechatDialog")).toBeHidden();
    await expect(page.locator("#wechatButton")).toBeFocused();
  });

  test("local privacy route serves the standalone policy page", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.headers()["content-type"]).toContain("text/html");
    await expect(page).toHaveTitle("影伴隐私说明");
    await expect(page.locator("#zh .language-title")).toContainText("隐私说明");
    await expect(page.locator("#en")).toBeVisible();
    await expect(page.locator('link[rel="stylesheet"][href="/privacy-policy.css"]')).toHaveCount(1);
    await expect(page.locator(".brand")).toHaveAttribute("href", "/");
    await expect(page.locator(".back-link")).toHaveAttribute("href", "/");
  });

  test("night mode keeps page surfaces and text readable", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 28, 20)");
    await expect(page.locator(".card").first()).toHaveCSS("background-color", "rgb(24, 39, 29)");
    await expect(page.locator(".card h3").first()).toHaveCSS("color", "rgb(238, 247, 239)");
    await expect(page.locator(".card .desc").first()).toHaveCSS("color", "rgb(173, 193, 178)");
  });

  test("night mode gives interactive and guide surfaces the same dark treatment", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await page.click('[data-mod="math"]');
    await expect(page.locator(".lvl-btn").nth(1)).toHaveCSS("background-color", "rgb(24, 39, 29)");
    await expect(page.locator(".lvl-btn").first()).toHaveCSS("background-color", "rgb(26, 56, 36)");
    await expect(page.locator(".num-cell.miss")).toHaveCSS("background-color", "rgb(24, 39, 29)");

    await page.click('[data-mod="guide"]');
    await expect(page.locator(".guide-card").first()).toHaveCSS("background-color", "rgb(24, 39, 29)");
  });

  test("night mode keeps the account dialog readable", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.click("#accountButton");

    await expect(page.locator("#cloudDialog")).toHaveCSS("background-color", "rgb(24, 39, 29)");
    await expect(page.locator("#cloudDialog input").first()).toHaveCSS("background-color", "rgb(18, 34, 24)");
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
        value: { cancel() {}, speak(utterance) { calls.push(utterance.text); }, getVoices() { return [{ lang: "en-US" }]; } },
      });
    });
    await page.goto("/");
    await page.click('[data-mod="english"]');
    const word = await page.locator(".word-en").first().textContent();
    await page.locator("[data-speak]").first().click();
    await expect.poll(() => page.evaluate(() => window.__speechCalls)).toEqual([word]);
  });

  test("speech button offers local offline voice when system has no usable voice", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: function SpeechSynthesisUtterance() {} });
    });
    await page.click('[data-mod="english"]');
    const button = page.locator("[data-speak]").first();
    await button.click();
    await expect(page.locator("#shadow-voice-dialog[open]")).toBeVisible();
    await expect(page.locator("#shadow-voice-dialog .voice-dialog-title")).toContainText("离线英语语音");
    await page.click('.voice-dialog-actions [data-action="cancel"]');
    await expect(page.locator("#shadow-voice-dialog")).toBeHidden();
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

  test("growth and points calendars explain their status colors", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".banner .d")).toContainText("/4");
    await page.click('[data-mod="grow"]');
    await expect(page.locator(".cal-legend")).toContainText("未打卡");
    await expect(page.locator(".cal-legend")).toContainText("4/4");
    await expect(page.locator(".cal-cell.today")).toBeVisible();

    await page.click('[data-mod="points"]');
    await expect(page.locator(".cal")).toHaveCSS("display", "grid");
    await expect(page.locator(".cal-legend + .cal")).toHaveCSS("margin-top", "12px");
    await expect(page.locator(".cal-legend")).toContainText("有加分");
    await expect(page.locator(".cal-legend")).toContainText("有扣分");
    await expect(page.locator(".cal-legend")).toContainText("当前选中");
    await expect(page.locator(".cal-chip.active")).toHaveAttribute("aria-pressed", "true");

    await page.locator(".pts-toggle").first().click();
    await expect(page.locator(".cal-chip.active")).toHaveClass(/pos/);
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
    await expect(logRow.locator(".log-stars .ui-icon")).toHaveCount(5);
    await expect(logRow.locator('.log-stars .ui-icon[fill="currentColor"]')).toHaveCount(5);
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
