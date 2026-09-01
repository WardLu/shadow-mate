import { test, expect } from "@playwright/test";

const FIXED_NOW = new Date("2026-09-01T02:00:00.000Z");
const TIME_ZONE = "Asia/Singapore";

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

async function readWorksheetSnapshot(page) {
  return page.evaluate(() => {
    const readRows = (root) => [...root.querySelectorAll("[data-writing-row]")].map((row) => ({
      rowId: row.dataset.writingRowId,
      itemId: row.dataset.writingItemId,
      glyph: row.querySelector("[data-writing-glyph]")?.textContent,
      pinyin: row.querySelector("[data-writing-pinyin]")?.textContent,
      exampleWord: row.querySelector("[data-writing-example-word]")?.textContent,
    }));
    const screen = document.querySelector("[data-writing-worksheet]");
    const rotation = window.learningDesk.getState().extra?.hanziWorksheetRotationV1;
    const assignment = rotation?.assignments?.[screen?.dataset.writingDayKey];

    return {
      screen: {
        assignmentId: screen?.dataset.writingAssignmentId,
        dayKey: screen?.dataset.writingDayKey,
        packVersion: screen?.dataset.writingPackVersion,
        rows: readRows(screen),
      },
      print: {
        assignmentId: document.querySelector("[data-writing-print-sheet]")?.dataset.writingAssignmentId,
        dayKey: document.querySelector("[data-writing-print-sheet]")?.dataset.writingDayKey,
        packVersion: document.querySelector("[data-writing-print-sheet]")?.dataset.writingPackVersion,
        rows: readRows(document.querySelector("[data-writing-print-sheet]")),
      },
      state: window.learningDesk.getState(),
      assignment,
    };
  });
}

async function nextClick(page) {
  await page.clock.fastForward(600);
}

