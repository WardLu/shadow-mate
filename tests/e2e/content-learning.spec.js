import { test, expect } from "@playwright/test";
import { LEGACY_BOOK_IDS, LEGACY_READING_LIST_IDS } from "../../src/content/books.js";

const DAY_ONE = "2026-10-13";
const FIXED_NOW = new Date(`${DAY_ONE}T02:00:00.000Z`);

test.use({ timezoneId: "Asia/Singapore", serviceWorkers: "block" });

async function openModule(page, module) {
  await page.locator('.navbtn[data-mod="learning"]').click();
  await page.locator(`[data-go="${module}"]`).click();
}

async function openLearningSettings(page) {
  await page.locator('.navbtn[data-mod="learning"]').click();
  await page.locator('[data-go-settings="learning"]').click();
}

async function readLearning(page, { persisted = false } = {}) {
  return page.evaluate(async (fromStorage) => {
    const { getContentLearningState } = await import("/src/learning-state.js");
    if (!fromStorage) return getContentLearningState(window.learningDesk.getState());
    const { getLearningStateStorageKey } = await import("/src/learning-state-envelope.js");
    const envelope = window.learningDesk.getEnvelope();
    const stored = JSON.parse(localStorage.getItem(getLearningStateStorageKey(envelope.scope || {})));
    return getContentLearningState(stored.learning);
  }, persisted);
}

function literacyGroups(page) {
  return page.locator("[data-literacy-plan] [data-content-feedback]");
}

function groupFor(page, occurrenceId) {
  return page.locator(`[data-literacy-plan] [data-content-feedback="${occurrenceId}"]`);
}

