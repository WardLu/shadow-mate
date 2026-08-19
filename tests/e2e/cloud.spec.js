import { test, expect } from "@playwright/test";

const PROJECT_REF = "dutepjyocxcvecmsrtfp";
const HOUSEHOLD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const emptyState = {
  checkins: {},
  extra: {},
  points: {},
  bookShelf: {},
  peanutLog: [],
  peanutRead: {},
};

async function seedAuthenticatedSession(page) {
  const configuredUrl = process.env.VITE_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
  const projectRef = new URL(configuredUrl).hostname.split(".")[0];
  await page.addInitScript(({ projectRef, userId }) => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Math.floor(Date.now() / 1000);
    sessionStorage.setItem(
      `sb-${projectRef}-auth-token`,
      JSON.stringify({
        access_token: "e2e-access-token",
        refresh_token: "e2e-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: "parent@example.test",
        },
      }),
    );
  }, { projectRef, userId: USER_ID });
}

async function mockCloudApi(page, {
  remoteState = emptyState,
  rpcResponses = ["success"],
  legacyImportResponses = ["success"],
  growthPointItemsFailures = 0,
  growthPointItemsResponses = null,
  hasPassword = true,
  createDelayMs = 0,
  householdCreateDelayMs = 0,
  noMembership = false,
} = {}) {
  let state = structuredClone(remoteState);
  let version = 3;
  let rpcIndex = 0;
  let legacyImportIndex = 0;
  let growthPointItemsRequests = 0;
  let growthPointItemsResponseIndex = 0;
  const rpcPayloads = [];
  const legacyImportPayloads = [];
  const activityPayloads = [];
  const deletedProfiles = [];
  const deletedHouseholds = [];
  const createdProfiles = [];
  const createdHouseholds = [];
  const createdConsents = [];
  let profileExists = true;

  await page.route("**/auth/v1/logout**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/rpc/learning_save_state")) {
      const payload = JSON.parse(request.postData() || "{}");
      rpcPayloads.push(payload);
      const response = rpcResponses[Math.min(rpcIndex++, rpcResponses.length - 1)];
      if (response === "conflict") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "P0001", message: "learning_state_conflict" }),
        });
        return;
      }
      state = payload.p_state;
      version += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version, updated_at: "2026-08-01T09:00:00.000Z" }),
      });
      return;
    }

    if (path.endsWith("/rpc/learning_import_legacy_points")) {
      const payload = JSON.parse(request.postData() || "{}");
      legacyImportPayloads.push(payload);
      const response = legacyImportResponses[Math.min(legacyImportIndex++, legacyImportResponses.length - 1)];
      if (response === "retryable") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "PGRST000", details: null, hint: null, message: "upstream unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "legacy-ledger-1" }]),
      });
      return;
    }

    if (path.endsWith("/rpc/learning_record_activity_event")) {
      activityPayloads.push(JSON.parse(request.postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      return;
    }

    if (path.endsWith("/rpc/learning_has_password")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hasPassword) });
      return;
    }

    if (path.endsWith("/learning_point_items")) {
      growthPointItemsRequests += 1;
      const response = growthPointItemsResponses?.[
        Math.min(growthPointItemsResponseIndex++, growthPointItemsResponses.length - 1)
      ] || (growthPointItemsRequests <= growthPointItemsFailures ? "retryable" : "success");
      if (response === "retryable") {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ code: "PGRST000", details: null, hint: null, message: "snapshot unavailable" }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if ([
      "/learning_profile_point_items",
      "/learning_rewards",
      "/learning_profile_rewards",
      "/learning_point_ledger",
      "/learning_redemptions",
    ].some((suffix) => path.endsWith(suffix))) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (path.endsWith("/rpc/learning_delete_household")) {
      deletedHouseholds.push(JSON.parse(request.postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    if (path.endsWith("/learning_household_members")) {
      if (request.method() === "POST") {
        await route.fulfill({ status: 201, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(noMembership ? [] : [{ household_id: HOUSEHOLD_ID, role: "owner" }]),
      });
      return;
    }

    if (path.endsWith("/learning_guardian_consents")) {
      if (request.method() === "POST") {
        createdConsents.push(JSON.parse(request.postData() || "{}"));
        await route.fulfill({ status: 201, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(noMembership ? [] : [{ household_id: HOUSEHOLD_ID }]),
      });
      return;
    }

    if (path.endsWith("/learning_profiles")) {
      if (request.method() === "POST") {
        const payload = JSON.parse(request.postData() || "{}");
        createdProfiles.push(payload);
        if (createDelayMs) await new Promise((resolve) => setTimeout(resolve, createDelayMs));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            household_id: HOUSEHOLD_ID,
            display_name: payload.display_name,
            grade_level: payload.grade_level,
          }),
        });
        return;
      }
      if (request.method() === "DELETE") {
        deletedProfiles.push(url.searchParams.get("id"));
        profileExists = false;
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(profileExists ? [{
          id: PROFILE_ID,
          household_id: HOUSEHOLD_ID,
          display_name: "E2E Learner",
          grade_level: 3,
        }] : []),
      });
      return;
    }

    if (path.endsWith("/learning_profile_states")) {
      const select = url.searchParams.get("select") || "";
      const body = select.includes("state")
        ? [{ profile_id: PROFILE_ID, state, version, updated_at: "2026-08-01T08:00:00.000Z" }]
        : [{ profile_id: PROFILE_ID, updated_at: "2026-08-01T08:00:00.000Z" }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      return;
    }

    if (path.endsWith("/learning_households")) {
      if (request.method() === "POST") {
        createdHouseholds.push(JSON.parse(request.postData() || "{}"));
        if (householdCreateDelayMs) await new Promise((resolve) => setTimeout(resolve, householdCreateDelayMs));
        await route.fulfill({ status: 201, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ name: "E2E Family" }]),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "unmocked endpoint" }) });
  });

  return {
    rpcPayloads,
    legacyImportPayloads,
    activityPayloads,
    deletedProfiles,
    deletedHouseholds,
    createdProfiles,
    createdHouseholds,
    createdConsents,
    getGrowthPointItemsRequests: () => growthPointItemsRequests,
    getState: () => state,
  };
}

