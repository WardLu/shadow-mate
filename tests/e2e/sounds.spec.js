import { test, expect } from "@playwright/test";

const STORAGE_KEY = "shadow_mate_sound_settings_v1";

test.describe("Sound effects settings and playback", () => {
  test.use({ serviceWorkers: "block" });

  // 在真实引擎上包一层记录器：既保留真实播放行为，又记录调用与结果。
  async function installPlaySpies(page) {
    await page.evaluate(() => {
      window.__soundCalls = [];
      const engine = window.soundEffects;
      for (const method of ["play", "preview", "playPriority"]) {
        const original = engine[method].bind(engine);
        engine[method] = (...args) => {
          const result = original(...args);
          window.__soundCalls.push({ method, args, result });
          return result;
        };
      }
    });
  }

  function playedEvents(page, method = "play") {
    return page.evaluate(({ method }) => (
      (window.__soundCalls || [])
        .filter((call) => call.method === method && call.result?.played)
        .map((call) => call.args[0])
    ), { method });
  }

  async function storedSettings(page) {
    return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  }

  test("renders the sound settings page with the five fixed events", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="settings"]');
    await expect(page.locator("#snd-master")).toBeVisible();
    await expect(page.locator("#snd-volume")).toBeVisible();
    await expect(page.locator("#snd-reset")).toBeVisible();
    await expect(page.locator("[data-event]")).toHaveCount(5);
    for (const key of ["action_completed", "points_earned", "try_again", "points_deducted", "reward_fulfilled"]) {
      await expect(page.locator(`[data-event-preview="${key}"]`)).toBeVisible();
    }
  });

  test("previews each of the five events", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="settings"]');
    await installPlaySpies(page);
    for (const key of ["action_completed", "points_earned", "try_again", "points_deducted", "reward_fulfilled"]) {
      await page.locator(`[data-event-preview="${key}"]`).click();
    }
    const previewed = await page.evaluate(() => (
      (window.__soundCalls || []).filter((call) => call.method === "preview").map((call) => call.args[0])
    ));
    expect(previewed).toEqual(["action_completed", "points_earned", "try_again", "points_deducted", "reward_fulfilled"]);
  });

  test("master switch and volume persist on this device only", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="settings"]');
    await page.locator("#snd-master").click();
    expect((await storedSettings(page)).enabled).toBe(false);

    await page.locator("#snd-master").click();
    await page.locator("#snd-volume").evaluate((input) => {
      input.value = "30";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const saved = await storedSettings(page);
    expect(saved.enabled).toBe(true);
    expect(saved.volume).toBe(0.3);
    await expect(page.locator("#snd-volume-label")).toHaveText("总音量 30%");
  });

  test("event toggle and variant selection persist", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="settings"]');
    await page.locator('[data-event-enable="points_earned"]').click();
    expect((await storedSettings(page)).events.points_earned.enabled).toBe(false);

    await page.locator('[data-event-enable="points_earned"]').click();
    await page.locator('[data-event-variant="points_earned"]').selectOption("star_triple");
    const saved = await storedSettings(page);
    expect(saved.events.points_earned.enabled).toBe(true);
    expect(saved.events.points_earned.variant).toBe("star_triple");
  });

  test("resets all sound settings to defaults", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="settings"]');
    await page.locator("#snd-volume").evaluate((input) => {
      input.value = "20";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#snd-master").click();
    await page.locator("#snd-reset").click();
    const settings = await page.evaluate(() => window.soundEffects.getSettings());
    expect(settings.enabled).toBe(true);
    expect(settings.volume).toBe(0.6);
    expect(settings.events.points_earned.variant).toBe("star_collect");
  });

  test("plays positive, deducted and retry sounds for point actions", async ({ page }) => {
    await page.goto("/");
    await installPlaySpies(page);
    await page.click('[data-mod="points"]');

    // 创建正分项并加分 → points_earned
    await page.fill('#pointItemForm input[name="name"]', "自己刷牙");
    await page.fill('#pointItemForm input[name="points"]', "2");
    await page.click('#pointItemForm button[type="submit"]');
    let card = page.locator(".pts-card").filter({ hasText: "自己刷牙" });
    await expect(card).toBeVisible();
    await card.locator(".pts-toggle").click();
    await expect(card).toHaveClass(/done/);
    await expect.poll(async () => (await playedEvents(page, "play"))).toContain("points_earned");

    // 撤销上一条记录 → try_again（等待上一音效结束，避免防叠加门控）
    await page.waitForTimeout(600);
    card = page.locator(".pts-card").filter({ hasText: "自己刷牙" });
    await card.locator(".pts-toggle").click();
    await expect.poll(async () => (await playedEvents(page, "play"))).toContain("try_again");

    // 创建减分项并扣分 → points_deducted
    await page.waitForTimeout(600);
    await page.fill('#pointItemForm input[name="name"]', "不收玩具");
    await page.fill('#pointItemForm input[name="points"]', "-1");
    await page.click('#pointItemForm button[type="submit"]');
    card = page.locator(".pts-card").filter({ hasText: "不收玩具" });
    await expect(card).toBeVisible();
    await card.locator(".pts-toggle").click();
    await expect.poll(async () => (await playedEvents(page, "play"))).toContain("points_deducted");
  });

  test("plays a completion sound when checking in", async ({ page }) => {
    await page.goto("/");
    await installPlaySpies(page);
    await page.click('[data-mod="chinese"]');
    await page.locator('[data-cmod="chinese-literacy"]').click();
    expect(await playedEvents(page, "play")).toContain("action_completed");
  });
});
