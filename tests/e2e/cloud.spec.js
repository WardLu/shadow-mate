import { test, expect } from "@playwright/test";

const PROJECT_REF = "dutepjyocxcvecmsrtfp";
const HOUSEHOLD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_PROFILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THIRD_PROFILE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const FIXED_WRITING_TIME = new Date(2026, 7, 20, 9, 0, 0).getTime();
const EXPECTED_WRITING_GROUPS = ["木山中", "田土石", "天王马", "牛羊鸟"];

const emptyState = {
  checkins: {},
  extra: {},
  points: {},
  bookShelf: {},
  peanutLog: [],
  peanutRead: {},
};

async function freezeWritingDate(page) {
  await page.addInitScript((fixedTime) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        if (args.length === 0) super(fixedTime);
        else super(...args);
      }

      static now() {
        return fixedTime;
      }
    }
    window.Date = FixedDate;
  }, FIXED_WRITING_TIME);
}

async function openModule(page, mod) {
  await page.click('[data-mod="learning"]');
  await page.click(`[data-go="${mod}"]`);
}

async function seedAuthenticatedSession(page) {
  const configuredUrl = process.env.VITE_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
  const projectRef = new URL(configuredUrl).hostname.split(".")[0];
  await page.addInitScript(({ projectRef, userId }) => {
    if (window.name !== "shadow-mate-e2e-seeded") {
      localStorage.clear();
      sessionStorage.clear();
      window.name = "shadow-mate-e2e-seeded";
    }
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
  growthPointItemsDelayMs = 0,
  rpcDelayMs = 0,
  hasPassword = true,
  createDelayMs = 0,
  householdCreateDelayMs = 0,
  noMembership = false,
  createdProfileIds = [SECOND_PROFILE_ID],
  profileStateResponses = {},
  profileStateData = {},
  profileStateVersions = {},
  initialProfiles = [],
} = {}) {
  let state = structuredClone(remoteState);
  let version = 3;
  let rpcIndex = 0;
  let legacyImportIndex = 0;
  let rpcSettledCount = 0;
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
  const profileRows = [{
    id: PROFILE_ID,
    household_id: HOUSEHOLD_ID,
    display_name: "E2E Learner",
    grade_level: 3,
  }, ...initialProfiles];
  let householdCreated = !noMembership;
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
      const responseIndex = rpcIndex++;
      const response = rpcResponses[Math.min(responseIndex, rpcResponses.length - 1)];
      const responseDelayMs = Array.isArray(rpcDelayMs)
        ? rpcDelayMs[Math.min(responseIndex, rpcDelayMs.length - 1)]
        : rpcDelayMs;
      if (responseDelayMs) await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
      if (response === "conflict") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "P0001", message: "learning_state_conflict" }),
        });
        rpcSettledCount += 1;
        return;
      }
      state = payload.p_state;
      version += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version, updated_at: "2026-08-01T09:00:00.000Z" }),
      });
      rpcSettledCount += 1;
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
      if (growthPointItemsDelayMs) await new Promise((resolve) => setTimeout(resolve, growthPointItemsDelayMs));
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
        householdCreated = true;
        await route.fulfill({ status: 201, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(householdCreated ? [{ household_id: HOUSEHOLD_ID, role: "owner" }] : []),
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
        body: JSON.stringify(householdCreated ? [{ household_id: HOUSEHOLD_ID }] : []),
      });
      return;
    }

    if (path.endsWith("/learning_profiles")) {
      if (request.method() === "POST") {
        const payload = JSON.parse(request.postData() || "{}");
        createdProfiles.push(payload);
        const profileId = createdProfileIds[Math.min(createdProfiles.length - 1, createdProfileIds.length - 1)];
        const createdProfile = {
          id: profileId,
          household_id: HOUSEHOLD_ID,
          display_name: payload.display_name,
          grade_level: payload.grade_level,
        };
        if (createDelayMs) await new Promise((resolve) => setTimeout(resolve, createDelayMs));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(createdProfile),
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
        body: JSON.stringify(profileExists ? profileRows : []),
      });
      return;
    }

    if (path.endsWith("/learning_profile_states")) {
      const profileFilter = url.searchParams.get("profile_id") || "";
      const requestedProfileId = profileFilter.replace(/^eq\./, "");
      const response = profileStateResponses[requestedProfileId];
      if (response === "error") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "PGRST000", message: "profile state unavailable" }),
        });
        return;
      }
      const select = url.searchParams.get("select") || "";
      const profileState = profileStateData[requestedProfileId] ?? state;
      const profileVersion = profileStateVersions[requestedProfileId] ?? version;
      const body = select.includes("state")
        ? [{ profile_id: requestedProfileId || PROFILE_ID, state: profileState, version: profileVersion, updated_at: "2026-08-01T08:00:00.000Z" }]
        : [{ profile_id: requestedProfileId || PROFILE_ID, updated_at: "2026-08-01T08:00:00.000Z" }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      return;
    }

    if (path.endsWith("/learning_households")) {
      if (request.method() === "POST") {
        createdHouseholds.push(JSON.parse(request.postData() || "{}"));
        householdCreated = true;
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
    getRpcSettledCount: () => rpcSettledCount,
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
    const clockStart = new Date(Date.now() + 60_000);
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(clockStart);
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
  });

  test("does not reopen password setup over a just-closed account dialog", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCloudApi(page, {
      noMembership: true,
      hasPassword: false,
      growthPointItemsDelayMs: 300,
    });

    await page.goto("/");
    await expect(page.locator("#householdSetupForm")).toBeVisible();
    await page.locator('#householdSetupForm input[name="household"]').fill("延迟同步测试家庭");
    await page.locator('#householdSetupForm input[name="learner"]').fill("延迟同步学习者");
    await page.locator('#householdSetupForm input[name="guardianConsent"]').check();
    await page.locator("#householdSetupForm").getByRole("button", { name: "创建并同步" }).click();
    await expect(page.locator('#accountButton[data-state="online"]')).toHaveAttribute("title", /E2E Learner/);

    const cloudDialog = page.locator("#cloudDialog");
    await cloudDialog.evaluate((element) => {
      if (element.open) element.close();
    });
    await page.waitForTimeout(500);
    await page.click("#accountButton");
    await expect(page.locator("#cloudPanel .learner-choice")).toContainText("E2E Learner");
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

  test("shows the same daily writing workbook after a logged-in state update", async ({ page }) => {
    await freezeWritingDate(page);
    await seedAuthenticatedSession(page);
    await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await openModule(page, "chinese");

    const writingGroups = page.locator(".write-grid");
    await expect(writingGroups).toHaveText(EXPECTED_WRITING_GROUPS);
    const beforeCheckin = await writingGroups.allTextContents();

    await page.locator('[data-cmod="chinese-writing"]').click();
    await expect(writingGroups).toHaveText(beforeCheckin);

    await page.evaluate(() => {
      window.print = () => {
        window.__printedWritingGroups = [...document.querySelectorAll(".write-grid")]
          .map((element) => element.textContent);
      };
    });
    await page.locator("[data-print]").click();
    await expect.poll(() => page.evaluate(() => window.__printedWritingGroups)).toEqual(beforeCheckin);
  });

  test("switches learners after the local IndexedDB connection closes and updates the active style", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => {
        const request = open(...args);
        if (args[0] === "shadow-mate-learning-v1") {
          request.addEventListener("success", () => {
            window.__learningDbConnection = request.result;
          });
        }
        return request;
      };
    });
    await seedAuthenticatedSession(page);
    await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.__learningDbConnection))).toBe(true);
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const secondProfileId = SECOND_PROFILE_ID;
    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${secondProfileId}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    await page.evaluate(() => window.__learningDbConnection.close());
    await firstChoice.click();

    await expect(firstChoice).toHaveClass(/active/);
    await expect(secondChoice).not.toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.growthLoop.getScope().profile_id)).toBe(PROFILE_ID);
    expect(pageErrors).toEqual([]);
  });

  test("keeps the current learner active and shows a retryable error when IndexedDB reopen fails", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      window.__rejectLearningDbReopen = false;
      indexedDB.open = (...args) => {
        if (args[0] === "shadow-mate-learning-v1" && window.__rejectLearningDbReopen) {
          const request = {};
          queueMicrotask(() => {
            request.error = new DOMException("Local Growth Loop database could not reopen.", "UnknownError");
            request.onerror?.();
          });
          return request;
        }
        const request = open(...args);
        if (args[0] === "shadow-mate-learning-v1") {
          request.addEventListener("success", () => {
            window.__learningDbConnection = request.result;
          });
        }
        return request;
      };
    });
    await seedAuthenticatedSession(page);
    await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.__learningDbConnection))).toBe(true);
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const secondProfileId = SECOND_PROFILE_ID;
    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${secondProfileId}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    await page.evaluate(() => {
      window.__growthWriteScopes = [];
      const queueActivity = window.growthLoop.queueActivity.bind(window.growthLoop);
      window.growthLoop.queueActivity = async (...args) => {
        window.__growthWriteScopes.push(window.growthLoop.getScope().profile_id);
        return queueActivity(...args);
      };
      let failNextProfileLoad = true;
      const hasPendingData = window.growthLoop.hasPendingData.bind(window.growthLoop);
      window.growthLoop.hasPendingData = async (...args) => {
        const result = await hasPendingData(...args);
        if (failNextProfileLoad) {
          failNextProfileLoad = false;
          window.__learningDbConnection.close();
          window.__rejectLearningDbReopen = true;
        }
        return result;
      };
    });

    await firstChoice.click();

    await expect(secondChoice).toHaveClass(/active/);
    await expect(firstChoice).not.toHaveClass(/active/);
    await expect(page.locator("#syncToast")).toContainText("当前孩子未变，请重试");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("shadow_mate_active_profile"))).toBe(secondProfileId);
    await expect.poll(() => page.evaluate(() => window.growthLoop.getScope().profile_id)).toBe(secondProfileId);
    await expect.poll(() => page.evaluate(() => window.__growthWriteScopes)).toEqual([]);

    await page.evaluate(() => {
      window.__rejectLearningDbReopen = false;
    });
    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.growthLoop.getScope().profile_id)).toBe(PROFILE_ID);
    expect(pageErrors).toEqual([]);
  });

  test("serializes rapid profile switches and keeps every scope on the last learner", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    api.activityPayloads.length = 0;
    await page.evaluate(({ firstProfileId, secondProfileId }) => {
      window.__growthActivityScopes = [];
      const queueActivity = window.growthLoop.queueActivity.bind(window.growthLoop);
      window.growthLoop.queueActivity = async (...args) => {
        window.__growthActivityScopes.push(window.growthLoop.getScope().profile_id);
        return queueActivity(...args);
      };

      let release;
      window.__delayedGrowthLoadStarted = false;
      window.__releaseDelayedGrowthLoad = () => release?.();
      const loadScope = window.growthLoop.loadScope.bind(window.growthLoop);
      let delayNextFirstLoad = true;
      window.growthLoop.loadScope = async (scope, options) => {
        if (delayNextFirstLoad && scope.profile_id === firstProfileId) {
          delayNextFirstLoad = false;
          window.__delayedGrowthLoadStarted = true;
          await new Promise((resolve) => { release = resolve; });
        }
        return loadScope(scope, options);
      };

      document.querySelector(`[data-profile="${firstProfileId}"]`).click();
    }, { firstProfileId: PROFILE_ID });

    await expect.poll(() => page.evaluate(() => window.__delayedGrowthLoadStarted)).toBe(true);
    await secondChoice.click();
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__releaseDelayedGrowthLoad());

    await expect.poll(() => page.evaluate(({ firstProfileId, secondProfileId }) => ({
      active: document.querySelector(`[data-profile="${secondProfileId}"]`)?.classList.contains("active"),
      inactive: document.querySelector(`[data-profile="${firstProfileId}"]`)?.classList.contains("active"),
      key: localStorage.getItem("shadow_mate_active_profile"),
      learning: window.learningDesk.getEnvelope().scope?.profile_id,
      growth: window.growthLoop.getScope().profile_id,
      activity: window.__growthActivityScopes,
    }), { firstProfileId: PROFILE_ID, secondProfileId: SECOND_PROFILE_ID })).toEqual({
      active: true,
      inactive: false,
      key: SECOND_PROFILE_ID,
      learning: SECOND_PROFILE_ID,
      growth: SECOND_PROFILE_ID,
      activity: expect.not.arrayContaining([PROFILE_ID]),
    });
    await expect.poll(() => api.activityPayloads.map((payload) => payload.p_event?.profile_id)).toContain(SECOND_PROFILE_ID);
    expect(api.activityPayloads.map((payload) => payload.p_event?.profile_id)).not.toContain(PROFILE_ID);
  });

  test("restores the last successful scope when a stale switch is followed by a failed switch", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      initialProfiles: [
        { id: SECOND_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第二个学习者", grade_level: 3 },
        { id: THIRD_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第三个学习者", grade_level: 3 },
      ],
      profileStateResponses: { [THIRD_PROFILE_ID]: "error" },
    });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    const thirdChoice = page.locator(`[data-profile="${THIRD_PROFILE_ID}"]`);
    await expect(thirdChoice).toBeVisible();
    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);
    api.rpcPayloads.length = 0;
    api.activityPayloads.length = 0;

    await page.evaluate(({ secondProfileId }) => {
      let release;
      window.__scopeLoads = [];
      window.__staleGrowthLoadStarted = false;
      window.__staleGenerationObserved = false;
      window.__staleLocalWrites = [];
      window.__releaseStaleGrowthLoad = () => release?.();
      const setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        if (window.__staleGenerationObserved && key.includes(secondProfileId)) {
          window.__staleLocalWrites.push({ key, value });
        }
        return setItem(key, value);
      };
      const loadScope = window.growthLoop.loadScope.bind(window.growthLoop);
      let delayNextSecondLoad = true;
      window.growthLoop.loadScope = async (scope, options) => {
        window.__scopeLoads.push({ profileId: scope.profile_id, phase: "start" });
        if (delayNextSecondLoad && scope.profile_id === secondProfileId) {
          delayNextSecondLoad = false;
          window.__staleGrowthLoadStarted = true;
          await new Promise((resolve) => { release = resolve; });
        }
        const result = await loadScope(scope, options);
        window.__scopeLoads.push({ profileId: scope.profile_id, phase: "end" });
        return result;
      };
      document.querySelector(`[data-profile="${secondProfileId}"]`).click();
    }, { secondProfileId: SECOND_PROFILE_ID });

    await expect.poll(() => page.evaluate(() => window.__staleGrowthLoadStarted)).toBe(true);
    await thirdChoice.click();
    await page.evaluate(() => { window.__staleGenerationObserved = true; });
    await page.evaluate(() => window.__releaseStaleGrowthLoad());

    await expect(firstChoice).toHaveClass(/active/);
    await expect(secondChoice).not.toHaveClass(/active/);
    await expect(thirdChoice).not.toHaveClass(/active/);
    await expect.poll(() => page.evaluate(({ secondProfileId }) => window.__scopeLoads.some(
      (entry) => entry.profileId === secondProfileId && entry.phase === "end",
    ), { secondProfileId: SECOND_PROFILE_ID })).toBe(true);
    await expect.poll(() => page.evaluate(() => ({
      active: localStorage.getItem("shadow_mate_active_profile"),
      learning: window.learningDesk.getEnvelope().scope?.profile_id,
      growth: window.growthLoop.getScope().profile_id,
    }))).toEqual({
      active: PROFILE_ID,
      learning: PROFILE_ID,
      growth: PROFILE_ID,
    });
    expect(api.rpcPayloads.map((payload) => payload.p_profile_id)).not.toContain(SECOND_PROFILE_ID);
    expect(api.activityPayloads.map((payload) => payload.p_event?.profile_id)).not.toContain(SECOND_PROFILE_ID);
    expect(await page.evaluate(() => window.__staleLocalWrites)).toEqual([]);
  });

  test("drains a manual save queued for the new profile after the old save settles", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { rpcDelayMs: 1800 });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    await page.evaluate(() => window.cloudSync.schedule());
    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    await expect.poll(() => api.getRpcSettledCount()).toBe(0);

    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);
    await expect.poll(() => api.getRpcSettledCount()).toBe(0);
    await page.click("[data-sync]");

    await expect.poll(() => api.rpcPayloads.length, { timeout: 6000 }).toBe(2);
    await expect.poll(() => api.getRpcSettledCount(), { timeout: 6000 }).toBe(2);
    await expect(page.locator("#syncToast")).toContainText("云端记录已更新");
    expect(api.rpcPayloads.map((payload) => payload.p_profile_id)).toEqual([SECOND_PROFILE_ID, PROFILE_ID]);
  });

  test("drains an automatic save queued for the new profile after the old save settles", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, { rpcDelayMs: 1800 });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    await page.evaluate(() => window.cloudSync.schedule());
    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    await expect.poll(() => api.getRpcSettledCount()).toBe(0);

    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);
    await expect.poll(() => api.getRpcSettledCount()).toBe(0);
    await page.evaluate(() => window.cloudSync.schedule());

    await expect.poll(() => api.rpcPayloads.length, { timeout: 6000 }).toBe(2);
    expect(api.rpcPayloads.map((payload) => payload.p_profile_id)).toEqual([SECOND_PROFILE_ID, PROFILE_ID]);
  });

  test("binds an automatic debounce save to the learner that scheduled it", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    api.rpcPayloads.length = 0;

    await page.evaluate(() => window.cloudSync.schedule());
    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);

    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    expect(api.rpcPayloads[0]).toHaveProperty("p_profile_id", SECOND_PROFILE_ID);
    expect(api.rpcPayloads[0].p_state).toMatchObject({ scope: { profile_id: SECOND_PROFILE_ID } });
  });

  test("binds a manual debounce save to the learner that scheduled it", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    api.rpcPayloads.length = 0;

    await page.evaluate(() => window.cloudSync.schedule(true));
    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);

    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    expect(api.rpcPayloads[0]).toHaveProperty("p_profile_id", SECOND_PROFILE_ID);
    expect(api.rpcPayloads[0].p_state).toMatchObject({ scope: { profile_id: SECOND_PROFILE_ID } });
    await expect(page.locator("#syncToast")).toContainText("云端记录已更新");
  });

  test("rolls back the complete active tuple when a save becomes stale before the next profile fails", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      rpcDelayMs: 1200,
      initialProfiles: [
        { id: SECOND_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第二个学习者", grade_level: 3 },
        { id: THIRD_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第三个学习者", grade_level: 3 },
      ],
      profileStateResponses: { [THIRD_PROFILE_ID]: "error" },
      profileStateData: { [SECOND_PROFILE_ID]: emptyState },
      profileStateVersions: { [PROFILE_ID]: 3, [SECOND_PROFILE_ID]: 90 },
    });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    const thirdChoice = page.locator(`[data-profile="${THIRD_PROFILE_ID}"]`);
    await expect(firstChoice).toHaveClass(/active/);
    await expect(thirdChoice).toBeVisible();

    await page.evaluate(({ householdId, profileId }) => {
      localStorage.setItem(
        `shadow_mate_learning_v2:${encodeURIComponent(householdId)}:${encodeURIComponent(profileId)}`,
        JSON.stringify({
          schema_version: 2,
          product_id: "shadow-mate",
          scope: { household_id: householdId, profile_id: profileId },
          learning: {
            checkins: { "2026-08-20": { math: true } },
            extra: { queuedFromProfileB: true },
            bookShelf: {},
            peanutLog: [],
            peanutRead: [],
          },
          legacy: { points_readonly: {} },
          extensions: { legacy_unknown: {} },
        }),
      );
    }, { householdId: HOUSEHOLD_ID, profileId: SECOND_PROFILE_ID });

    await secondChoice.click();
    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    expect(api.rpcPayloads[0]).toMatchObject({
      p_profile_id: SECOND_PROFILE_ID,
      p_state: {
        scope: { profile_id: SECOND_PROFILE_ID },
        learning: { checkins: { "2026-08-20": { math: true } } },
      },
    });
    await expect.poll(() => api.getRpcSettledCount()).toBe(0);
    await thirdChoice.click();
    await expect.poll(() => api.getRpcSettledCount()).toBe(1);

    await expect(firstChoice).toHaveClass(/active/);
    await expect(secondChoice).not.toHaveClass(/active/);
    await expect(thirdChoice).not.toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => ({
      active: localStorage.getItem("shadow_mate_active_profile"),
      learning: window.learningDesk.getEnvelope().scope?.profile_id,
      growth: window.growthLoop.getScope().profile_id,
      tuple: window.cloudSync.getProfileCommitState?.(),
    }))).toEqual({
      active: PROFILE_ID,
      learning: PROFILE_ID,
      growth: PROFILE_ID,
      tuple: {
        active_profile_id: PROFILE_ID,
        active_profile_key: PROFILE_ID,
        cloud_version: 3,
      },
    });
    expect(api.rpcPayloads.map((payload) => payload.p_profile_id)).toEqual([SECOND_PROFILE_ID]);
  });

  test("isolates rollback failures and fails closed before stale profile writes", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      initialProfiles: [
        { id: SECOND_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第二个学习者", grade_level: 3 },
        { id: THIRD_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第三个学习者", grade_level: 3 },
      ],
      profileStateResponses: { [THIRD_PROFILE_ID]: "error" },
    });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    const thirdChoice = page.locator(`[data-profile="${THIRD_PROFILE_ID}"]`);
    await expect(firstChoice).toHaveClass(/active/);
    await expect(thirdChoice).toBeVisible();
    api.rpcPayloads.length = 0;
    api.activityPayloads.length = 0;

    await page.evaluate(({ firstProfileId, secondProfileId, thirdProfileId }) => {
      window.__rollbackTrace = [];
      window.__staleGenerationObserved = false;
      window.__failGrowthRollback = false;
      window.__staleLocalWrites = [];
      window.__staleLearningLoadStarted = false;
      let release;
      window.__releaseStaleLearningLoad = () => release?.();
      window.__triggerStaleSwitch = () => {
        window.__staleGenerationObserved = true;
        document.querySelector(`[data-profile="${thirdProfileId}"]`).click();
      };
      const setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        if (window.__staleGenerationObserved && key.includes(secondProfileId)) {
          window.__staleLocalWrites.push({ key, value });
        }
        return setItem(key, value);
      };

      const originalGrowthLoadScope = window.growthLoop.loadScope.bind(window.growthLoop);
      window.growthLoop.loadScope = async (scope, options) => {
        window.__rollbackTrace.push({
          domain: "growth",
          profileId: scope.profile_id,
          stale: window.__staleGenerationObserved,
        });
        if (scope.profile_id === firstProfileId && window.__failGrowthRollback) {
          throw new Error("injected_growth_rollback_failure");
        }
        return originalGrowthLoadScope(scope, options);
      };

      const originalLearningSetScope = window.learningDesk.setScope.bind(window.learningDesk);
      let delaySecondScope = true;
      window.learningDesk.setScope = async (scope, options) => {
        if (delaySecondScope && scope.profile_id === secondProfileId) {
          delaySecondScope = false;
          window.__staleLearningLoadStarted = true;
          await new Promise((resolve) => { release = resolve; });
        }
        window.__rollbackTrace.push({
          domain: "learning",
          profileId: scope.profile_id,
          stale: window.__staleGenerationObserved,
        });
        const result = await originalLearningSetScope(scope, options);
        if (scope.profile_id === secondProfileId) window.__triggerStaleSwitch();
        return result;
      };
    }, {
      firstProfileId: PROFILE_ID,
      secondProfileId: SECOND_PROFILE_ID,
      thirdProfileId: THIRD_PROFILE_ID,
    });

    await secondChoice.click();
    await expect.poll(() => page.evaluate(() => window.__staleLearningLoadStarted)).toBe(true);
    await page.evaluate(() => {
      window.__failGrowthRollback = true;
      window.__releaseStaleLearningLoad();
    });

    await expect.poll(() => page.evaluate((firstProfileId) => window.__rollbackTrace.some(
      (entry) => entry.domain === "learning" && entry.profileId === firstProfileId && entry.stale,
    ), PROFILE_ID)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.cloudSync.isProfileScopeWriteBlocked?.())).toBe(true);

    const traceAfterStale = await page.evaluate(() => window.__rollbackTrace.filter((entry) => entry.stale));
    expect(traceAfterStale).toEqual(expect.arrayContaining([
      { domain: "growth", profileId: PROFILE_ID, stale: true },
      { domain: "learning", profileId: PROFILE_ID, stale: true },
    ]));
    expect(api.rpcPayloads).toEqual([]);
    expect(api.activityPayloads).toEqual([]);
    expect(await page.evaluate(() => window.__staleLocalWrites)).toEqual([]);

    await page.evaluate(() => {
      window.cloudSync.schedule(true);
      window.cloudSync.scheduleGrowthLoop();
    });
    await page.waitForTimeout(800);
    expect(api.rpcPayloads).toEqual([]);
    expect(api.activityPayloads).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("shadow_mate_active_profile"))).toBeNull();

    const blockedUiWrites = await page.evaluate(async () => {
      const writes = [];
      const originalSetItem = localStorage.setItem.bind(localStorage);
      const originalRemoveItem = localStorage.removeItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        writes.push({ method: "setItem", key, value });
        return originalSetItem(key, value);
      };
      localStorage.removeItem = (key) => {
        writes.push({ method: "removeItem", key });
        return originalRemoveItem(key);
      };
      const beforeLearning = window.learningDesk.getState();
      const beforeGrowth = window.growthLoop.getSnapshot();
      const beforeOutbox = await window.growthLoop.pendingOutbox();
      await window.learningDesk.replaceState({
        ...beforeLearning,
        extra: { ...beforeLearning.extra, blockedUiMutation: true },
      }, { persist: true });
      await window.growthLoop.recordPoint({
        item: { id: "blocked-item", name: "不应写入", default_points: 1 },
        occurred_on: "2026-08-20",
        request_id: "blocked-point",
      });
      await window.growthLoop.queueActivity({
        event_type: "growth_activity_recorded",
        event_id: "blocked-activity",
      });
      return {
        writes,
        learningUnchanged: JSON.stringify(window.learningDesk.getState()) === JSON.stringify(beforeLearning),
        growthUnchanged: JSON.stringify(window.growthLoop.getSnapshot()) === JSON.stringify(beforeGrowth),
        outboxUnchanged: JSON.stringify(await window.growthLoop.pendingOutbox()) === JSON.stringify(beforeOutbox),
      };
    });
    expect(blockedUiWrites).toEqual({
      writes: [],
      learningUnchanged: true,
      growthUnchanged: true,
      outboxUnchanged: true,
    });

    // A closed tab clears sessionStorage, but must not clear the fail-closed
    // marker. Only the explicit local-data cleanup flow may remove it.
    await page.addInitScript(() => {
      window.__readwriteLearningTransactions = 0;
      window.__localStorageWrites = [];
      const originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === "readwrite") window.__readwriteLearningTransactions += 1;
        return originalTransaction.apply(this, args);
      };
      const originalSetItem = Storage.prototype.setItem;
      const originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage) window.__localStorageWrites.push({ method: "setItem", key, value });
        return originalSetItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key) {
        if (this === localStorage) window.__localStorageWrites.push({ method: "removeItem", key });
        return originalRemoveItem.call(this, key);
      };
    });
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect.poll(() => page.evaluate(() => ({
      blocked: window.cloudSync.isProfileScopeWriteBlocked?.(),
      marker: localStorage.getItem("shadow_mate_profile_scope_blocked"),
    }))).toEqual({ blocked: true, marker: "1" });
    expect(await page.evaluate(() => window.__readwriteLearningTransactions)).toBe(0);
    expect(await page.evaluate(() => window.__localStorageWrites.filter(({ key }) => (
      key !== "shadow_mate_profile_scope_blocked" && !key.startsWith("lswt-")
    )))).toEqual([]);

    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#accountButton");
    await page.evaluate(() => {
      window.__originalClearAllLocalData = window.growthLoop.clearAllLocalData.bind(window.growthLoop);
      window.growthLoop.clearAllLocalData = async () => {
        throw new Error("injected_clear_failure");
      };
    });
    await page.locator("[data-clear-local]").click();
    await expect(page.locator("#syncToast")).toContainText("本机数据清理未完成");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("shadow_mate_profile_scope_blocked"))).toBe("1");

    await page.evaluate(() => {
      window.growthLoop.clearAllLocalData = window.__originalClearAllLocalData;
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-clear-local]").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("shadow_mate_profile_scope_blocked"))).toBeNull();
  });

  test("aborts the controller operation before a real IndexedDB transaction can commit a stale row", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto("/");
      await page.waitForTimeout(500);

      const result = await page.evaluate(async () => {
        await window.growthLoop.clearAllLocalData();
        const { createIndexedDbLearningDb } = await import("/src/learning-local-db.js");
        const { createGrowthLoopController } = await import("/src/learning-growth-loop-controller.js");
        const controller = createGrowthLoopController({ db: createIndexedDbLearningDb() });
        const originalPut = IDBObjectStore.prototype.put;
        const originalSetInterval = window.setInterval;
        const originalAbort = AbortController.prototype.abort;
        let requestSucceeded = false;
        let abortCount = 0;
        window.setInterval = () => 0;
        AbortController.prototype.abort = function (...args) {
          abortCount += 1;
          return originalAbort.apply(this, args);
        };
        IDBObjectStore.prototype.put = function (...args) {
          const request = originalPut.apply(this, args);
          if (this.name === "snapshots") {
            request.addEventListener("success", () => queueMicrotask(() => {
              requestSucceeded = true;
              controller.invalidateWriteOperations?.();
            }), { once: true });
          }
          return request;
        };

        try {
          await controller.recordPoint({
            item: { id: "stale-item", name: "不应落盘", default_points: 1 },
            occurred_on: "2026-08-20",
            request_id: "stale-real-idb-row",
          });
        } finally {
          IDBObjectStore.prototype.put = originalPut;
          window.setInterval = originalSetInterval;
          AbortController.prototype.abort = originalAbort;
        }

        const persisted = await new Promise((resolve, reject) => {
          const request = indexedDB.open("shadow-mate-learning-v1", 1);
          request.onerror = () => reject(request.error || new Error("open_failed"));
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(["snapshots"], "readonly");
            const read = transaction.objectStore("snapshots").get("pending:pending");
            read.onerror = () => reject(read.error || new Error("read_failed"));
            read.onsuccess = () => {
              resolve(read.result?.snapshot?.ledger?.some((entry) => entry.request_id === "stale-real-idb-row") || false);
              database.close();
            };
          };
        });
        return { requestSucceeded, abortCount, persisted_row: persisted };
      });

      expect(result.requestSucceeded).toBe(true);
      expect(result.abortCount).toBeGreaterThan(0);
      expect(result.persisted_row).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("fails closed when Learning rollback fails after Growth rollback succeeds", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      initialProfiles: [
        { id: SECOND_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第二个学习者", grade_level: 3 },
        { id: THIRD_PROFILE_ID, household_id: HOUSEHOLD_ID, display_name: "第三个学习者", grade_level: 3 },
      ],
      profileStateResponses: { [THIRD_PROFILE_ID]: "error" },
    });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(firstChoice).toHaveClass(/active/);
    await expect(page.locator(`[data-profile="${THIRD_PROFILE_ID}"]`)).toBeVisible();
    api.rpcPayloads.length = 0;
    api.activityPayloads.length = 0;

    await page.evaluate(({ firstProfileId, secondProfileId, thirdProfileId }) => {
      window.__rollbackTrace = [];
      window.__failLearningRollback = false;
      window.__staleGenerationObserved = false;
      window.__staleLocalWrites = [];
      window.__staleLearningLoadStarted = false;
      let release;
      window.__releaseStaleLearningLoad = () => release?.();
      window.__triggerStaleSwitch = () => {
        window.__staleGenerationObserved = true;
        document.querySelector(`[data-profile="${thirdProfileId}"]`).click();
      };
      const setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        if (window.__staleGenerationObserved && key.includes(secondProfileId)) {
          window.__staleLocalWrites.push({ key, value });
        }
        return setItem(key, value);
      };

      const originalGrowthLoadScope = window.growthLoop.loadScope.bind(window.growthLoop);
      window.growthLoop.loadScope = async (scope, options) => {
        window.__rollbackTrace.push({ domain: "growth", profileId: scope.profile_id, stale: window.__staleGenerationObserved });
        return originalGrowthLoadScope(scope, options);
      };

      const originalLearningSetScope = window.learningDesk.setScope.bind(window.learningDesk);
      let delaySecondScope = true;
      window.learningDesk.setScope = async (scope, options) => {
        if (delaySecondScope && scope.profile_id === secondProfileId) {
          delaySecondScope = false;
          window.__staleLearningLoadStarted = true;
          await new Promise((resolve) => { release = resolve; });
        }
        window.__rollbackTrace.push({ domain: "learning", profileId: scope.profile_id, stale: window.__staleGenerationObserved });
        if (scope.profile_id === firstProfileId && window.__failLearningRollback) {
          throw new Error("injected_learning_rollback_failure");
        }
        const result = await originalLearningSetScope(scope, options);
        if (scope.profile_id === secondProfileId) window.__triggerStaleSwitch();
        return result;
      };
    }, {
      firstProfileId: PROFILE_ID,
      secondProfileId: SECOND_PROFILE_ID,
      thirdProfileId: THIRD_PROFILE_ID,
    });

    await secondChoice.click();
    await expect.poll(() => page.evaluate(() => window.__staleLearningLoadStarted)).toBe(true);
    await page.evaluate(() => {
      window.__failLearningRollback = true;
      window.__releaseStaleLearningLoad();
    });

    await expect.poll(() => page.evaluate((firstProfileId) => window.__rollbackTrace.some(
      (entry) => entry.domain === "growth" && entry.profileId === firstProfileId && entry.stale,
    ), PROFILE_ID)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.cloudSync.isProfileScopeWriteBlocked?.())).toBe(true);
    expect(api.rpcPayloads).toEqual([]);
    expect(api.activityPayloads).toEqual([]);
    expect(await page.evaluate(() => window.__staleLocalWrites)).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("shadow_mate_active_profile"))).toBeNull();
  });

  test("cleans every Learning Desk key and retains the marker when one deletion fails", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.evaluate(() => {
      const envelope = JSON.stringify({ schema_version: 2, learning: {} });
      localStorage.setItem("shadow_mate_workbench_v1", "legacy");
      localStorage.setItem("shadow_mate_learning_v2:household-a:profile-a", envelope);
      localStorage.setItem("shadow_mate_learning_v2:household-b:profile-b", envelope);
      localStorage.setItem("shadow_mate_learning_v2:legacy_backup:test", "legacy-backup");
    });

    await page.click("#accountButton");
    await expect(page.locator("[data-clear-local]")).toBeVisible();
    await page.evaluate(() => {
      window.__originalLearningRemoveItem = Storage.prototype.removeItem;
      const blockedKey = "shadow_mate_learning_v2:household-b:profile-b";
      Storage.prototype.removeItem = function (key) {
        if (key === blockedKey) throw new Error("injected_learning_key_delete_failure");
        return window.__originalLearningRemoveItem.call(this, key);
      };
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-clear-local]").click();
    await expect(page.locator("#syncToast")).toContainText("本机数据清理未完成");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("shadow_mate_profile_scope_blocked"))).toBe("1");

    const failedCleanupKeys = await page.evaluate(() => [
      "shadow_mate_workbench_v1",
      "shadow_mate_learning_v2:household-a:profile-a",
      "shadow_mate_learning_v2:household-b:profile-b",
      "shadow_mate_learning_v2:legacy_backup:test",
    ].filter((key) => localStorage.getItem(key) !== null));
    expect(failedCleanupKeys).toContain("shadow_mate_learning_v2:household-b:profile-b");

    await page.evaluate(() => {
      Storage.prototype.removeItem = window.__originalLearningRemoveItem;
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-clear-local]").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("shadow_mate_profile_scope_blocked"))).toBeNull();
    await expect.poll(() => page.evaluate(() => [
      "shadow_mate_workbench_v1",
      "shadow_mate_learning_v2:household-a:profile-a",
      "shadow_mate_learning_v2:household-b:profile-b",
      "shadow_mate_learning_v2:legacy_backup:test",
    ].filter((key) => localStorage.getItem(key) !== null))).toEqual([]);
  });

  test("does not let a delayed background refresh overwrite a newer learner", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page);

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await page.click("#accountButton");
    await page.locator('#addLearnerForm input[name="learner"]').fill("第二个学习者");
    await page.click('#addLearnerForm button[type="submit"]');

    const firstChoice = page.locator(`[data-profile="${PROFILE_ID}"]`);
    const secondChoice = page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`);
    await expect(secondChoice).toHaveClass(/active/);
    await firstChoice.click();
    await expect(firstChoice).toHaveClass(/active/);
    api.activityPayloads.length = 0;

    await page.evaluate(({ firstProfileId }) => {
      window.__growthActivityScopes = [];
      const queueActivity = window.growthLoop.queueActivity.bind(window.growthLoop);
      window.growthLoop.queueActivity = async (...args) => {
        window.__growthActivityScopes.push(window.growthLoop.getScope().profile_id);
        return queueActivity(...args);
      };

      let release;
      window.__delayedGrowthLoadStarted = false;
      window.__releaseDelayedGrowthLoad = () => release?.();
      const loadScope = window.growthLoop.loadScope.bind(window.growthLoop);
      let delayNextFirstLoad = true;
      window.growthLoop.loadScope = async (scope, options) => {
        if (delayNextFirstLoad && scope.profile_id === firstProfileId) {
          delayNextFirstLoad = false;
          window.__delayedGrowthLoadStarted = true;
          await new Promise((resolve) => { release = resolve; });
        }
        return loadScope(scope, options);
      };
      window.dispatchEvent(new Event("online"));
    }, { firstProfileId: PROFILE_ID });

    await expect.poll(() => page.evaluate(() => window.__delayedGrowthLoadStarted)).toBe(true);
    await secondChoice.click();
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__releaseDelayedGrowthLoad());

    await expect.poll(() => page.evaluate(({ firstProfileId, secondProfileId }) => ({
      active: document.querySelector(`[data-profile="${secondProfileId}"]`)?.classList.contains("active"),
      inactive: document.querySelector(`[data-profile="${firstProfileId}"]`)?.classList.contains("active"),
      key: localStorage.getItem("shadow_mate_active_profile"),
      learning: window.learningDesk.getEnvelope().scope?.profile_id,
      growth: window.growthLoop.getScope().profile_id,
      activity: window.__growthActivityScopes,
    }), { firstProfileId: PROFILE_ID, secondProfileId: SECOND_PROFILE_ID })).toEqual({
      active: true,
      inactive: false,
      key: SECOND_PROFILE_ID,
      learning: SECOND_PROFILE_ID,
      growth: SECOND_PROFILE_ID,
      activity: expect.not.arrayContaining([PROFILE_ID]),
    });
    await expect.poll(() => api.activityPayloads.map((payload) => payload.p_event?.profile_id)).toContain(SECOND_PROFILE_ID);
    expect(api.activityPayloads.map((payload) => payload.p_event?.profile_id)).not.toContain(PROFILE_ID);
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

test("does not open or write Learning Desk storage in a fresh BrowserContext while the marker exists", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("shadow_mate_profile_scope_blocked", "1");
    window.__blockedStorageTrace = {
      opens: 0,
      versionchanges: 0,
      readwrites: 0,
      localWrites: [],
    };
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      window.__blockedStorageTrace.opens += 1;
      const request = originalOpen(...args);
      request.addEventListener("upgradeneeded", () => {
        window.__blockedStorageTrace.versionchanges += 1;
      });
      return request;
    };
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === "readwrite") window.__blockedStorageTrace.readwrites += 1;
      return originalTransaction.apply(this, args);
    };
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key !== "shadow_mate_profile_scope_blocked" && !key.startsWith("lswt-")) {
        window.__blockedStorageTrace.localWrites.push({ method: "setItem", key, value });
      }
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (this === localStorage && key !== "shadow_mate_profile_scope_blocked" && !key.startsWith("lswt-")) {
        window.__blockedStorageTrace.localWrites.push({ method: "removeItem", key });
      }
      return originalRemoveItem.call(this, key);
    };
  });
  await page.goto("/");
  await page.waitForTimeout(300);

  await expect.poll(() => page.evaluate(() => window.__blockedStorageTrace)).toEqual({
    opens: 0,
    versionchanges: 0,
    readwrites: 0,
    localWrites: [],
  });
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).filter(
    ({ name }) => name === "shadow-mate-learning-v1",
  ))).toEqual([]);
  await context.close();
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