test.describe("Authenticated cloud workspace", () => {
  test("backs off repeated Growth Loop snapshot 5xx responses instead of polling every second", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { growthPointItemsFailures: Number.POSITIVE_INFINITY });

    await page.goto("/");
    await expect.poll(() => api.getGrowthPointItemsRequests()).toBeGreaterThan(0);
    const requestsBeforeWindow = api.getGrowthPointItemsRequests();
    // Negative timing assertion: fixed 1s polling reaches at least four calls
    // in this window, while exponential backoff adds at most two calls.
    await page.waitForTimeout(4500);
    expect(api.getGrowthPointItemsRequests() - requestsBeforeWindow).toBeLessThanOrEqual(2);
  });

  test("retries the first Growth Loop snapshot fetch failure", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { growthPointItemsFailures: 1 });

    await page.goto("/");

    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => api.getGrowthPointItemsRequests(), { timeout: 5000 }).toBe(2);
  });

  test("retries a failed Growth Loop snapshot immediately when the browser comes online", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-20T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-08-20T00:00:00Z"));
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { growthPointItemsFailures: Number.POSITIVE_INFINITY });

    await page.goto("/");
    await expect.poll(() => api.getGrowthPointItemsRequests()).toBeGreaterThan(0);
    const requestsBeforeOnline = api.getGrowthPointItemsRequests();

    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.clock.runFor(0);

    await expect.poll(() => api.getGrowthPointItemsRequests()).toBe(requestsBeforeOnline + 1);
  });

  test("resets snapshot backoff after a successful fetch", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-08-20T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-08-20T00:00:00Z"));
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      growthPointItemsResponses: ["retryable", "success", "retryable", "success"],
    });

    await page.goto("/");
    await expect.poll(() => api.getGrowthPointItemsRequests()).toBe(1);

    await page.clock.runFor(1300);
    await expect.poll(() => api.getGrowthPointItemsRequests()).toBe(2);
    await page.evaluate(() => Promise.resolve());

    await page.evaluate(() => window.cloudSync.scheduleGrowthLoop());
    await page.clock.runFor(600);
    await expect.poll(() => api.getGrowthPointItemsRequests()).toBe(3);
    await page.evaluate(() => Promise.resolve());

    await page.clock.runFor(1300);
    await expect.poll(() => api.getGrowthPointItemsRequests()).toBe(4);
  });

  test("retries the same legacy import batch after the browser comes online", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { legacyImportResponses: ["retryable", "success"] });
    const batchId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => api.activityPayloads.length).toBeGreaterThan(0);
    await page.evaluate(async ({ batchId }) => {
      await window.growthLoop.importLegacyPoints({
        request_id: batchId,
        entries: [{
          occurred_on: "2026-08-01",
          delta: 2,
          item_name_snapshot: "一起做家务",
          note: "旧积分记录",
        }],
      });
      window.cloudSync.scheduleGrowthLoop();
    }, { batchId });

    await expect.poll(() => api.legacyImportPayloads.length, { timeout: 5000 }).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => api.legacyImportPayloads.length, { timeout: 5000 }).toBe(2);
    expect(api.legacyImportPayloads[1]).toEqual(api.legacyImportPayloads[0]);
    expect(api.legacyImportPayloads[1]).toEqual(expect.objectContaining({
      p_profile_id: PROFILE_ID,
      p_request_id: batchId,
      p_entries: [expect.objectContaining({ delta: 2 })],
    }));
    expect(api.legacyImportPayloads[1].p_entries[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("creates only one household after rapid repeated setup clicks", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { noMembership: true, householdCreateDelayMs: 500 });

    await page.goto("/");
    // onAuthChange auto-opens the dialog for users without a household
    await expect(page.locator("#householdSetupForm")).toBeVisible();
    await page.locator('#householdSetupForm input[name="household"]').fill("重复创建测试家庭");
    await page.locator('#householdSetupForm input[name="learner"]').fill("测试学习者");
    await page.locator('#householdSetupForm input[name="guardianConsent"]').check();
    await page.evaluate(() => {
      const button = document.querySelector('#householdSetupForm button[type="submit"]');
      for (let index = 0; index < 5; index += 1) button.click();
    });

    await expect.poll(() => api.createdHouseholds.length).toBe(1);
    await expect.poll(() => api.createdConsents.length).toBe(1);
    expect(api.createdConsents[0]).toEqual(expect.objectContaining({
      consent_type: "learner_data_processing",
      policy_version: "privacy-v2",
    }));
  });

  test("loads a learner profile and completes a manual cloud sync", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await expect(page.locator("#cloudPanel .learner-choice")).toBeVisible();
    await expect(page.locator("#cloudPanel")).toContainText("E2E Learner");

    await page.click("[data-sync]");
    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    await expect(page.locator("#syncToast")).toBeVisible();
  });

  test("creates only one learner after rapid repeated clicks", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { createDelayMs: 500 });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("快速点击测试");
    await page.evaluate(() => {
      const button = document.querySelector('#addLearnerForm button[type="submit"]');
      for (let index = 0; index < 5; index += 1) button.click();
    });

    await expect.poll(() => api.createdProfiles.length).toBe(1);
    await expect(page.locator("#syncToast")).toHaveText("已添加新的学习者");
  });

  test("retries after a version conflict and keeps the remote state", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      remoteState: { ...emptyState, extra: { conflictMarker: "remote" } },
      rpcResponses: ["conflict", "success"],
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-sync]");
    await expect.poll(() => api.rpcPayloads.length).toBe(2);
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("shadow_mate_workbench_v1") || "{}").extra?.conflictMarker)).toBe("remote");
    expect(api.rpcPayloads[1]).toHaveProperty("p_profile_id", PROFILE_ID);
  });

  test("stops after repeated version conflicts instead of retrying forever", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { rpcResponses: ["conflict"] });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-sync]");

    await expect.poll(() => api.rpcPayloads.length).toBe(3);
    await expect(page.locator("#syncToast")).toContainText("自动同步已暂停");
    await page.waitForTimeout(300);
    expect(api.rpcPayloads).toHaveLength(3);
  });

  test("blocks automatic sync after conflict circuit-breaker trips", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { rpcResponses: ["conflict"] });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-sync]");

    // Wait for the 3 RPC calls (initial + 2 retries) to complete
    await expect.poll(() => api.rpcPayloads.length).toBe(3);
    await expect(page.locator("#syncToast")).toContainText("自动同步已暂停");

    // Trigger an automatic sync attempt - should NOT produce a 4th RPC
    // because the circuit breaker is active. Hard wait because this is a
    // negative assertion: we must wait longer than the 500 ms debounce.
    await page.evaluate(() => window.cloudSync?.schedule());
    await page.waitForTimeout(1200);
    expect(api.rpcPayloads).toHaveLength(3);

    // Manual sync button should clear the circuit breaker and retry.
    // The dialog is still open because we used evaluate instead of nav clicks.
    await page.click("[data-sync]");
    await expect.poll(() => api.rpcPayloads.length).toBe(4);
  });

  test("recovers from circuit-breaker after manual sync succeeds", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCloudApi(page, { rpcResponses: [] });
    let callCount = 0;
    await page.route("**/rest/v1/rpc/learning_save_state", async (route) => {
      callCount += 1;
      if (callCount <= 3) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "P0001", message: "learning_state_conflict" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: 99, updated_at: "2026-08-04T09:00:00.000Z" }),
      });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-sync]");

    await expect.poll(() => callCount).toBe(3);
    await expect(page.locator("#syncToast")).toContainText("自动同步已暂停");

    // Manual sync - should succeed and clear the breaker.
    // The dialog is still open because we used evaluate instead of nav clicks.
    await page.click("[data-sync]");
    await expect.poll(() => callCount).toBe(4);
    await expect(page.locator("#syncToast")).toContainText("云端记录已更新");

    // Automatic sync should work again now
    await page.evaluate(() => window.cloudSync?.schedule());
    await expect.poll(() => callCount).toBe(5);
  });

  test("lets a guardian delete a learner and its local cache", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);
    await page.addInitScript(() => {
      window.confirm = () => true;
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-delete-profile]");
    await expect.poll(() => api.deletedProfiles.length).toBe(1);
    await expect(page.locator("#cloudPanel .learner-choice")).toHaveCount(0);
    await expect(page.evaluate(() => JSON.parse(localStorage.getItem("shadow_mate_workbench_v1") || "{}").checkins)).resolves.toEqual({});
  });

  test("exports family data and lets the owner delete the family workspace", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);
    await page.addInitScript(() => {
      window.confirm = () => true;
    });

    await page.goto("/");
    await page.click("#accountButton");
    const downloadPromise = page.waitForEvent("download");
    await page.click("[data-export]");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^shadow-mate-family-\d{4}-\d{2}-\d{2}\.json$/);

    await page.click("[data-delete-household]");
    await expect.poll(() => api.deletedHouseholds.length).toBe(1);
    expect(api.deletedHouseholds[0]).toEqual({ p_household_id: HOUSEHOLD_ID });
    await expect(page.locator("#syncToast")).toHaveText("家庭数据已删除，已退出登录");
  });
  test("returns to local mode after signing out of the cloud workspace", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCloudApi(page);

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-signout]");

    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
  });
});

