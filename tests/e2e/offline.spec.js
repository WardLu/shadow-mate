import { test, expect } from "@playwright/test";

const PIPER_LIFECYCLE_FIXTURE = {
  id: "test-piper-lifecycle",
  locale: "en-US",
  label: "Piper lifecycle fixture",
  kind: "voice",
  version: "1",
  source: "cdn",
  cachePolicy: "user-download",
  releaseApproved: true,
  files: [
    {
      key: "model",
      suffix: ".onnx",
      contentType: "application/octet-stream",
      content: "abc",
      bytes: 3,
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    {
      key: "metadata",
      suffix: ".onnx.json",
      contentType: "application/json",
      content: "{}",
      bytes: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    },
  ],
  totalBytes: 5,
};

async function openModule(page, mod) {
  await page.click('[data-mod="learning"]');
  await page.click(`[data-go="${mod}"]`);
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

test.describe("Offline mode (no login)", () => {
  test("app loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("影伴");
  });

  test("service-worker activation retains a completed Piper package without a second resource GET", async ({ page, context }) => {
    const resourceGetRequests = { model: 0, metadata: 0 };
    for (const file of PIPER_LIFECYCLE_FIXTURE.files) {
      await page.route(`**/piper-lifecycle-fixture${file.suffix}`, async (route) => {
        if (route.request().method() === "GET") resourceGetRequests[file.key] += 1;
        await route.continue();
      });
    }
    await page.goto("/");

    const seeded = await page.evaluate(async (fixture) => {
      if (!("serviceWorker" in navigator) || !("caches" in window)) return { supported: false };
      const resourcePackage = { ...fixture, baseUrl: `${location.origin}/piper-lifecycle-fixture` };
      const { createPiperResourceStore } = await import("/src/piper-resource-store.js");
      const store = createPiperResourceStore({
        packages: [resourcePackage],
        cacheStorage: caches,
        getCapabilities: () => ({ canDownload: true }),
      });
      const cache = await caches.open(store.getCacheName(resourcePackage));
      for (const file of resourcePackage.files) {
        await cache.put(`${resourcePackage.baseUrl}${file.suffix}`, new Response(file.content, { headers: { "content-type": file.contentType } }));
      }
      const marker = await store.writeCompletionMarker(resourcePackage);
      const completed = await store.isPiperResourceCached(resourcePackage.id);
      await caches.open("shadow-mate-app-v3");
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error("service worker did not become ready")), 10_000)),
      ]);
      const lifecycleToken = Date.now();
      const registration = await navigator.serviceWorker.register(`/sw.js?lifecycle=${lifecycleToken}`, { scope: "/" });
      await registration.update();
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 10_000;
        const check = () => {
          if (registration.active?.scriptURL.includes(`lifecycle=${lifecycleToken}`) && registration.active.state === "activated") resolve();
          else if (Date.now() >= deadline) reject(new Error("updated service worker did not activate"));
          else setTimeout(check, 25);
        };
        check();
      });
      return {
        supported: true,
        cacheNames: await caches.keys(),
        scriptUrl: registration.active?.scriptURL || null,
        completed,
        marker,
      };
    }, PIPER_LIFECYCLE_FIXTURE);

    expect(seeded.supported).toBe(true);
    expect(seeded.scriptUrl).toContain("/sw.js");
    expect(seeded.completed).toBe(true);
    expect(seeded.cacheNames).toContain(`shadow-mate-piper-${PIPER_LIFECYCLE_FIXTURE.id}-${PIPER_LIFECYCLE_FIXTURE.version}`);
    expect(seeded.cacheNames).not.toContain("shadow-mate-app-v3");
    expect(seeded.marker).toMatchObject({
      id: PIPER_LIFECYCLE_FIXTURE.id,
      version: PIPER_LIFECYCLE_FIXTURE.version,
      manifestVersion: PIPER_LIFECYCLE_FIXTURE.version,
      files: PIPER_LIFECYCLE_FIXTURE.files.map((file) => ({
        key: file.key,
        expectedBytes: file.bytes,
        actualBytes: file.bytes,
        expectedSha256: file.sha256,
        actualSha256: file.sha256,
      })),
    });

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page).toHaveTitle("影伴");
      const offlinePackage = await page.evaluate(async (fixture) => {
        const resourcePackage = { ...fixture, baseUrl: `${location.origin}/piper-lifecycle-fixture` };
        const cache = await caches.open(`shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`);
        const markerRoot = `${resourcePackage.baseUrl}/__shadow-mate-piper-package__/${encodeURIComponent(`${resourcePackage.id}@${resourcePackage.version}`)}`;
        const marker = (await cache.keys()).some((request) => request.url === markerRoot || request.url.startsWith(`${markerRoot}?owner=`));
        const files = await Promise.all(resourcePackage.files.map((file) => cache.match(`${resourcePackage.baseUrl}${file.suffix}`)));
        return { marker, files: files.map(Boolean) };
      }, PIPER_LIFECYCLE_FIXTURE);
      expect(offlinePackage).toEqual({ marker: true, files: [true, true] });
    } finally {
      await context.setOffline(false);
    }
    expect(resourceGetRequests).toEqual({ model: 0, metadata: 0 });
  });

  test("home page shows banner and stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".banner")).toBeVisible();
    await expect(page.locator(".stat-grid .stat")).toHaveCount(5);
  });

  test("footer exposes social links and the WeChat QR dialog", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-footer")).toBeVisible();
    await expect(page.locator('a[href="https://www.shadow.wang/"]')).toHaveAttribute("target", "_blank");
    await expect(page.locator(".site-footer-links > .site-footer-link").first()).toContainText("Shadow Nexus");
    await expect(page.locator('a[href="/privacy"]')).toHaveAttribute("target", "_blank");
    await expect(page.locator('a[href="https://xhslink.cn/m/4W1NWyRrxv5"]')).toBeVisible();
    await expect(page.locator('a[href="https://v.douyin.com/1y06PMohfoE/"]')).toBeVisible();
    await expect(page.locator('a[href="https://x.com/Gollumgulu"]')).toHaveAccessibleName("打开 X");

    await page.locator("#wechatButton").click();
    await expect(page.locator("#wechatDialog")).toBeVisible();
    await expect(page.locator("#wechatDialog img")).toHaveAttribute("src", "/brand_assets/wechat-public-account.jpg");
    await expect(page.locator("#wechatDialog img")).toHaveAttribute("alt", "微信公众号二维码");
    await page.locator("#wechatDialogClose").click();
    await expect(page.locator("#wechatDialog")).toBeHidden();
    await expect(page.locator("#wechatButton")).toBeFocused();
  });

  test("local privacy route serves the standalone policy page", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.headers()["content-type"]).toContain("text/html");
    await expect(page).toHaveTitle("影伴隐私说明");
    await expect(page.locator("#zh .language-title")).toContainText("隐私说明");
    await expect(page.locator("#en")).toBeVisible();
    await expect(page.locator('link[rel="stylesheet"][href="/privacy-policy.css"]')).toHaveCount(1);
    await expect(page.locator(".brand")).toHaveAttribute("href", "/");
    await expect(page.locator(".back-link")).toHaveAttribute("href", "/");
  });

  test("night mode keeps page surfaces and text readable", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 28, 20)");
    await expect(page.locator(".card").first()).toHaveCSS("background-color", "rgb(24, 39, 29)");
    await expect(page.locator(".card h3").first()).toHaveCSS("color", "rgb(238, 247, 239)");
    await expect(page.locator(".card .desc").first()).toHaveCSS("color", "rgb(173, 193, 178)");
  });

  test("night mode gives interactive and guide surfaces the same dark treatment", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await openModule(page, "math");
    await expect(page.locator(".lvl-btn").nth(1)).toHaveCSS("background-color", "rgb(24, 39, 29)");
    await expect(page.locator(".lvl-btn").first()).toHaveCSS("background-color", "rgb(26, 56, 36)");
    await expect(page.locator(".num-cell.miss")).toHaveCSS("background-color", "rgb(24, 39, 29)");

    await page.click('[data-mod="guide"]');
    await expect(page.locator(".guide-card").first()).toHaveCSS("background-color", "rgb(24, 39, 29)");
  });

  test("night mode keeps the account dialog readable", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.click("#accountButton");

    await expect(page.locator("#cloudDialog")).toHaveCSS("background-color", "rgb(24, 39, 29)");
    await expect(page.locator("#cloudDialog input").first()).toHaveCSS("background-color", "rgb(18, 34, 24)");
  });

  test("login button is visible", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator("#accountButton");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("登录");
  });

  test("cloud error toast stays visible inside the open account dialog", async ({ page }) => {
    await page.goto("/");
    await page.route("**/auth/v1/otp**", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_request", error_description: "测试失败" }),
      });
    });
    await page.click("#accountButton");
    await page.fill('#emailLoginForm input[name="email"]', "test@example.com");
    await page.click('#emailLoginForm button[type="submit"]');
    const toast = page.locator("#syncToast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveClass(/in-dialog/);
    await expect(toast.evaluate((element) => element.parentElement?.id)).resolves.toBe("cloudPanel");
  });

  test("keeps exact top-level navigation and enters subjects from learning", async ({ page }) => {
    await page.goto("/");
    const topLevelNav = page.locator(".navbtn");
    await expect(topLevelNav).toHaveCount(5);
    await expect(topLevelNav).toHaveText(["首页", "学习", "积分", "成长", "指南"]);
    for (const mod of ["chinese", "math", "english", "book"]) {
      await expect(page.locator(`.navbtn[data-mod="${mod}"]`)).toHaveCount(0);
    }

    await page.locator('[data-mod="learning"]').click();
    await expect(page.locator("[data-go]")).toHaveCount(4);
    await expect(page.locator('[data-go="chinese"]')).toBeVisible();
    await expect(page.locator('[data-go="math"]')).toBeVisible();
    await expect(page.locator('[data-go="english"]')).toBeVisible();
    await expect(page.locator('[data-go="book"]')).toBeVisible();

    for (const [mod, label] of [
      ["chinese", "语文"],
      ["math", "数学"],
      ["english", "英语"],
      ["book", "绘本"],
    ]) {
      await openModule(page, mod);
      await page.waitForSelector(".module-title h2",{timeout:5000});
      await expect(page.locator(".module-title h2")).toContainText(label);
    }
    for (const [mod, label] of [
      ["points", "积分"],
      ["grow", "成长"],
    ]) {
      await page.click(`[data-mod="${mod}"]`);
      await page.waitForSelector(".module-title h2",{timeout:5000});
      await expect(page.locator(".module-title h2")).toContainText(label);
    }
  });

  test("usage guide explains setup and manages browser-scoped speech resources", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="guide"]');
    await expect(page.locator(".guide-page")).toBeVisible();
    await expect(page.locator(".guide-page h2")).toContainText("使用指南");
    await expect(page.locator('[data-guide-section="speech"]')).toContainText("听发音");
    await expect(page.locator('[data-guide-section="speech"] [data-piper-resource="matcha-icefall-zh-en-1.13.2"]')).toContainText("清单大小");
    await expect(page.locator('[data-guide-section="speech"] [data-piper-resource="matcha-icefall-zh-en-1.13.2"]')).toContainText("154.6 MB");
    await expect(page.locator('[data-guide-section="speech"]')).not.toContainText(/(?:90|115)\s*MB/i);
    await expect(page.locator('[data-guide-section="speech"]')).toContainText("切换 Chrome、夸克、小米浏览器、无痕模式或站点域名都需要分别下载");
    await expect(page.locator('[data-guide-section="speech"] a[href*="support.microsoft.com"]')).toBeVisible();
    await expect(page.locator('[data-guide-section="speech"] a[href*="support.apple.com"]').first()).toBeVisible();
    await expect(page.locator('[data-guide-section="speech"] a[href*="support.google.com"]')).toBeVisible();
    await expect(page.locator('[data-guide-section="sync"]')).toContainText("按孩子分别同步");
  });

  test("speech button sends the displayed word to the browser speech API", async ({ page }) => {
    await page.addInitScript(() => {
      const calls = [];
      Object.defineProperty(window, "__speechCalls", { value: calls, writable: false });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: function SpeechSynthesisUtterance(text) { this.text = text; },
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { cancel() {}, speak(utterance) { calls.push(utterance.text); }, getVoices() { return [{ lang: "en-US" }]; } },
      });
    });
    await page.goto("/");
    await openModule(page, "english");
    const word = await page.locator(".word-en").first().textContent();
    await page.locator("[data-speak]").first().click();
    await expect.poll(() => page.evaluate(() => window.__speechCalls)).toEqual([word]);
  });

  test("speech button offers the unified offline package when system speech is unavailable", async ({ page }) => {
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    await page.evaluate(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { getVoices() { return []; }, speak() {} },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: function SpeechSynthesisUtterance() {} });
    });
    await openModule(page, "english");
    const button = page.locator("[data-speak]").first();
    await button.click();
    await expect(page.locator("#shadow-voice-dialog[open]")).toBeVisible();
    await expect(page.locator("#shadow-voice-dialog .voice-dialog-title")).toContainText("离线中英文语音");
    await expect(page.locator("#shadow-voice-dialog .voice-dialog-title")).toContainText("中英双语（Matcha）");
    await expect(page.locator("#shadow-voice-dialog .voice-dialog-desc")).toContainText("版本 1");
    await expect(page.locator("#shadow-voice-dialog .voice-dialog-desc")).toContainText("154.6 MB");
    await expect(page.locator("#shadow-voice-dialog .voice-dialog-desc")).toContainText(origin);
    await page.click('.voice-dialog-actions [data-action="cancel"]');
    await expect(page.locator("#shadow-voice-dialog")).toBeHidden();
  });

  test("number sense keeps exactly one missing number in sequence", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "math");
    const cells = await page.locator(".num-grid .num-cell").allTextContents();
    const missingIndex = cells.indexOf("?");
    expect(missingIndex).toBeGreaterThan(0);
    expect(missingIndex).toBeLessThan(cells.length - 1);
    expect(Number(cells[missingIndex + 1])).toBe(Number(cells[missingIndex - 1]) + 2);
  });

  test("checkin marks module as done", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const btn = page.locator('[data-cmod="chinese-literacy"]');
    const wasDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (!wasDone) {
      await btn.click();
      await expect(btn).toHaveClass(/done/);
    }
  });

  test("keeps the V2 Pilot learning-card snapshot stable for local users, including printing", async ({ page }) => {
    await page.context().addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });
    await page.clock.install({ time: new Date("2026-09-01T01:59:00.000Z") });
    await page.goto("/");
    await openModule(page, "chinese");
    await page.clock.pauseAt(new Date("2026-09-01T02:00:00.000Z"));

    const readWorksheetSnapshot = () => page.evaluate(() => {
      const readRows = (root) => [...root.querySelectorAll("[data-writing-row]")].map((row) => ({
        rowId: row.dataset.writingRowId,
        itemId: row.dataset.writingItemId,
        glyph: row.querySelector("[data-writing-glyph]")?.textContent,
        pinyin: row.querySelector("[data-writing-pinyin]")?.textContent,
        exampleWord: row.querySelector("[data-writing-example-word]")?.textContent,
      }));
      const readSheet = (root) => ({
        assignmentId: root?.dataset.writingAssignmentId,
        dayKey: root?.dataset.writingDayKey,
        packId: root?.dataset.writingPackId,
        packVersion: root?.dataset.writingPackVersion,
        rows: root ? readRows(root) : [],
      });
      return {
        screen: readSheet(document.querySelector("[data-writing-worksheet]")),
        print: readSheet(document.querySelector("[data-writing-print-sheet]")),
        state: window.learningDesk.getState(),
      };
    });
    await expect(page.locator("[data-writing-worksheet]")).toBeVisible();
    await expectRichLearningCards(page.locator("[data-writing-worksheet]"), { includeSpeech: true });
    await expectRichLearningCards(page.locator("[data-writing-print-sheet]"), { gridCells: 9 });
    const beforePrint = await readWorksheetSnapshot();
    expect(beforePrint.screen).toMatchObject({
      dayKey: "2026-09-01",
      packId: "hanzi-writing-v2",
      packVersion: "hanzi-v2-pilot-1",
    });
    expect(beforePrint.screen.rows).toHaveLength(4);
    expect(beforePrint.print).toEqual(beforePrint.screen);

    const popupPromise = page.waitForEvent("popup");
    await page.locator("[data-print]").click();
    const popup = await popupPromise;
    await popup.waitForLoadState("load");
    await expect.poll(() => popup.evaluate(() => window.__printCalls), { timeout: 15000 }).toBe(1);
    expect(await readWorksheetSnapshot()).toEqual(beforePrint);
    await popup.close();

    await page.locator('[data-cmod="chinese-writing"]').click();
    await expect(page.locator('[data-cmod="chinese-writing"]')).toHaveClass(/done/);
    const afterCheckin = await readWorksheetSnapshot();
    expect(afterCheckin.screen).toEqual(beforePrint.screen);
    expect(afterCheckin.print).toEqual(beforePrint.print);
    await page.reload();
    await openModule(page, "chinese");
    await expectRichLearningCards(page.locator("[data-writing-worksheet]"), { includeSpeech: true });
    await expectRichLearningCards(page.locator("[data-writing-print-sheet]"), { gridCells: 9 });
    const afterReload = await readWorksheetSnapshot();
    expect(afterReload.screen).toEqual(beforePrint.screen);
    expect(afterReload.print).toEqual(beforePrint.print);
    expect(afterReload.print).toEqual(afterReload.screen);
    await expect(page.locator('[data-cmod="chinese-writing"]')).toHaveClass(/done/);
  });

  test("checkin can be cancelled by clicking again", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "book");
    const btn = page.locator('[data-cmod="book-reading"]');
    const initiallyDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (initiallyDone) await btn.click();
    await expect(btn).not.toHaveClass(/done/);
    await btn.click();
    await expect(btn).toHaveClass(/done/);
    await btn.click();
    await expect(btn).not.toHaveClass(/done/);
  });

  test("cancelling one checkin does not cancel other tasks in the module", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const buttons = page.locator('[data-cmod^="chinese-"]');
    await expect(buttons).toHaveCount(3);
    for (const button of await buttons.all()) {
      if (await button.evaluate((el) => el.classList.contains("done"))) await button.click();
    }
    await buttons.first().click();
    await expect(buttons.first()).toHaveClass(/done/);
    await expect(buttons.nth(1)).not.toHaveClass(/done/);
    await expect(buttons.nth(2)).not.toHaveClass(/done/);
    await buttons.first().click();
    await expect(buttons.first()).not.toHaveClass(/done/);
  });

  test("points toggle changes card state", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');
    const toggle = page.locator(".pts-toggle").first();
    await expect(toggle).toBeVisible();
    const card = page.locator(".pts-card").first();
    const wasDone = await card.evaluate((el) => el.classList.contains("done"));
    await toggle.click();
    if (wasDone) {
      await expect(card).not.toHaveClass(/done/);
    } else {
      await expect(card).toHaveClass(/done/);
    }
  });

  test("growth and points calendars explain their status colors", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".banner .d")).toContainText("/4");
    await page.click('[data-mod="grow"]');
    await expect(page.locator(".cal-legend")).toContainText("未打卡");
    await expect(page.locator(".cal-legend")).toContainText("4/4");
    await expect(page.locator(".cal-cell.today")).toBeVisible();

    await page.click('[data-mod="points"]');
    await expect(page.locator(".cal")).toHaveCSS("display", "grid");
    await expect(page.locator(".cal-legend + .cal")).toHaveCSS("margin-top", "12px");
    await expect(page.locator(".cal-legend")).toContainText("有加分");
    await expect(page.locator(".cal-legend")).toContainText("有扣分");
    await expect(page.locator(".cal-legend")).toContainText("当前选中");
    await expect(page.locator(".cal-chip.active")).toHaveAttribute("aria-pressed", "true");

    await page.locator(".pts-toggle").first().click();
    await expect(page.locator(".cal-chip.active")).toHaveClass(/pos/);
  });

  test("math quiz shows feedback", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "math");
    await expect(page.locator("#qq")).toBeVisible();
    await page.fill("#qa", "999");
    await page.click("#qsubmit");
    const feedback = page.locator("#qf");
    await expect(feedback).not.toBeEmpty();
  });

  test("book shelf marks read status", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "book");
    const card = page.locator("[data-bk]").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS("opacity", "0.55");
    await card.click();
    await expect(card).toHaveCSS("opacity", "1");
    await card.click();
    await expect(card).toHaveCSS("opacity", "0.55");
  });

  test("reading log can be added and deleted", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "book");
    await page.fill("#pbTitle", "E2E Test Book");
    await page.locator('.pstar[data-n="5"]').click();
    await page.click("#pbAdd");

    const logRow = page.locator(".log-row").first();
    await expect(logRow).toContainText("E2E Test Book");
    await expect(logRow.locator(".log-stars .ui-icon")).toHaveCount(5);
    await expect(logRow.locator('.log-stars .ui-icon[fill="currentColor"]')).toHaveCount(5);
    await logRow.locator("[data-del]").click();
    await expect(page.locator(".log-row")).toHaveCount(0);
  });

  test("points can be cleared for the current month", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');
    const toggle = page.locator(".pts-toggle").first();
    const card = page.locator(".pts-card").first();
    await toggle.click();
    await expect(card).toHaveClass(/done/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#ptclear");
    await expect(card).not.toHaveClass(/done/);
  });

  test("state persists across navigation", async ({ page }) => {
    await page.goto("/");
    // Do a checkin on chinese
    await openModule(page, "chinese");
    const btn = page.locator('[data-cmod="chinese-literacy"]');
    const wasDone = await btn.evaluate((el) => el.classList.contains("done"));
    if (!wasDone) await btn.click();
    // Navigate away and back
    await openModule(page, "math");
    await openModule(page, "chinese");
    // Checkin should still be done
    const btn2 = page.locator('[data-cmod="chinese-literacy"]');
    await expect(btn2).toHaveClass(/done/);
  });

  test("state persists across a reload", async ({ page }) => {
    await page.goto("/");
    await openModule(page, "chinese");
    const btn = page.locator('[data-cmod="chinese-literacy"]');
    if (!(await btn.evaluate((el) => el.classList.contains("done")))) await btn.click();
    await page.reload();
    await openModule(page, "chinese");
    await expect(page.locator('[data-cmod="chinese-literacy"]')).toHaveClass(/done/);
  });
});
