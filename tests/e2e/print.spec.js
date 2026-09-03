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

async function expectRichLearningCards(root, { includeSpeech = false, gridCells = null } = {}) {
  const cards = root.locator("[data-hanzi-learning-card]");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-visual]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-example-words]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-sentence]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-writing-hint]")).toHaveCount(4);
  await expect(cards.locator("[data-hanzi-glyph]")).toHaveCount(4);
  await expect(cards.locator("[data-writing-pinyin]")).toHaveCount(4);
  if (gridCells === null) {
    await expect(cards.locator("[data-writing-grid]")).toHaveCount(0);
  } else {
    await expect(cards.locator("[data-writing-grid]")).toHaveCount(4);
    await expect(cards.locator("[data-writing-grid] .writing-cell")).toHaveCount(gridCells * 4);
  }

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
    gridCells: gridCells === null ? 0 : gridCells,
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
  test("opens an isolated print document without changing state or creating completion", async ({ page }) => {
    await page.context().addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });
    await openChineseAtFixedTime(page);
    await expectRichLearningCards(page.locator("[data-writing-worksheet]"), { includeSpeech: true });
    await expectRichLearningCards(page.locator("[data-writing-print-sheet]"), { gridCells: 9 });
    const before = await readPrintSnapshot(page);
    expect(before.screen).toMatchObject({
      dayKey: "2026-09-01",
      packId: "hanzi-writing-v2",
      packVersion: "hanzi-v2-pilot-1",
    });
    expect(before.screen.rows).toHaveLength(4);
    expect(before.print).toEqual(before.screen);

    await page.evaluate(() => {
      const host = document.createElement("yd-mg-icon");
      host.id = "yd-mg-icon-host";
      host.attachShadow({ mode: "open" });
      document.body.appendChild(host);
    });

    await page.clock.setFixedTime(new Date("2026-09-02T02:00:00.000Z"));
    const popupPromise = page.waitForEvent("popup");
    await page.locator("[data-print]").click();
    const popup = await popupPromise;
    await popup.waitForLoadState("load");
    await expect.poll(() => popup.evaluate(() => window.__printCalls), { timeout: 15000 }).toBe(1);
    await popup.emulateMedia({ media: "print" });

    const popupUrl = popup.url();
    const popupSnapshot = await popup.evaluate(() => ({
      visibleBodyChildren: [...document.body.children]
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => element.id || element.className),
      rows: [...document.querySelectorAll("[data-writing-row]")].map((row) => ({
        glyph: row.querySelector("[data-writing-glyph]")?.textContent,
        pinyin: row.querySelector("[data-writing-pinyin]")?.textContent,
      })),
      glyphsVisible: [...document.querySelectorAll("[data-writing-glyph]")].every((glyph) => glyph.getBoundingClientRect().height > 0),
      documentElementHidden: document.documentElement.hidden,
      logo: (() => {
        const element = document.querySelector(".writing-print-brand-logo");
        const style = element ? getComputedStyle(element) : null;
        const rect = element?.getBoundingClientRect();
        return {
          tagName: element?.tagName || null,
          backgroundImage: style?.backgroundImage || null,
          width: rect?.width || 0,
          height: rect?.height || 0,
        };
      })(),
      inlineStyles: document.querySelectorAll("style").length,
      extensionHosts: document.querySelectorAll("#yd-mg-icon-host, yd-mg-icon, #yd-mg-block-icon-host, yd-mg-block-icon, #yd-mg-huaci-host, yd-mg-huaci").length,
    }));
    expect(popupUrl).toBe("about:blank");
    expect(popupSnapshot.visibleBodyChildren).toEqual(["writingPrintRoot"]);
    expect(popupSnapshot.rows.map((row) => row.glyph)).toEqual(before.print.rows.map((row) => row.glyph));
    expect(popupSnapshot.rows.every((row) => row.pinyin)).toBe(true);
    expect(popupSnapshot.glyphsVisible).toBe(true);
    expect(popupSnapshot.documentElementHidden).toBe(false);
    expect(popupSnapshot.logo.tagName).toBe("svg");
    expect(popupSnapshot.logo.backgroundImage).toBe("none");
    expect(popupSnapshot.logo.width).toBeGreaterThan(0);
    expect(popupSnapshot.logo.height).toBeGreaterThan(0);
    expect(popupSnapshot.inlineStyles).toBe(0);
    expect(popupSnapshot.extensionHosts).toBe(0);

    const after = await readPrintSnapshot(page);
    expect(after).toEqual(before);
    expect(after.print).toEqual(after.screen);
    const assignment = after.state.extra.hanziWorksheetRotationV1.assignments[after.screen.dayKey];
    expect(assignment.completions).toEqual({});
    await popup.close();
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
    await page.evaluate(() => document.fonts.ready);
    await expectRichLearningCards(page.locator("[data-writing-print-sheet]"), { gridCells: 9 });
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
      const paper = sheet.querySelector(".writing-print-paper");
      const paperStyle = getComputedStyle(paper);
      const paperRect = paper.getBoundingClientRect();
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
        fontLoaded: document.fonts.check("14pt ShadowMateWriting"),
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        paperPaddingTop: parseFloat(paperStyle.paddingTop),
        paperPaddingBottom: parseFloat(paperStyle.paddingBottom),
        minHeight: parseFloat(style.minHeight),
        height: parseFloat(style.height),
        sheetTop: sheetRect.top,
        sheetBottom: sheetRect.bottom,
        sheetHeight: sheetRect.height,
        sheetScrollHeight: sheet.scrollHeight,
        paperTop: paperRect.top,
        paperBottom: paperRect.bottom,
        paperHeight: paperRect.height,
        cards,
      };
    });
    const printCssSource = printModel.cssSource
      ? await page.evaluate((href) => fetch(href).then((response) => response.text()), printModel.cssSource)
      : "";
    expect(printCssSource).toMatch(/@page\s*\{\s*size:\s*A4\s+portrait;\s*margin:\s*0;/i);
    expect(printCssSource).toMatch(/ShadowMateWriting/);
    expect(printCssSource).toMatch(/shadow-mate-writing-hand/);
    expect(printModel.pageRules.join("\n")).toMatch(/size:\s*a4\b/i);
    expect(printModel.pageRules.join("\n")).toMatch(/margin:\s*0/i);
    expect(printModel.boxSizing).toBe("border-box");
    expect(printModel.fontLoaded).toBe(true);
    expect(printModel.paddingTop).toBeCloseTo(0, 0);
    expect(printModel.paperPaddingTop).toBeCloseTo((7.5 * 96) / 25.4, 0);
    expect(printModel.paperPaddingBottom).toBeCloseTo((4.5 * 96) / 25.4, 0);
    expect(printModel.height).toBeCloseTo((297 * 96) / 25.4, 0);
    expect(printModel.cards).toHaveLength(4);
    expect(printModel.sheetHeight).toBeLessThanOrEqual(A4_PORTRAIT_HEIGHT_PX + 1);
    expect(printModel.sheetScrollHeight).toBeLessThanOrEqual(A4_PORTRAIT_HEIGHT_PX + 1);
    expect(printModel.sheetBottom - printModel.sheetTop).toBeLessThanOrEqual(A4_PORTRAIT_HEIGHT_PX + 1);
    expect(printModel.cards.every((card) => (
      card.top >= printModel.paperTop + printModel.paperPaddingTop - 1
      && card.bottom <= printModel.paperTop + printModel.paperHeight - printModel.paperPaddingBottom + 1
    ))).toBe(true);
    expect(printModel.cards.every((card) => card.height > 0)).toBe(true);

    const snapshot = await readPrintSnapshot(page);
    expect(snapshot.print).toEqual(snapshot.screen);
  });
});
