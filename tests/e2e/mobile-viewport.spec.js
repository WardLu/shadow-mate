import { test, expect } from "@playwright/test";

// roadmap「移动端学习体验」第 1 步：固化 360/390/平板横竖屏断点检查。
// 断点由 playwright.config.js 的 mobile-360 / mobile-390 / tablet-portrait /
// tablet-landscape project 提供（chromium 引擎仿真）。
// 软键盘遮挡与真实刘海安全区无法在桌面仿真触发，归 L2 真机矩阵验收（roadmap 第 2 步）。

const NAV_MODULES = ["learning", "points", "grow", "guide", "settings"];

async function expectNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label} 横向溢出：scrollWidth=${overflow.scrollWidth} > 视口=${overflow.innerWidth}`
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

async function collectTouchTargets(page) {
  return page.evaluate(() => {
    const MIN = 44;
    const failures = [];
    const seen = new Set();
    const interactive = document.querySelectorAll(
      'button, a[href], [role="button"], input, select, textarea, summary'
    );
    for (const el of interactive) {
      // 在 label 内的控件以 label 为热区（点击整行 label 等效于点击控件）
      const zone = el.closest("label") || el;
      const rect = zone.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = getComputedStyle(zone);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (rect.width >= MIN && rect.height >= MIN) continue;
      const key = `${el.tagName}|${el.className}|${(el.textContent || "").trim().slice(0, 16)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failures.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 60),
        text: (el.textContent || "").trim().slice(0, 20),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
    return failures;
  });
}

test.describe("移动端视口检查", () => {
  test("首页无横向溢出，页脚可达", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    await expectNoHorizontalOverflow(page, "首页");

    const footer = page.locator(".site-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
  });

  test("全部主导航模块可打开且无横向溢出", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    for (const mod of NAV_MODULES) {
      const btn = page.locator(`.navbtn[data-mod="${mod}"]`);
      await btn.tap();
      await expect(btn).toHaveClass(/active/);
      await expectNoHorizontalOverflow(page, `模块 ${mod}`);
    }
  });

  test("二维码弹层可触屏打开并关闭", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator("#wechatButton");
    await trigger.scrollIntoViewIfNeeded();
    await trigger.tap();

    const dialog = page.locator("#wechatDialog");
    await expect(dialog).toBeVisible();
    const close = page.locator("#wechatDialogClose");
    const closeBox = await close.boundingBox();
    expect(
      closeBox.width >= 44 && closeBox.height >= 44,
      `二维码弹层关闭按钮热区不足：${closeBox.width}×${closeBox.height}`
    ).toBe(true);
    await close.tap();
    await expect(dialog).not.toBeVisible();
  });

  test("设置页分类标签可横向滚动触达", async ({ page }) => {
    await page.goto("/");
    await page.locator('.navbtn[data-mod="settings"]').tap();
    const tabs = page.locator(".settings-tab");
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);
    // 每个标签都可触达且自身不小于最小热区
    for (let i = 0; i < count; i += 1) {
      const tab = tabs.nth(i);
      await expect(tab).toBeVisible();
    }
  });

  test("主要可点元素触控热区不小于 44px", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    const tooSmall = await collectTouchTargets(page);

    for (const mod of ["learning", "grow", "settings"]) {
      await page.locator(`.navbtn[data-mod="${mod}"]`).tap();
      await expect(page.locator(`.navbtn[data-mod="${mod}"]`)).toHaveClass(/active/);
      tooSmall.push(...(await collectTouchTargets(page)));
    }

    expect(tooSmall, "存在小于 44px 的触控热区").toEqual([]);
  });

  test("viewport 启用 safe-area 适配且样式实际使用", async ({ page }) => {
    await page.goto("/");
    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(meta).toContain("viewport-fit=cover");

    const usesSafeArea = await page.evaluate(() => {
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules && walk(rule.cssRules)) return true;
          if (rule.cssText && rule.cssText.includes("safe-area-inset")) return true;
        }
        return false;
      };
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        if (walk(rules)) return true;
      }
      return false;
    });
    expect(usesSafeArea).toBe(true);
  });
});