test.describe("Hanzi writing worksheet", () => {
  test("opens a four-row P2 V2 worksheet from one stable assignment snapshot", async ({ page }) => {
    await openChineseAtFixedTime(page);

    const snapshot = await readWorksheetSnapshot(page);
    expect(snapshot.screen).toMatchObject({
      dayKey: "2026-09-01",
      packVersion: "hanzi-v2-pilot-1",
    });
    expect(snapshot.screen.assignmentId).toMatch(/^rotation-v1-/);
    expect(snapshot.screen.rows).toHaveLength(4);
    expect(new Set(snapshot.screen.rows.map((row) => row.itemId)).size).toBe(4);
    expect(snapshot.print).toEqual(snapshot.screen);
    expect(snapshot.assignment.canonicalAssignmentId).toBe(snapshot.screen.assignmentId);
    expect(snapshot.assignment.candidates[snapshot.screen.assignmentId]).toMatchObject({
      assignmentId: snapshot.screen.assignmentId,
      dayKey: "2026-09-01",
      packRef: {
        setId: "hanzi-writing-v2",
        contentVersion: "hanzi-v2-pilot-1",
      },
      rows: snapshot.screen.rows,
    });
  });

  test("keeps the same assignment, order, and glyphs after reload and module switches", async ({ page }) => {
    await openChineseAtFixedTime(page);
    const first = await readWorksheetSnapshot(page);

    await page.reload();
    await openLearningModule(page, "chinese");
    await openLearningModule(page, "english");
    await openLearningModule(page, "chinese");
    await openLearningModule(page, "chinese");

    const repeated = await readWorksheetSnapshot(page);
    expect(repeated.screen).toEqual(first.screen);
    expect(repeated.assignment).toEqual(first.assignment);
    expect(repeated.state.extra.hanziWorksheetRotationV1).toEqual(
      first.state.extra.hanziWorksheetRotationV1,
    );
  });

  test("creates a different assignment when the local day changes", async ({ page }) => {
    await openChineseAtFixedTime(page);
    const first = await readWorksheetSnapshot(page);

    await page.clock.setFixedTime(new Date("2026-09-02T02:00:00.000Z"));
    await openLearningModule(page, "chinese");

    const nextDay = await readWorksheetSnapshot(page);
    expect(nextDay.screen.dayKey).toBe("2026-09-02");
    expect(nextDay.screen.assignmentId).not.toBe(first.screen.assignmentId);
    expect(nextDay.screen.rows.map((row) => row.itemId)).not.toEqual(first.screen.rows.map((row) => row.itemId));
    expect(Object.keys(nextDay.state.extra.hanziWorksheetRotationV1.assignments)).toEqual([
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  test("refreshes the worksheet before writing completion when the page crosses midnight", async ({ page }) => {
    await openChineseAtFixedTime(page);
    const previous = await readWorksheetSnapshot(page);
    const staleCheckin = page.locator('[data-cmod="chinese-writing"]');

    await page.clock.setFixedTime(new Date("2026-09-02T02:00:00.000Z"));
    await staleCheckin.click();

    const current = await readWorksheetSnapshot(page);
    const previousAssignment = current.state.extra.hanziWorksheetRotationV1.assignments[previous.screen.dayKey];
    const currentAssignment = current.state.extra.hanziWorksheetRotationV1.assignments[current.screen.dayKey];

    expect(current.screen.dayKey).toBe("2026-09-02");
    expect(current.screen.assignmentId).not.toBe(previous.screen.assignmentId);
    expect(current.print).toEqual(current.screen);
    expect(previousAssignment.completions).toEqual({});
    expect(currentAssignment.completions).toEqual({
      [current.screen.assignmentId]: expect.objectContaining({ completedAt: expect.any(String) }),
    });
    expect(current.state.checkins["2026-09-02"]?.["chinese-writing"]).toBe(true);
    expect(current.state.checkins["2026-09-01"]?.["chinese-writing"]).toBeUndefined();
  });

  test("records writing completion once while daily check-in remains reversible", async ({ page }) => {
    await openChineseAtFixedTime(page);
    const before = await readWorksheetSnapshot(page);
    const checkin = page.locator('[data-cmod="chinese-writing"]');

    await checkin.click();
    await expect(page.locator('[data-cmod="chinese-writing"]')).toHaveClass(/done/);
    const completed = await readWorksheetSnapshot(page);
    const completion = completed.assignment.completions[completed.screen.assignmentId];
    expect(completion).toMatchObject({ completedAt: "2026-09-01T02:00:00.000Z" });
    expect(Object.keys(completed.assignment.completions)).toEqual([completed.screen.assignmentId]);

    await nextClick(page);
    await page.locator('[data-cmod="chinese-writing"]').click();
    await expect(page.locator('[data-cmod="chinese-writing"]')).not.toHaveClass(/done/);
    const cancelled = await readWorksheetSnapshot(page);
    expect(cancelled.state.checkins["2026-09-01"]?.["chinese-writing"]).toBeUndefined();
    expect(cancelled.assignment.completions).toEqual(completed.assignment.completions);

    await nextClick(page);
    await page.locator('[data-cmod="chinese-writing"]').click();
    const rechecked = await readWorksheetSnapshot(page);
    expect(Object.keys(rechecked.assignment.completions)).toEqual([rechecked.screen.assignmentId]);
    expect(rechecked.assignment.completions).toEqual(completed.assignment.completions);
    expect(JSON.stringify(rechecked.state)).not.toMatch(/sm-2|mastery/i);
    expect(before.assignment.completions).toEqual({});
  });

  test("rebuilds the print root when changing learner scope or clearing local data", async ({ page }) => {
    await openChineseAtFixedTime(page);
    const anonymous = await readWorksheetSnapshot(page);

    await page.evaluate(() => window.learningDesk.activateScope("profile:learner-a", {
      state: {},
      persist: false,
    }));
    const profile = await readWorksheetSnapshot(page);
    expect(profile.screen.assignmentId).not.toBe(anonymous.screen.assignmentId);
    expect(profile.print).toEqual(profile.screen);
    expect(await page.locator("[data-writing-print-sheet]").count()).toBe(1);

    await page.evaluate(() => window.learningDesk.clearLocalData({ reload: false }));
    const cleared = await readWorksheetSnapshot(page);
    expect(cleared.state.extra.hanziWorksheetRotationV1.learnerScope).toBe("anonymous");
    expect(cleared.screen.assignmentId).not.toBe(profile.screen.assignmentId);
    expect(cleared.print).toEqual(cleared.screen);

    await openLearningModule(page, "english");
    await expect(page.locator("[data-writing-print-sheet]")).toHaveCount(0);
  });
});