test.describe("Email OTP sign-in", () => {
  test("resends an OTP and locks the resend control", async ({ page }) => {
    let otpRequests = 0;
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/otp**", async (route) => {
      otpRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#emailLoginForm input[name="email"]').fill("resend-parent@example.test");
    await page.click('#emailLoginForm button[type="submit"]');
    await expect(page.locator("#emailOtpForm")).toBeVisible();
    await page.click("[data-resend]");

    await expect.poll(() => otpRequests).toBe(2);
    await expect(page.locator("#syncToast")).toHaveText("新的验证码已发送");
    await expect(page.locator("[data-resend]")).toBeDisabled();
  });

  test("translates OTP resend failures into Chinese", async ({ page }) => {
    let otpRequests = 0;
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/otp**", async (route) => {
      otpRequests += 1;
      if (otpRequests === 1) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "over_email_send_rate_limit",
          error_description: "For security purposes, you can only request this after 7 seconds.",
        }),
      });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#emailLoginForm input[name="email"]').fill("resend-error@example.test");
    await page.click('#emailLoginForm button[type="submit"]');
    await page.click("[data-resend]");

    await expect.poll(() => otpRequests).toBe(2);
    await expect(page.locator("#syncToast")).toHaveText("请求过于频繁，请等待 7 秒后再试。");
  });

  test("rejects malformed and expired OTPs with user-facing feedback", async ({ page }) => {
    let verifyRequests = 0;
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route("**/auth/v1/verify**", async (route) => {
      verifyRequests += 1;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "otp_expired", error_description: "Token has expired" }),
      });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#emailLoginForm input[name="email"]').fill("otp-error@example.test");
    await page.click('#emailLoginForm button[type="submit"]');
    await page.locator('#emailOtpForm input[name="token"]').fill("abc");
    await page.evaluate(() => {
      document.querySelector("#emailOtpForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect(page.locator("#syncToast")).toHaveText("请输入 6-8 位数字验证码");
    expect(verifyRequests).toBe(0);

    await page.waitForTimeout(600);
    await page.locator('#emailOtpForm input[name="token"]').fill("123456");
    await page.click('#emailOtpForm button[type="submit"]');
    await expect.poll(() => verifyRequests).toBe(1);
    await expect(page.locator("#syncToast")).toHaveText("验证码已过期，请重新发送验证码。");
  });

  test("translates an auth cooldown error into Chinese", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/otp**", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "over_email_send_rate_limit",
          error_description: "For security purposes, you can only request this after 7 seconds.",
          msg: "For security purposes, you can only request this after 7 seconds.",
        }),
      });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#emailLoginForm input[name="email"]').fill("cooldown-parent@example.test");
    await page.click('#emailLoginForm button[type="submit"]');

    await expect(page.locator("#syncToast")).toHaveText("请求过于频繁，请等待 7 秒后再试。");
  });

  test("lets an unregistered user enter the signup code", async ({ page }) => {
    let otpRequests = 0;
    let verifyRequests = 0;
    const now = Math.floor(Date.now() / 1000);
    const authSession = {
      access_token: "otp-e2e-access-token",
      refresh_token: "otp-e2e-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: USER_ID,
        aud: "authenticated",
        role: "authenticated",
        email: "otp-parent@example.test",
      },
    };

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/otp**", async (route) => {
      otpRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route("**/auth/v1/verify**", async (route) => {
      verifyRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authSession) });
    });
    await mockCloudApi(page);

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#emailLoginForm input[name="email"]').fill("otp-parent@example.test");
    await page.click('#emailLoginForm button[type="submit"]');

    await expect.poll(() => otpRequests).toBe(1);
    await expect(page.locator("#emailOtpForm")).toBeVisible();
    await page.locator('#emailOtpForm input[name="token"]').fill("123456");
    await page.click('#emailOtpForm button[type="submit"]');

    await expect.poll(() => verifyRequests).toBe(1);
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
  });

  test("prompts a passwordless OTP user to set a shared password", async ({ page }) => {
    let passwordUpdates = 0;
    let updatePayload = null;
    const now = Math.floor(Date.now() / 1000);
    const authSession = {
      access_token: "passwordless-e2e-access-token",
      refresh_token: "passwordless-e2e-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "passwordless@example.test" },
    };
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.route("**/auth/v1/verify**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authSession) }));
    await page.route("**/auth/v1/user**", async (route) => {
      if (route.request().method() === "PUT") {
        passwordUpdates += 1;
        updatePayload = JSON.parse(route.request().postData() || "{}");
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authSession.user) });
    });
    await mockCloudApi(page, { hasPassword: false });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator('#emailLoginForm input[name="email"]').fill("passwordless@example.test");
    await page.click('#emailLoginForm button[type="submit"]');
    await page.locator('#emailOtpForm input[name="token"]').fill("123456");
    await page.click('#emailOtpForm button[type="submit"]');

    await expect(page.locator("#passwordEditorForm")).toBeVisible();
    await expect(page.locator("#cloudPanel")).toContainText("适用于使用同一账号的 Shadow 系列产品");
    await page.locator('#passwordEditorForm input[name="newPassword"]').fill("SharedPassword123!");
    await page.locator('#passwordEditorForm input[name="confirmPassword"]').fill("SharedPassword123!");
    await page.click('#passwordEditorForm button[type="submit"]');
    await expect.poll(() => passwordUpdates).toBe(1);
    expect(updatePayload).toMatchObject({ password: "SharedPassword123!", data: { shared_password_set: true } });
    await expect(page.locator("#syncToast")).toContainText("共享密码已设置");
  });

  test("accepts the custom email link without keeping the token in the URL", async ({ page }) => {
    let verifyRequests = 0;
    const now = Math.floor(Date.now() / 1000);
    const authSession = {
      access_token: "link-e2e-access-token",
      refresh_token: "link-e2e-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: USER_ID,
        aud: "authenticated",
        role: "authenticated",
        email: "link-parent@example.test",
      },
    };

    await page.route("**/auth/v1/verify**", async (route) => {
      verifyRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authSession) });
    });
    await mockCloudApi(page);

    await page.goto("/?token_hash=link-token-hash&type=email");

    await expect.poll(() => verifyRequests).toBe(1);
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
  });
});

