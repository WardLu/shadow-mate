import { test, expect } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-01T02:00:00.000Z");
const TIME_ZONE = "Asia/Singapore";
const CSS_PX_PER_MM = 96 / 25.4;
const A4_PORTRAIT_HEIGHT_PX = 297 * CSS_PX_PER_MM;

test.use({ timezoneId: TIME_ZONE });

async function openLearningModule(page, module) {
  await page.locator('.navbtn[data-mod="learning"]').click();
  const moduleCard = page.locator(`[data-go="${module}"]`);
  await expect(moduleCard).toBeVisible();
  await moduleCard.click();
}

async function openChineseAtFixedTime(page) {
  await page.clock.install({ time: new Date("2026-09-01T01:59:00.000Z") });
  await page.goto("/");
  await openLearningModule(page, "chinese");
  await expect(page.locator("[data-writing-worksheet]")).toBeVisible();
  await page.clock.pauseAt(FIXED_NOW);
}

async function expectRichLearningCards(root, { includeSpeech = false } = {}) {
  const cards = root.locator("[data-hanzi-learning-card]");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-visual]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-example-words]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-sentence]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-writing-hint]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-glyph]")).toHaveCount(4);
  await expect(cards.locator("[data-writing-pinyin]")).toHaveCount(4);
  await expect(cards.locator("[data-writing-grid]")).toHaveCount(4);
  await expect(cards.locator("[data-writing-grid] .writing-cell")).toHaveCount(20);

  expect(await cards.evaluateAll((elements) => elements.map((card) => ({
    visual: card.querySelectorAll("[data-hanzi-visual]").length,
    word: Boolean(card.querySelector("[data-hanzi-example-word]")?.textContent?.trim()),
    target: Boolean(card.querySelector("[data-hanzi-glyph]")?.textContent?.trim()),
    pinyin: Boolean(card.querySelector("[data-writing-pinyin]")?.textContent?.trim()),
    sentence: Boolean(card.querySelector("[data-hanzi-sentence]")?.textContent?.trim()),
    writingHint: Boolean(card.querySelector("[data-hanzi-writing-hint]")?.textContent?.trim()),
    gridCells: card.querySelectorAll("[data-writing-grid] .writing-cell").length,
  })))).toEqual(Array.from({ length: 4 }, () => ({
    visual: 1,
    word: true,
    target: true,
    pinyin: true,
    sentence: true,
    writingHint: true,
    gridCells: 5,
  })));

  if (includeSpeech) {
    await expect(cards.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]')).toHaveCount(4);
    await expect(cards.locator('[data-hanzi-speak][data-speech-locale="en-US"]')).toHaveCount(4);
  }
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
        packId: screen?.dataset.writingPackId,
        packVersion: screen?.dataset.writingPackVersion,
        rows: readRows(screen),
      },
      print: {
        assignmentId: print?.dataset.writingAssignmentId,
        dayKey: print?.dataset.writingDayKey,
        packId: print?.dataset.writingPackId,
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
    await expectRichLearningCards(page.locator("[data-writing-worksheet]"), { includeSpeech: true });
    await expectRichLearningCards(page.locator("[data-writing-print-sheet]"));
    const before = await readPrintSnapshot(page);
    expect(before.screen).toMatchObject({
      dayKey: "2026-09-01",
      packId: "hanzi-writing-v2",
      packVersion: "hanzi-v2-pilot-1",
    });
    expect(before.screen.rows).toHaveLength(4);
    expect(before.print).toEqual(before.screen);
    await page.evaluate(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });

    await page.clock.setFixedTime(new Date("2026-09-02T02:00:00.000Z"));
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
    await expectRichLearningCards(page.locator("[data-writing-worksheet]"), { includeSpeech: true });
    await page.setViewportSize({
      width: Math.round(210 * CSS_PX_PER_MM),
      height: Math.round(A4_PORTRAIT_HEIGHT_PX),
    });
    await page.emulateMedia({ media: "print" });

    await expect(page.locator("[data-writing-print-sheet]")).toBeVisible();
    await expectRichLearningCards(page.locator("[data-writing-print-sheet]"));
    await expect(page.locator(".app")).toBeHidden();
    await expect(page.locator(".nav")).toBeHidden();
    await expect(page.locator("[data-writing-worksheet]")).toBeHidden();
    await expect(page.locator('[data-cmod="chinese-writing"]')).toBeHidden();
    await expect(page.locator("[data-writing-print-sheet] button")).toHaveCount(0);

    const visibleBodyChildren = await page.evaluate(() => [...document.body.children]
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.id || element.className));
    expect(visibleBodyChildren).toEqual(["writingPrintRoot"]);

    const printModel = await page.evaluate(() => {
      const pageRules = [];
      const visitRules = (rules) => {
        for (const rule of rules || []) {
          if (rule.constructor?.name === "CSSPageRule" || /^@page\b/i.test(rule.cssText || "")) {
            pageRules.push(rule.cssText);
          }
          if (rule.cssRules) visitRules(rule.cssRules);
        }
      };
      for (const styleSheet of document.styleSheets) {
        try {
          visitRules(styleSheet.cssRules);
        } catch {
          // Cross-origin stylesheets are outside this local app's print contract.
        }
      }
      const sheet = document.querySelector("[data-writing-print-sheet]");
      const style = getComputedStyle(sheet);
      const sheetRect = sheet.getBoundingClientRect();
      const cards = [...sheet.querySelectorAll("[data-hanzi-learning-card]")].map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
        };
      });
      return {
        pageRules,
        cssSource: [...document.querySelectorAll('link[rel="stylesheet"]')]
          .find((link) => link.href.endsWith("/src/app.css"))?.href || "",
        boxSizing: style.boxSizing,
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        minHeight: parseFloat(style.minHeight),
        sheetTop: sheetRect.top,
        sheetBottom: sheetRect.bottom,
        sheetHeight: sheetRect.height,
        sheetScrollHeight: sheet.scrollHeight,
        cards,
      };
    });
    const printCssSource = printModel.cssSource
      ? await page.evaluate((href) => fetch(href).then((response) => response.text()), printModel.cssSource)
      : "";
    expect(printCssSource).toMatch(/@page\s*\{\s*size:\s*A4\s+portrait;\s*margin:\s*0;/i);
    expect(printModel.pageRules.join("\n")).toMatch(/size:\s*a4\b/i);
    expect(printModel.pageRules.join("\n")).toMatch(/margin:\s*0/i);
    expect(printModel.boxSizing).toBe("border-box");
    expect(printModel.paddingTop).toBeCloseTo((12 * 96) / 25.4, 0);
    expect(printModel.minHeight).toBeCloseTo((297 * 96) / 25.4, 0);
    expect(printModel.cards).toHaveLength(4);
    expect(printModel.sheetHeight).toBeLessThanOrEqual(A4_PORTRAIT_HEIGHT_PX + 1);
    expect(printModel.sheetScrollHeight).toBeLessThanOrEqual(A4_PORTRAIT_HEIGHT_PX + 1);
    expect(printModel.sheetBottom - printModel.sheetTop).toBeLessThanOrEqual(A4_PORTRAIT_HEIGHT_PX + 1);
    expect(printModel.cards.every((card) => (
      card.top >= printModel.sheetTop + printModel.paddingTop - 1
      && card.bottom <= printModel.sheetTop + A4_PORTRAIT_HEIGHT_PX - printModel.paddingBottom + 1
    ))).toBe(true);
    expect(printModel.cards.every((card) => card.height > 0)).toBe(true);

    const snapshot = await readPrintSnapshot(page);
    expect(snapshot.print).toEqual(snapshot.screen);
  });
});
