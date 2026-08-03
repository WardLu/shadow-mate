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
  hasPassword = true,
  createDelayMs = 0,
  householdCreateDelayMs = 0,
  noMembership = false,
} = {}) {
  let state = structuredClone(remoteState);
  let version = 3;
  let rpcIndex = 0;
  const rpcPayloads = [];
  const deletedProfiles = [];
  const deletedHouseholds = [];
  const createdProfiles = [];
  const createdHouseholds = [];
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

    if (path.endsWith("/rpc/learning_has_password")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hasPassword) });
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
    deletedProfiles,
    deletedHouseholds,
    createdProfiles,
    createdHouseholds,
    getState: () => state,
  };
}

test.describe("Authenticated cloud workspace", () => {
  test("creates only one household after rapid repeated setup clicks", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { noMembership: true, householdCreateDelayMs: 500 });

    await page.goto("/");
    await page.click("#accountButton");
    await expect(page.locator("#householdSetupForm")).toBeVisible();
    await page.locator('#householdSetupForm input[name="household"]').fill("重复创建测试家庭");
    await page.locator('#householdSetupForm input[name="learner"]').fill("测试学习者");
    await page.evaluate(() => {
      const button = document.querySelector('#householdSetupForm button[type="submit"]');
      for (let index = 0; index < 5; index += 1) button.click();
    });

    await expect.poll(() => api.createdHouseholds.length).toBe(1);
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
    await expect(page.locator("#syncToast")).toContainText("云端记录已被其他设备更新，请刷新后再试。");
    await page.waitForTimeout(300);
    expect(api.rpcPayloads).toHaveLength(3);
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
      if (route.request().method() === "PUT") passwordUpdates += 1;
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
    expect(updatePayload).toMatchObject({ password: "RecoveredPassword123!" });
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

  test("requests a branded recovery email without revealing account existence", async ({ page }) => {
    let recoveryRequestUrl = "";
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.route("**/auth/v1/recover**", async (route) => {
      recoveryRequestUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click('[data-auth-mode="password"]');
    await page.locator('#emailLoginForm input[name="email"]').fill("unknown@example.test");
    await page.click("[data-forgot-password]");
    await page.click('#passwordRecoveryForm button[type="submit"]');

    await expect.poll(() => recoveryRequestUrl).toContain("redirect_to=http%3A%2F%2F127.0.0.1");
    await expect(page.locator("#cloudPanel")).toContainText("如果该邮箱已注册，密码重设邮件已经发送");
  });
});
