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

async function installSpeechMock(page, {
  voices = [{ lang: "zh-CN" }, { lang: "en-US" }],
  mode = "end",
  cancelError = null,
  voiceChanges = false,
} = {}) {
  await page.addInitScript(({ configuredVoices, configuredMode, configuredCancelError, configuredVoiceChanges }) => {
    const utterances = [];
    let activeUtterance = null;
    Object.defineProperty(window, "__speechUtterances", {
      configurable: true,
      value: utterances,
    });
    Object.defineProperty(window, "__speechMode", {
      configurable: true,
      writable: true,
      value: configuredMode,
    });
    Object.defineProperty(window, "__speechVoices", {
      configurable: true,
      writable: true,
      value: configuredVoices,
    });
    Object.defineProperty(window, "__speechVoiceLangs", {
      configurable: true,
      value: [],
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: function SpeechSynthesisUtterance(text) {
        this.text = text;
        this.lang = "";
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        cancel() {
          const prior = activeUtterance;
          activeUtterance = null;
          this.speaking = false;
          this.pending = false;
          if (configuredCancelError && prior) {
            queueMicrotask(() => prior.onerror?.({ error: configuredCancelError }));
          }
        },
        getVoices() {
          return window.__speechVoices;
        },
        speak(utterance) {
          activeUtterance = utterance;
          utterances.push({ text: utterance.text, lang: utterance.lang });
          window.__speechVoiceLangs.push(utterance.voice?.lang || null);
          if (configuredMode === "active") {
            this.speaking = true;
            return;
          }
          if (window.__speechMode === "error") {
            queueMicrotask(() => utterance.onerror?.({ error: "synthesis-failed" }));
            return;
          }
          if (window.__speechMode === "pending") return;
          queueMicrotask(() => {
            if (activeUtterance === utterance) activeUtterance = null;
            utterance.onend?.();
          });
        },
      },
    });
    if (configuredVoiceChanges) {
      const listeners = new Set();
      window.speechSynthesis.addEventListener = (type, listener) => {
        if (type === "voiceschanged") listeners.add(listener);
      };
      window.speechSynthesis.removeEventListener = (type, listener) => {
        if (type === "voiceschanged") listeners.delete(listener);
      };
      window.__emitSpeechVoicesChanged = () => listeners.forEach((listener) => listener());
    }
  }, { configuredVoices: voices, configuredMode: mode, configuredCancelError: cancelError, configuredVoiceChanges: voiceChanges });
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

  test("renders rich learning cards and routes bilingual speech without changing learning state", async ({ page }) => {
    await installSpeechMock(page);
    await openChineseAtFixedTime(page);

    await expect(page.locator("[data-writing-practice] .stroke-chip .stroke-glyph")).toHaveText(["丶", "一", "丨", "丿", "㇏", "㇀", "㇕", "亅"]);
    await expect(page.locator("[data-writing-practice] .stroke-chip svg")).toHaveCount(0);
    const cards = page.locator("[data-writing-worksheet] [data-hanzi-learning-card]");
    await expect(cards).toHaveCount(4);
    await expect(cards.locator("[data-hanzi-visual]")).toHaveCount(4);
    await expect(cards.locator("[data-hanzi-glyph]")).toHaveCount(4);
    await expect(cards.locator(".hanzi-target-highlight")).toHaveCount(8);
    await expect(cards.locator("[data-hanzi-sentence]")).toHaveCount(4);
    await expect(cards.locator("[data-hanzi-writing-hint]")).toHaveCount(4);
    await expect(cards.locator("[data-hanzi-stroke-order]")).toHaveCount(4);
    await expect(cards.locator("[data-hanzi-meaning-text]")).toHaveCount(4);
    await expect(cards.locator("[data-hanzi-concrete-meaning]")).toHaveCount(0);
    await expect(cards.locator("[data-hanzi-meaning-text]").first()).toHaveText("燃烧时发光发热的东西");
    await expect(cards.locator("[data-hanzi-meaning-speak]")).toHaveCount(4);
    await expect(cards.locator("[data-writing-grid]")).toHaveCount(0);
    await expect(cards.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]')).toHaveCount(4);
    await expect(cards.locator('[data-hanzi-speak][data-speech-locale="en-US"]')).toHaveCount(4);

    const chineseSpeechButtons = cards.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]');
    const englishSpeechButtons = cards.locator('[data-hanzi-speak][data-speech-locale="en-US"]');
    const expectedChineseNames = [
      "播放“火”的中文发音",
      "播放“水”的中文发音",
      "播放“山”的中文发音",
      "播放“木”的中文发音",
    ];
    const expectedEnglishNames = [
      "播放“fire”的英文发音",
      "播放“water”的英文发音",
      "播放“mountain”的英文发音",
      "播放“wood”的英文发音",
    ];
    for (const [index, name] of expectedChineseNames.entries()) {
      await expect(chineseSpeechButtons.nth(index)).toHaveAccessibleName(name);
    }
    for (const [index, name] of expectedEnglishNames.entries()) {
      await expect(englishSpeechButtons.nth(index)).toHaveAccessibleName(name);
    }
    expect(new Set(await chineseSpeechButtons.allTextContents()).size).toBe(1);
    expect(new Set(await englishSpeechButtons.allTextContents()).size).toBe(1);
    expect(await englishSpeechButtons.allTextContents()).toEqual(Array.from({ length: 4 }, () => "英文发音"));

    const firstCard = cards.first();
    await expect(firstCard.locator("[data-hanzi-visual]")).toHaveAttribute("role", "img");
    await expect(firstCard.locator("[data-hanzi-sentence]")).not.toBeEmpty();
    await expect(firstCard.locator("[data-hanzi-writing-hint]")).not.toBeEmpty();

    const before = await readWorksheetSnapshot(page);
    const zhButton = firstCard.locator('[data-hanzi-speak][data-speech-locale="zh-CN"]');
    const enButton = firstCard.locator('[data-hanzi-speak][data-speech-locale="en-US"]');
    const expectedUtterances = [
      { text: "火", lang: "zh-CN" },
      { text: "fire", lang: "en-US" },
    ];

    await zhButton.click();
    await enButton.click();
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual(expectedUtterances);

    const meaningButton = firstCard.locator("[data-hanzi-meaning-speak]");
    await meaningButton.click();
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toHaveLength(3);
    expect((await page.evaluate(() => window.__speechUtterances)).at(-1)).toEqual({ text: "燃烧时发光发热的东西", lang: "zh-CN" });

    const after = await readWorksheetSnapshot(page);
    expect(after.screen).toEqual(before.screen);
    expect(after.print).toEqual(before.print);
    expect(after.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
    expect(after.assignment.completions).toEqual(before.assignment.completions);
    expect(after.state.checkins).toEqual(before.state.checkins);
  });

  test("ignores rapid repeated clicks on one speech action", async ({ page }) => {
    await installSpeechMock(page, { mode: "pending" });
    await openChineseAtFixedTime(page);

    const meaningButton = page.locator("[data-writing-worksheet] [data-hanzi-meaning-speak]").first();
    await meaningButton.click();
    await page.evaluate(() => {
      const button = document.querySelector("[data-writing-worksheet] [data-hanzi-meaning-speak]");
      for (let index = 0; index < 3; index += 1) {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });

    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
      { text: "燃烧时发光发热的东西", lang: "zh-CN" },
    ]);
    await expect(meaningButton).toBeDisabled();
  });

  test("treats an externally cancelled Chinese utterance as a cancellation, not a failure", async ({ page }) => {
    await installSpeechMock(page, { mode: "active", cancelError: "canceled" });
    await openChineseAtFixedTime(page);

    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();
    await page.evaluate(() => window.speechSynthesis.cancel());

    await expect(button).toContainText("中文发音");
    await expect(button).toBeEnabled();
    await expect(button).not.toContainText("失败");
  });

  test("waits for voiceschanged before reporting a missing Mandarin voice", async ({ page }) => {
    await installSpeechMock(page, { voices: [], voiceChanges: true });
    await openChineseAtFixedTime(page);

    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();
    await page.evaluate(() => {
      window.__speechVoices = [{ lang: "zh-CN" }];
      window.__emitSpeechVoicesChanged();
    });

    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
      { text: "火", lang: "zh-CN" },
    ]);
    await expect(button).toBeEnabled();
    await expect(button).not.toContainText("没有中文");
  });

  test("uses the explicit Chinese Piper gate when Android exposes no voice list", async ({ page }) => {
    await installSpeechMock(page, { voices: [] });
    await openChineseAtFixedTime(page);

    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();

    await expect(button).toContainText("中文离线语音尚未开放");
    await expect(page.locator("#shadow-voice-dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.__speechUtterances)).toEqual([]);
    await expect(button).toBeEnabled();
    await expect(button).not.toContainText("没有中文");
  });

  test("waits for a late Mandarin voice after Android exposes a partial voice list", async ({ page }) => {
    await installSpeechMock(page, { voices: [{ lang: "en-US" }], voiceChanges: true });
    await openChineseAtFixedTime(page);

    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();
    await page.clock.fastForward(1500);
    await page.evaluate(() => {
      window.__speechVoices = [{ lang: "en-US" }, { lang: "zh-CN" }];
      window.__emitSpeechVoicesChanged();
    });

    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
      { text: "火", lang: "zh-CN" },
    ]);
    await expect(button).toBeEnabled();
    await expect(button).not.toContainText("没有中文");
  });

  test("shows Chinese speech as busy while waiting for Android voices", async ({ page }) => {
    await installSpeechMock(page, { voices: [{ lang: "en-US" }], voiceChanges: true });
    await openChineseAtFixedTime(page);

    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();

    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toContainText("播放中");

    await page.evaluate(() => {
      window.__speechVoices = [{ lang: "en-US" }, { lang: "zh-CN" }];
      window.__emitSpeechVoicesChanged();
    });
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
      { text: "火", lang: "zh-CN" },
    ]);
  });

  test("does not report a working English system utterance as a false failure", async ({ page }) => {
    await installSpeechMock(page, { mode: "end" });
    await openChineseAtFixedTime(page);

    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="en-US"]').first();
    await button.click();
    await page.clock.runFor(4100);

    await expect(button).toHaveText("英文发音");
    await expect(button).toBeEnabled();
    await expect(button).not.toContainText("失败");
  });

  test("uses the explicit Chinese Piper gate when no Mandarin system voice is available", async ({ page }) => {
    let piperEngineRequests = 0;
    await page.route("**/piper-tts-web.js*", async (route) => {
      piperEngineRequests += 1;
      await route.continue();
    });
    await installSpeechMock(page, {
      voices: [{ lang: "yue-CN" }, { lang: "yue-Hant-HK" }, { lang: "en-US" }],
    });
    await openChineseAtFixedTime(page);

    const before = await readWorksheetSnapshot(page);
    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await expect(button).toHaveAccessibleName("播放“火”的中文发音");
    await button.click();

    await expect(button).toContainText("中文离线语音尚未开放");
    await expect(button).toHaveAccessibleName("中文离线语音尚未开放，请安装系统中文普通话语音后重试");
    await expect(button).toHaveAttribute("aria-live", "polite");
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("data-speech-failure", "true");
    expect(await page.locator("[data-speech-guide]").count()).toBe(0);
    expect(await page.evaluate(() => window.__speechUtterances)).toEqual([]);
    expect(piperEngineRequests).toBe(0);

    const afterFailure = await readWorksheetSnapshot(page);
    expect(afterFailure.screen).toEqual(before.screen);
    expect(afterFailure.print).toEqual(before.print);
    expect(afterFailure.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
    expect(afterFailure.assignment.completions).toEqual(before.assignment.completions);
    expect(afterFailure.state.checkins).toEqual(before.state.checkins);

    await page.evaluate(() => {
      window.__speechVoices = [{ lang: "zh-CN" }, { lang: "en-US" }];
    });
    await page.clock.fastForward(600);
    await button.click();

    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
      { text: "火", lang: "zh-CN" },
    ]);
    expect(await page.evaluate(() => window.__speechVoiceLangs)).toEqual(["zh-CN"]);
    await expect(button).toContainText("中文发音");
    await expect(button).toHaveAccessibleName("播放“火”的中文发音");
    await expect(button).toBeFocused();
    expect(await button.getAttribute("data-speech-failure")).toBeNull();
    expect(await button.getAttribute("aria-busy")).toBeNull();
    expect(piperEngineRequests).toBe(0);

    const afterRetry = await readWorksheetSnapshot(page);
    expect(afterRetry.screen).toEqual(before.screen);
    expect(afterRetry.print).toEqual(before.print);
    expect(afterRetry.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
    expect(afterRetry.assignment.completions).toEqual(before.assignment.completions);
    expect(afterRetry.state.checkins).toEqual(before.state.checkins);
  });

  for (const mandarinVoiceLocale of ["cmn-Hans-CN", "cmn-CN", "zh-SG", "zh-Hans-CN"]) {
    test(`accepts ${mandarinVoiceLocale} as Mandarin without selecting a Cantonese voice`, async ({ page }) => {
      await installSpeechMock(page, {
        voices: [{ lang: "yue-CN" }, { lang: "yue-Hant-HK" }, { lang: mandarinVoiceLocale }],
      });
      await openChineseAtFixedTime(page);

      const before = await readWorksheetSnapshot(page);
      const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
      const expectedText = await button.getAttribute("data-speech-text");
      await button.click();

      await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toEqual([
        { text: expectedText, lang: "zh-CN" },
      ]);
      expect(await page.evaluate(() => window.__speechVoiceLangs)).toEqual([mandarinVoiceLocale]);

      const after = await readWorksheetSnapshot(page);
      expect(after.screen).toEqual(before.screen);
      expect(after.print).toEqual(before.print);
      expect(after.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
      expect(after.assignment.completions).toEqual(before.assignment.completions);
      expect(after.state.checkins).toEqual(before.state.checkins);
    });
  }

  test("falls back to the explicit Chinese Piper gate after a system speech error and allows a retry", async ({ page }) => {
    await installSpeechMock(page, { mode: "error" });
    await openChineseAtFixedTime(page);

    const before = await readWorksheetSnapshot(page);
    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await expect(button).toHaveAccessibleName("播放“火”的中文发音");
    await button.click();
    await expect(button).toContainText("中文离线语音尚未开放");
    await expect(button).toHaveAccessibleName("中文离线语音尚未开放，请安装系统中文普通话语音后重试");
    await expect(button).toHaveAttribute("aria-live", "polite");
    await expect(button).toBeFocused();
    await expect(button).not.toBeDisabled();
    await expect(button).toHaveAttribute("data-speech-failure", "true");

    const afterError = await readWorksheetSnapshot(page);
    expect(afterError.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
    expect(afterError.assignment.completions).toEqual(before.assignment.completions);
    expect(afterError.state.checkins).toEqual(before.state.checkins);

    await page.evaluate(() => { window.__speechMode = "end"; });
    await page.clock.fastForward(600);
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toHaveLength(2);
    await expect(button).toHaveAccessibleName("播放“火”的中文发音");
    await expect(button).toHaveAttribute("aria-live", "polite");
    await expect(button).toBeFocused();
    await expect(button).not.toBeDisabled();
    expect(await button.getAttribute("data-speech-failure")).toBeNull();
    expect(await button.getAttribute("aria-busy")).toBeNull();

    const afterRetry = await readWorksheetSnapshot(page);
    expect(afterRetry.screen).toEqual(before.screen);
    expect(afterRetry.print).toEqual(before.print);
    expect(afterRetry.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
    expect(afterRetry.assignment.completions).toEqual(before.assignment.completions);
    expect(afterRetry.state.checkins).toEqual(before.state.checkins);
  });

  test("falls back to the explicit Chinese Piper gate after the 4-second system-start timeout and allows a retry", async ({ page }) => {
    await installSpeechMock(page, { mode: "pending" });
    await openChineseAtFixedTime(page);

    const before = await readWorksheetSnapshot(page);
    const button = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await button.click();
    await expect(button).toBeDisabled();

    await page.clock.fastForward(4000);
    await expect(button).toContainText("中文离线语音尚未开放");
    await expect(button).not.toBeDisabled();

    await page.evaluate(() => { window.__speechMode = "end"; });
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toHaveLength(2);
    await expect(button).not.toBeDisabled();
    expect(await button.getAttribute("data-speech-failure")).toBeNull();

    const afterRetry = await readWorksheetSnapshot(page);
    expect(afterRetry.screen).toEqual(before.screen);
    expect(afterRetry.print).toEqual(before.print);
    expect(afterRetry.state.extra.hanziWorksheetRotationV1).toEqual(before.state.extra.hanziWorksheetRotationV1);
    expect(afterRetry.assignment.completions).toEqual(before.assignment.completions);
    expect(afterRetry.state.checkins).toEqual(before.state.checkins);
  });

  test("rebinds speech buttons after module switches without stale state or duplicate listeners", async ({ page }) => {
    await installSpeechMock(page, { mode: "error" });
    await openChineseAtFixedTime(page);

    const oldButton = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await oldButton.click();
    await expect(oldButton).toContainText("中文离线语音尚未开放");

    await openLearningModule(page, "english");
    await openLearningModule(page, "chinese");
    const newButton = page.locator('[data-writing-worksheet] [data-hanzi-speak][data-speech-locale="zh-CN"]').first();
    await expect(newButton).toContainText("中文发音");
    expect(await newButton.getAttribute("data-speech-failure")).toBeNull();

    await page.evaluate(() => { window.__speechMode = "end"; });
    await newButton.click();
    await expect.poll(() => page.evaluate(() => window.__speechUtterances)).toHaveLength(2);
    await expect(newButton).not.toBeDisabled();
    expect(await page.evaluate(() => window.__speechUtterances.map(({ lang }) => lang))).toEqual([
      "zh-CN",
      "zh-CN",
    ]);
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
