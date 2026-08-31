import { test, expect } from "@playwright/test";
import { stat } from "node:fs/promises";

const FIXED_WRITING_TIME = new Date(2026, 7, 20, 9, 0, 0).getTime();
const EXPECTED_WRITING_GROUPS = ["木山中", "田土石", "天王马", "牛羊鸟"];

async function freezeWritingDate(page) {
  await page.addInitScript((fixedTime) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        if (args.length === 0) super(fixedTime);
        else super(...args);
      }

      static now() {
        return fixedTime;
      }
    }
    window.Date = FixedDate;
  }, FIXED_WRITING_TIME);
}

test.describe("Writing worksheet printing", () => {
  test("anonymous users print only the current writing worksheet on A4", async ({ page }, testInfo) => {
    await freezeWritingDate(page);
    await page.addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });
    await page.goto("/");
    await page.click('[data-mod="chinese"]');

    const screenPractice = page.locator("[data-writing-practice]");
    const screenCharacters = await screenPractice.locator(".tian").allTextContents();
    await expect(screenPractice).toBeVisible();
    await expect(screenPractice.locator(".write-grid")).toHaveText(EXPECTED_WRITING_GROUPS);

    await page.locator("[data-print]").click();
    await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);

    await page.emulateMedia({ media: "print" });
    const printSheet = page.locator("[data-writing-print-sheet]");
    await expect(printSheet).toBeVisible();
    await expect(printSheet).toContainText("今日写字字帖");
    await expect(printSheet).not.toContainText("第一单元");
    await expect(printSheet.locator(".tian")).toHaveText(screenCharacters);
    await expect(page.locator(".module-title")).toBeHidden();
    await expect(screenPractice).toBeHidden();
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".nav")).toBeHidden();
    await expect(page.locator(".site-footer")).toBeHidden();

    const pdfPath = testInfo.outputPath("writing-worksheet.pdf");
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
    expect((await stat(pdfPath)).size).toBeGreaterThan(0);

    await page.emulateMedia({ media: "screen" });
    await expect(screenPractice).toBeVisible();
    await expect(page.locator("[data-print]")).toBeVisible();

    await page.locator('[data-cmod="chinese-writing"]').click();
    await expect(page.locator('[data-cmod="chinese-writing"]')).toHaveClass(/done/);
    await page.reload();
    await page.click('[data-mod="chinese"]');
    await expect(page.locator("[data-writing-practice] .write-grid")).toHaveText(EXPECTED_WRITING_GROUPS);
    await expect(page.locator('[data-cmod="chinese-writing"]')).toHaveClass(/done/);
  });
});