test.describe("Content learning facts in the local browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: FIXED_NOW });
    // These tests exercise local facts and never generate paid speech or use cloud accounts.
    await page.route(/https?:\/\/(?!127\.0\.0\.1(?::|\/)|localhost(?::|\/))/, (route) => route.abort());
  });

  test("does not invent a printable four-row worksheet for a new learner", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    await expect(page.locator("main")).toContainText("有足够的合适材料后，再提供四行字帖");
    await expect(page.locator("[data-writing-worksheet]")).toHaveCount(0);
    await expect(page.locator("[data-writing-print-sheet]")).toHaveCount(0);
    await expect(page.locator("[data-print]")).toHaveCount(0);
    await expect(page.locator('[data-cmod="chinese-writing"]')).toHaveCount(0);
    const plans = Object.values((await readLearning(page)).plans[DAY_ONE].candidates);
    expect(plans[0].activities.writing.length).toBeLessThan(4);
    expect(await page.evaluate(() => window.learningDesk.getState().extra.hanziWorksheetRotationV1)).toBeUndefined();
  });

  test("persists individual experiences without completing the remaining items", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const groups = literacyGroups(page);
    expect(await groups.count()).toBeGreaterThanOrEqual(2);
    const firstId = await groups.nth(0).getAttribute("data-content-feedback");
    const secondId = await groups.nth(1).getAttribute("data-content-feedback");
    await groups.nth(0).locator('[data-content-observation="complete"]').click();
    await expect(groupFor(page, firstId).locator("[data-content-revoke]")).toBeVisible();
    await expect(groupFor(page, secondId).locator('[data-content-observation="complete"]')).toBeVisible();
    const recorded = (await readLearning(page, { persisted: true })).occurrences;
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ occurrenceId: firstId, dayKey: DAY_ONE, revoked: false });

    await page.reload();
    await openModule(page, "chinese");
    await expect(groupFor(page, firstId).locator("[data-content-revoke]")).toBeVisible();
    await expect(groupFor(page, secondId).locator('[data-content-observation="complete"]')).toBeVisible();
    expect((await readLearning(page)).occurrences).toEqual(recorded);
  });

  test("cancelling a module check-in preserves the recorded item facts", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const checkin = page.locator('[data-cmod="chinese-literacy"]');
    await checkin.click();
    await expect(checkin).toHaveClass(/done/);
    const completed = (await readLearning(page)).occurrences;
    expect(completed.filter((entry) => entry.activityId === "literacy").length).toBeGreaterThan(0);
    await checkin.click();
    await expect(checkin).not.toHaveClass(/done/);
    expect((await readLearning(page, { persisted: true })).occurrences).toEqual(completed);

    await page.reload();
    await openModule(page, "chinese");
    await expect(checkin).not.toHaveClass(/done/);
    expect((await readLearning(page)).occurrences).toEqual(completed);
    await expect(literacyGroups(page).locator("[data-content-revoke]")).toHaveCount(
      completed.filter((entry) => entry.activityId === "literacy").length,
    );
  });

  test("does not recreate a revoked experience when the day is checked in again", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const first = literacyGroups(page).first();
    const occurrenceId = await first.getAttribute("data-content-feedback");
    await first.locator('[data-content-observation="complete"]').click();
    await groupFor(page, occurrenceId).locator("[data-content-revoke]").click();
    await expect(page.locator("[data-literacy-plan]")).toContainText("已撤回这次误录");
    const tombstone = (await readLearning(page)).occurrences.find((entry) => entry.occurrenceId === occurrenceId);
    expect(tombstone.revoked).toBe(true);
    await page.locator('[data-cmod="chinese-literacy"]').click();
    await page.locator('[data-cmod="chinese-literacy"]').click();
    await page.reload();
    await openModule(page, "chinese");
    const matching = (await readLearning(page, { persisted: true })).occurrences.filter((entry) => entry.occurrenceId === occurrenceId);
    expect(matching).toEqual([tombstone]);
    await expect(page.locator("[data-literacy-plan]")).toContainText("已撤回这次误录");
  });

  test("continues unfinished content after several absent days", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const original = await literacyGroups(page).evaluateAll((groups) => groups.map((group) => group.dataset.contentFeedback));
    const itemIds = Object.values((await readLearning(page)).plans[DAY_ONE].candidates)[0].activities.literacy.map((row) => row.itemId);
    expect(original.length).toBeGreaterThan(0);
    await page.clock.setFixedTime(new Date("2026-10-17T02:00:00.000Z"));
    await page.reload();
    await openModule(page, "chinese");
    await expect(page.locator("[data-literacy-plan]")).toContainText("继续上次");
    const learning = await readLearning(page, { persisted: true });
    const resumed = Object.values(learning.plans["2026-10-17"].candidates)[0].activities.literacy;
    expect(resumed.map((row) => row.itemId)).toEqual(itemIds);
    expect(resumed.every((row) => row.reason === "continue")).toBe(true);
    expect(learning.occurrences).toHaveLength(0);
  });

  test("switching learning packages and switching back preserves experiences and feedback", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const occurrenceId = await literacyGroups(page).first().getAttribute("data-content-feedback");
    await literacyGroups(page).first().locator('[data-content-observation="complete"]').click();
    await groupFor(page, occurrenceId).locator('[data-content-observation="needs-help"]').click();
    const before = await readLearning(page, { persisted: true });
    await openLearningSettings(page);
    await page.locator("[data-package-id]").selectOption("bridging-v1");
    await openModule(page, "chinese");
    const switched = await readLearning(page, { persisted: true });
    expect(switched.occurrences).toEqual(before.occurrences);
    expect(switched.feedback).toEqual(before.feedback);
    await openLearningSettings(page);
    await page.locator("[data-package-id]").selectOption("foundation-v2");
    await page.reload();
    await openModule(page, "chinese");
    await expect(groupFor(page, occurrenceId).locator("[data-content-revoke]")).toBeVisible();
    const restored = await readLearning(page, { persisted: true });
    expect(restored.occurrences).toEqual(before.occurrences);
    expect(restored.feedback).toEqual(before.feedback);
  });

  test("a speaking module that is preparing does not enlarge the check-in denominator", async ({ page }) => {
    await page.goto("/");
    await openLearningSettings(page);
    await page.locator('[data-module-id="speaking"]').check();
    await page.locator('.navbtn[data-mod="learning"]').click();
    await expect(page.locator('[data-go="speaking"]')).toContainText("准备中");
    await page.locator('[data-go="speaking"]').click();
    await expect(page.locator("main")).toContainText("准备中");
    await expect(page.locator('[data-cmod="speaking-practice"]')).toHaveCount(0);
    await page.locator('.navbtn[data-mod="home"]').click();
    await expect(page.locator(".banner")).toContainText("0/4 个学习模块");
    await expect(page.locator(".stat").filter({ hasText: "今日打卡" }).locator(".n")).toHaveText("0/4");
    await page.locator('.navbtn[data-mod="grow"]').click();
    await expect(page.locator('[data-cmod="speaking-practice"]')).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("语言听说累计打卡");
  });

  test("migrates legacy numeric shelf and reading-list IDs and retains unknown entries", async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("content-learning-legacy-seeded")) return;
      localStorage.setItem("shadow_mate_workbench_v1", JSON.stringify({
        bookShelf: { 0: true, 1: false, 7: true, 99: true },
        peanutRead: { 0: true, 11: true, 99: true },
      }));
      sessionStorage.setItem("content-learning-legacy-seeded", "1");
    });
    await page.goto("/");
    await openModule(page, "book");
    for (const id of [LEGACY_BOOK_IDS[0], LEGACY_BOOK_IDS[7]]) {
      await expect(page.locator(`[data-bk="${id}"]`)).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.locator(`[data-bk="${LEGACY_BOOK_IDS[1]}"]`)).toHaveAttribute("aria-pressed", "false");
    for (const id of [LEGACY_READING_LIST_IDS[0], LEGACY_READING_LIST_IDS[11]]) {
      await expect(page.locator(`[data-pb="${id}"]`)).toHaveAttribute("aria-pressed", "true");
    }
    const migrated = await page.evaluate(() => window.learningDesk.getState());
    expect(migrated.bookShelf["99"]).toBe(true);
    expect(migrated.peanutRead["99"]).toBe(true);
    expect(migrated.bookShelf["0"]).toBeUndefined();
    expect(migrated.peanutRead["0"]).toBeUndefined();
    await page.reload();
    await openModule(page, "book");
    expect(await page.evaluate(() => window.learningDesk.getState().bookShelf)).toEqual(migrated.bookShelf);
    expect(await page.evaluate(() => window.learningDesk.getState().peanutRead)).toEqual(migrated.peanutRead);
  });

  test("free browsing and parent-confirmed review preserve the issued plan and same-day revocations", async ({ page }) => {
    await page.route("**/tts/tencent-v1-manifest.json", (route) => route.abort());
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        getVoices: () => [{ lang: "zh-CN", name: "Local test voice" }],
        addEventListener() {}, cancel() {}, speak(utterance) { utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 10); },
      } });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: function (text) { this.text = text; } });
    });
    await page.goto("/");
    await openModule(page, "chinese");
    const before = await readLearning(page, { persisted: true });
    const browser = page.locator('[data-content-browser="literacy"]');
    await browser.locator("summary").click();
    await browser.locator("[data-content-search]").fill("火");
    const item = browser.locator('[data-browse-item="literacy-011"]');
    await expect(item).toBeVisible();
    await item.locator("[data-browse-play]").click();
    expect((await readLearning(page, { persisted: true })).occurrences).toEqual(before.occurrences);
    await item.locator("[data-browse-complete]").click();
    const after = await readLearning(page, { persisted: true });
    expect(after.plans).toEqual(before.plans);
    expect(after.occurrences.filter((entry) => entry.itemId === "literacy-011")).toHaveLength(1);
    await page.reload();
    await openModule(page, "chinese");
    await browser.locator("summary").click();
    await browser.locator("[data-content-search]").fill("火");
    await expect(item).toContainText("今天已体验");
    await item.locator("[data-browse-revoke]").click();
    await browser.locator("summary").click();
    await browser.locator("[data-content-search]").fill("火");
    await expect(item).toContainText("今天这次误录已撤回");
    await expect(item.locator("[data-browse-complete]")).toHaveCount(0);
    expect((await readLearning(page, { persisted: true })).occurrences.find((entry) => entry.itemId === "literacy-011").revoked).toBe(true);
  });

  test("pace changes persist across package switches and only alter the next day's new recommendations", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const before = await readLearning(page, { persisted: true });
    await openLearningSettings(page);
    await page.locator('[data-learning-pace="literacy_new"]').selectOption("1");
    await page.locator('[data-learning-pace="english_new"]').selectOption("1");
    await page.locator('[data-learning-pace="poems_per_week"]').selectOption("1");
    await page.locator("[data-package-id]").selectOption("bridging-v1");
    await page.locator("[data-package-id]").selectOption("foundation-v2");
    await page.reload();
    await openModule(page, "chinese");
    expect((await readLearning(page, { persisted: true })).plans).toEqual(before.plans);
    await page.locator('[data-cmod="chinese-literacy"]').click();
    await page.clock.setFixedTime(new Date("2026-10-14T02:00:00.000Z"));
    await page.reload();
    await openModule(page, "chinese");
    const plans = Object.values((await readLearning(page, { persisted: true })).plans["2026-10-14"].candidates);
    expect(plans[0].limits.literacy.new).toBe(1);
    expect(plans[0].activities.literacy.filter((row) => row.reason === "new")).toHaveLength(1);
    expect(plans[0].activities.literacy.filter((row) => row.reason === "review")).toHaveLength(2);
    expect(await page.evaluate(() => window.learningDesk.getState().content_config.learning_pace))
      .toEqual({ literacy_new: 1, english_new: 1, poems_per_week: 1 });
  });

  test("does not show or retain a successful completion when local saving fails", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const occurrenceId = await literacyGroups(page).first().getAttribute("data-content-feedback");
    const before = await readLearning(page, { persisted: true });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreLearningStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("shadow_mate_learning_v2:") || key === "shadow_mate_workbench_v1") {
          throw new DOMException("Synthetic local storage failure", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    });
    const dialogs = [];
    page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
    await literacyGroups(page).first().locator('[data-content-observation="complete"]').click();
    await expect(groupFor(page, occurrenceId).locator('[data-content-observation="complete"]')).toBeVisible();
    await expect(groupFor(page, occurrenceId).locator("[data-content-revoke]")).toHaveCount(0);
    expect((await readLearning(page)).occurrences).toEqual(before.occurrences);
    expect((await readLearning(page, { persisted: true })).occurrences).toEqual(before.occurrences);
    expect(dialogs.some((message) => /保存|重试/.test(message))).toBe(true);
    await page.evaluate(() => window.__restoreLearningStorage());
    await page.reload();
    await openModule(page, "chinese");
    await expect(groupFor(page, occurrenceId).locator('[data-content-observation="complete"]')).toBeVisible();
    expect((await readLearning(page)).occurrences).toEqual(before.occurrences);
  });
});