test.describe("Shared password authentication", () => {
  test("translates an invalid password login into Chinese", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
      });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click('[data-auth-mode="password"]');
    await page.locator('#emailLoginForm input[name="email"]').fill("wrong-password@example.test");
    await page.locator('#emailLoginForm input[name="password"]').fill("WrongPassword123!");
    await page.click('#emailLoginForm button[type="submit"]');

    await expect(page.locator("#syncToast")).toContainText("邮箱或密码不正确");
    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
  });

  test("does not update a password when current-password reauthentication fails", async ({ page }) => {
    let updateRequests = 0;
    await seedAuthenticatedSession(page);
    await mockCloudApi(page, { hasPassword: true });
    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
      });
    });
    await page.route("**/auth/v1/user**", async (route) => {
      if (route.request().method() === "PUT") updateRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER_ID }) });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-password-settings]");
    await page.locator('#passwordEditorForm input[name="currentPassword"]').fill("WrongCurrentPassword123!");
    await page.locator('#passwordEditorForm input[name="newPassword"]').fill("NewSharedPassword123!");
    await page.locator('#passwordEditorForm input[name="confirmPassword"]').fill("NewSharedPassword123!");
    await page.click('#passwordEditorForm button[type="submit"]');

    await expect(page.locator("#syncToast")).toContainText("邮箱或密码不正确");
    expect(updateRequests).toBe(0);
  });

  test("translates a recovery-request network failure into Chinese", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/functions/v1/check-auth-email", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ registered: true }),
      });
    });
    await page.route("**/auth/v1/recover**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "network_error", error_description: "Failed to fetch" }),
      });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click('[data-auth-mode="password"]');
    await page.locator('#emailLoginForm input[name="email"]').fill("recovery-error@example.test");
    await page.click("[data-forgot-password]");
    await page.click('#passwordRecoveryForm button[type="submit"]');

    await expect(page.locator("#syncToast")).toContainText("密码重设邮件发送失败");
  });

  test("completes password recovery after the PASSWORD_RECOVERY event", async ({ page }) => {
    let updatePayload = null;
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.route("**/auth/v1/user**", async (route) => {
      if (route.request().method() === "PUT") updatePayload = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: USER_ID, aud: "authenticated", role: "authenticated", email: "recovery@example.test" }),
      });
    });
    await mockCloudApi(page, { hasPassword: true });

    await page.goto("/#access_token=recovery-access-token&refresh_token=recovery-refresh-token&expires_in=3600&token_type=bearer&type=recovery");
    await expect(page.locator("#passwordEditorForm")).toBeVisible();
    await expect(page.locator("#cloudPanel h2")).toContainText("重设共享密码");
    await page.locator('#passwordEditorForm input[name="newPassword"]').fill("RecoveredPassword123!");
    await page.locator('#passwordEditorForm input[name="confirmPassword"]').fill("RecoveredPassword123!");
    await page.click('#passwordEditorForm button[type="submit"]');

    await expect.poll(() => updatePayload).not.toBeNull();
    expect(updatePayload).toMatchObject({ password: "RecoveredPassword123!", data: { shared_password_set: true } });
    await expect(page.locator("#syncToast")).toContainText("共享密码已设置");
  });

  test("changes the shared password only after receiving the current password", async ({ page }) => {
    let updatePayload = null;
    let reauthenticationPayload = null;
    await seedAuthenticatedSession(page);
    await mockCloudApi(page, { hasPassword: true });
    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      reauthenticationPayload = JSON.parse(route.request().postData() || "{}");
      const now = Math.floor(Date.now() / 1000);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "reauthenticated-e2e-access-token",
          refresh_token: "reauthenticated-e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "parent@example.test" },
        }),
      });
    });
    await page.route("**/auth/v1/user**", async (route) => {
      updatePayload = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER_ID, email: "parent@example.test" }) });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-password-settings]");
    await expect(page.locator('#passwordEditorForm input[name="currentPassword"]')).toBeVisible();
    await page.locator('#passwordEditorForm input[name="currentPassword"]').fill("CurrentPassword123!");
    await page.locator('#passwordEditorForm input[name="newPassword"]').fill("NewSharedPassword123!");
    await page.locator('#passwordEditorForm input[name="confirmPassword"]').fill("NewSharedPassword123!");
    await page.click('#passwordEditorForm button[type="submit"]');

    await expect.poll(() => updatePayload).not.toBeNull();
    expect(reauthenticationPayload).toMatchObject({
      email: "parent@example.test",
      password: "CurrentPassword123!",
    });
    expect(updatePayload).toMatchObject({ password: "NewSharedPassword123!" });
  });

  test("signs in with an existing shared email password", async ({ page }) => {
    let passwordRequests = 0;
    const now = Math.floor(Date.now() / 1000);
    const authSession = {
      access_token: "password-e2e-access-token",
      refresh_token: "password-e2e-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "password@example.test" },
    };
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      passwordRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authSession) });
    });
    await mockCloudApi(page, { hasPassword: true });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click('[data-auth-mode="password"]');
    await page.locator('#emailLoginForm input[name="email"]').fill("password@example.test");
    await page.locator('#emailLoginForm input[name="password"]').fill("SharedPassword123!");
    await page.click('#emailLoginForm button[type="submit"]');

    await expect.poll(() => passwordRequests).toBe(1);
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
  });

  test("blocks password recovery for an unregistered email", async ({ page }) => {
    let recoveryRequestCount = 0;
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.route("**/functions/v1/check-auth-email", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ registered: false }),
      });
    });
    await page.route("**/auth/v1/recover**", async (route) => {
      recoveryRequestCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click('[data-auth-mode="password"]');
    await page.locator('#emailLoginForm input[name="email"]').fill("unknown@example.test");
    await page.click("[data-forgot-password]");
    await page.click('#passwordRecoveryForm button[type="submit"]');

    await expect(page.locator("#syncToast")).toContainText("该邮箱尚未注册");
    expect(recoveryRequestCount).toBe(0);
  });
});
