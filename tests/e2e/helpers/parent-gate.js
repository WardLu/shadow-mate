import { expect } from "@playwright/test";

// 点击进入家长区的入口；儿童模式下会弹出长按门禁，这里把长按时长缩短后完成解锁。
// 真实 3 秒长按由 offline.spec.js 单独覆盖。
export async function openParentArea(page, trigger = '[data-mod="settings"]') {
  await page.evaluate(() => { window.__SM_PARENT_GATE_MS__ = 30; });
  await page.locator(trigger).click();
  const gate = page.locator("#parentGateDialog");
  if (await gate.isVisible()) {
    await page.locator("#holdUnlockBtn").dispatchEvent("pointerdown");
    await expect(gate).toBeHidden();
  }
  await expect(page.locator("body")).toHaveClass(/parent-mode/);
}

// 使用指南与「关于与反馈」都收在家长区分类里。
export async function openParentTab(page, tab) {
  await openParentArea(page);
  await page.locator(`.settings-tab[data-tab="${tab}"]`).click();
  await expect(page.locator(`.settings-tab[data-tab="${tab}"]`)).toHaveAttribute("aria-selected", "true");
}
