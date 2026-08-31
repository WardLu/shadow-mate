import { test, expect } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-01T02:00:00.000Z");
const TIME_ZONE = "Asia/Singapore";

test.use({ timezoneId: TIME_ZONE });

async function openChineseAtFixedTime(page) {
  await page.clock.install({ time: new Date("2026-09-01T01:59:00.000Z") });
  await page.goto("/");
  await page.locator('.navbtn[data-mod="chinese"]').click();
  await expect(page.locator("[data-writing-worksheet]")).toBeVisible();
  await page.clock.pauseAt(FIXED_NOW);
}

async function readPrintSnapshot(page) {
  return page.evaluate(() => {
    const readRows = (root) => [...root.querySelectorAll("[data-writing-row]")].map((row) => ({
      rowId: row.dataset.writingRowId,
      itemId: row.dataset.writingItemId,
      glyph: row.querySelector("[data-writing-glyph]")?.textContent,
      pinyin: row.querySelector("[data-writing-pinyin]")?.textContent,
      exampleWord: row.querySelector("[data-writing-example-word]")?.textContent,
    }));
    const screen = document.querySelector("[data-writing-worksheet]");
    const print = document.querySelector("[data-writing-print-sheet]");
    return {
      screen: {
        assignmentId: screen?.dataset.writingAssignmentId,
        dayKey: screen?.dataset.writingDayKey,
        packVersion: screen?.dataset.writingPackVersion,
        rows: readRows(screen),
      },
      print: {
        assignmentId: print?.dataset.writingAssignmentId,
        dayKey: print?.dataset.writingDayKey,
        packVersion: print?.dataset.writingPackVersion,
        rows: readRows(print),
      },
      state: window.learningDesk.getState(),
    };
  });
}

test.describe("Snapshot-only Hanzi print sheet", () => {
  test("mocks window.print without changing state or creating completion", async ({ page }) => {
    await openChineseAtFixedTime(page);
    const before = await readPrintSnapshot(page);
    await page.evaluate(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });

    await page.locator("[data-print]").click();
    await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);

    const after = await readPrintSnapshot(page);
    expect(after).toEqual(before);
    expect(after.print).toEqual(after.screen);
    const assignment = after.state.extra.hanziWorksheetRotationV1.assignments[after.screen.dayKey];
    expect(assignment.completions).toEqual({});
  });

  test("shows only the print sheet in print media", async ({ page }) => {
    await openChineseAtFixedTime(page);
    await page.emulateMedia({ media: "print" });

    await expect(page.locator("[data-writing-print-sheet]")).toBeVisible();
    await expect(page.locator(".app")).toBeHidden();
    await expect(page.locator(".nav")).toBeHidden();
    await expect(page.locator("[data-writing-worksheet]")).toBeHidden();
    await expect(page.locator('[data-cmod="chinese-writing"]')).toBeHidden();
    await expect(page.locator("[data-writing-print-sheet] button")).toHaveCount(0);

    const visibleBodyChildren = await page.evaluate(() => [...document.body.children]
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.id || element.className));
    expect(visibleBodyChildren).toEqual(["writingPrintRoot"]);

    const snapshot = await readPrintSnapshot(page);
    expect(snapshot.print).toEqual(snapshot.screen);
  });
});
