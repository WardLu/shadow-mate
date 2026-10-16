import { expect } from "@playwright/test";

// 学科、积分、成长页用分段页签一次只显示一个分区；断言分区内容前先切到对应页签。
export async function openSection(page, sectionId) {
  const tab = page.locator(`[data-target-section="${sectionId}"]`);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#${sectionId}`)).toBeVisible();
}
