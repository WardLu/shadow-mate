import { test, expect } from "@playwright/test";
import { resolveDailyWorksheet } from "../../src/hanzi-worksheet-rotation.js";
import { getActiveHanziWritingPack } from "../../src/content/hanzi-writing/manifest.js";

const PROJECT_REF = "dutepjyocxcvecmsrtfp";
const HOUSEHOLD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_PROFILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCOPED_KEY = "shadow_mate_workbench_scoped_v1";
const AUTH_SEED_MARKER = "shadow_mate_e2e_auth_seeded_v1";
const SCOPED_SEED_MARKER = "shadow_mate_e2e_scoped_seeded_v1";

const emptyState = {
  checkins: {},
  extra: {},
  points: {},
  bookShelf: {},
  peanutLog: [],
  peanutRead: {},
};

const HANZI_PACK = getActiveHanziWritingPack();

function makeRotationState(learnerScope) {
  return resolveDailyWorksheet({
    rotationState: {},
    pack: HANZI_PACK,
    learnerScope,
    now: new Date("2026-09-01T00:30:00.000Z"),
    timeZone: "Asia/Singapore",
  }).rotationState;
}

function stateWithMarker(marker, learnerScope) {
  return {
    ...structuredClone(emptyState),
    checkins: { "2026-09-01": { [marker]: true } },
    extra: {
      marker,
      hanziWorksheetRotationV1: makeRotationState(learnerScope),
    },
  };
}

function profileFixture(id, displayName) {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    display_name: displayName,
    grade_level: 3,
  };
}

async function seedAuthenticatedSession(page) {
  const configuredUrl = process.env.VITE_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
  const projectRef = new URL(configuredUrl).hostname.split(".")[0];
  await page.addInitScript(({ authSeedMarker, projectRef, userId }) => {
    if (sessionStorage.getItem(authSeedMarker) === "1") return;
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
    sessionStorage.setItem(authSeedMarker, "1");
  }, { authSeedMarker: AUTH_SEED_MARKER, projectRef, userId: USER_ID });
}

async function seedScopedStates(page, scopes) {
  await page.addInitScript(({ seedMarker, scopedKey, scopes: seededScopes }) => {
    if (sessionStorage.getItem(seedMarker) === "1") return;
    localStorage.setItem(scopedKey, JSON.stringify({ schemaVersion: 1, scopes: seededScopes }));
    sessionStorage.setItem(seedMarker, "1");
  }, { seedMarker: SCOPED_SEED_MARKER, scopedKey: SCOPED_KEY, scopes });
}

async function mockCloudApi(page, {
  remoteState = emptyState,
  remoteStates = {},
  profiles = null,
  stateDelays = {},
  stateErrors = {},
  workspaceDelayMs = 0,
  rpcDelayMs = 0,
  rpcResponses = ["success"],
  hasPassword = true,
  createDelayMs = 0,
  householdCreateDelayMs = 0,
  noMembership = false,
} = {}) {
  let workspaceProfiles = structuredClone(profiles || [{
    id: PROFILE_ID,
    household_id: HOUSEHOLD_ID,
    display_name: "E2E Learner",
    grade_level: 3,
  }]);
  const stateByProfile = new Map(workspaceProfiles.map((profile) => [
    profile.id,
    structuredClone(Object.hasOwn(remoteStates, profile.id) ? remoteStates[profile.id] : remoteState),
  ]));
  const versionByProfile = new Map(workspaceProfiles.map((profile) => [profile.id, 3]));
  const existingProfileIds = new Set(workspaceProfiles.map((profile) => profile.id));
  let rpcIndex = 0;
  const rpcPayloads = [];
  const stateRequests = [];
  const deletedProfiles = [];
  const deletedHouseholds = [];
  const createdProfiles = [];
  const createdHouseholds = [];
  const createdConsents = [];
  let membershipReady = !noMembership;

  const filterValue = (url, name) => {
    const value = url.searchParams.get(name);
    return value?.startsWith("eq.") ? value.slice(3) : value;
  };

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
      stateByProfile.set(payload.p_profile_id, structuredClone(payload.p_state));
      const version = (versionByProfile.get(payload.p_profile_id) || 3) + 1;
      versionByProfile.set(payload.p_profile_id, version);
      if (rpcDelayMs) await new Promise((resolve) => setTimeout(resolve, rpcDelayMs));
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
        membershipReady = true;
        await route.fulfill({ status: 201, body: "" });
        return;
      }
      if (workspaceDelayMs) await new Promise((resolve) => setTimeout(resolve, workspaceDelayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(membershipReady ? [{ household_id: HOUSEHOLD_ID, role: "owner" }] : []),
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
        body: JSON.stringify(membershipReady ? [{ household_id: HOUSEHOLD_ID }] : []),
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
            id: SECOND_PROFILE_ID,
            household_id: HOUSEHOLD_ID,
            display_name: payload.display_name,
            grade_level: payload.grade_level,
          }),
        });
        if (!existingProfileIds.has(SECOND_PROFILE_ID)) {
          workspaceProfiles.push({
            id: SECOND_PROFILE_ID,
            household_id: HOUSEHOLD_ID,
            display_name: payload.display_name,
            grade_level: payload.grade_level,
          });
          existingProfileIds.add(SECOND_PROFILE_ID);
          stateByProfile.set(SECOND_PROFILE_ID, null);
          versionByProfile.set(SECOND_PROFILE_ID, 3);
        }
        return;
      }
      if (request.method() === "DELETE") {
        const profileId = filterValue(url, "id");
        deletedProfiles.push(profileId);
        existingProfileIds.delete(profileId);
        workspaceProfiles = workspaceProfiles.filter((profile) => profile.id !== profileId);
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(workspaceProfiles.filter((profile) => existingProfileIds.has(profile.id))),
      });
      return;
    }

    if (path.endsWith("/learning_profile_states")) {
      const select = url.searchParams.get("select") || "";
      const profileId = filterValue(url, "profile_id");
      if (profileId && stateDelays[profileId]) {
        stateRequests.push(profileId);
        await new Promise((resolve) => setTimeout(resolve, stateDelays[profileId]));
      } else if (profileId) {
        stateRequests.push(profileId);
      }
      if (profileId && select.includes("state") && stateErrors[profileId]) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "PGRST503", message: stateErrors[profileId] }),
        });
        return;
      }
      const body = select.includes("state")
        ? (stateByProfile.get(profileId || PROFILE_ID) === null
          ? []
          : [{
            profile_id: profileId || PROFILE_ID,
            state: stateByProfile.get(profileId || PROFILE_ID) || emptyState,
            version: versionByProfile.get(profileId || PROFILE_ID) || 3,
            updated_at: "2026-08-01T08:00:00.000Z",
          }])
        : workspaceProfiles
          .filter((profile) => existingProfileIds.has(profile.id))
          .map((profile) => ({ profile_id: profile.id, updated_at: "2026-08-01T08:00:00.000Z" }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      return;
    }

    if (path.endsWith("/learning_households")) {
      if (request.method() === "POST") {
        createdHouseholds.push(JSON.parse(request.postData() || "{}"));
        membershipReady = true;
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
    stateRequests,
    deletedProfiles,
    deletedHouseholds,
    createdProfiles,
    createdHouseholds,
    createdConsents,
    getState: (profileId = PROFILE_ID) => stateByProfile.get(profileId),
  };
}

test.describe("Authenticated cloud workspace", () => {
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
    const profileAScope = "profile:" + PROFILE_ID;
    await seedAuthenticatedSession(page);
    const api = await mockCloudApi(page, {
      remoteState: { ...emptyState, extra: { conflictMarker: "remote" } },
      rpcResponses: ["conflict", "success"],
    });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileAScope);
    await page.click("#accountButton");
    await page.click("[data-sync]");
    await expect.poll(() => api.rpcPayloads.length).toBe(2);
    await expect.poll(async () => page.evaluate(({ scopedKey, profileId }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return envelope.scopes?.[`profile:${profileId}`]?.extra?.conflictMarker;
    }, { scopedKey: SCOPED_KEY, profileId: PROFILE_ID })).toBe("remote");
    expect(api.rpcPayloads[1]).toHaveProperty("p_profile_id", PROFILE_ID);
  });

  test("keeps learner A and learner B local scopes isolated across switches", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("profile-b", profileBScope),
    });
    await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: null },
    });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileAScope);
    await page.click("#accountButton");
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileBScope);
    await expect.poll(() => page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("profile-b");
    await page.locator(`[data-profile="${PROFILE_ID}"]`).click();

    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileAScope);
    await expect.poll(() => page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("profile-a");
    await expect.poll(() => page.evaluate(({ scopedKey, profileAScope, profileBScope }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return [envelope.scopes?.[profileAScope]?.extra?.marker, envelope.scopes?.[profileBScope]?.extra?.marker];
    }, { scopedKey: SCOPED_KEY, profileAScope, profileBScope })).toEqual(["profile-a", "profile-b"]);
  });

  test("hydrates an existing remote profile without merging the current learner", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    const currentState = stateWithMarker("current-a", profileAScope);
    const cachedBState = stateWithMarker("cached-b", profileBScope);
    const remoteBState = stateWithMarker("remote-b", profileBScope);
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: currentState,
      [profileBScope]: cachedBState,
    });
    await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: remoteBState },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect.poll(() => page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("remote-b");
    await expect.poll(() => page.evaluate(() => window.learningDesk.getState().extra?.hanziWorksheetRotationV1?.learnerScope)).toBe(profileBScope);
    await expect.poll(() => page.evaluate(({ scopedKey, profileAScope }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return envelope.scopes?.[profileAScope]?.extra?.marker;
    }, { scopedKey: SCOPED_KEY, profileAScope })).toBe("current-a");
  });

  test("preserves target-scope offline edits during remote hydration", async ({ page }) => {
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    const cachedBState = stateWithMarker("cached-b", profileBScope);
    const remoteBState = stateWithMarker("remote-b", profileBScope);
    remoteBState.extra.remoteDuringHydrate = true;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, { [profileBScope]: cachedBState });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: remoteBState },
      stateDelays: { [SECOND_PROFILE_ID]: 600 },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();
    await expect.poll(() => api.stateRequests.filter((profileId) => profileId === SECOND_PROFILE_ID).length).toBeGreaterThan(0);
    await page.evaluate(() => {
      const state = window.learningDesk.getState();
      state.extra.localDuringHydrate = true;
      window.learningDesk.replaceState(state, { persist: true });
    });

    await expect.poll(() => page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      local: window.learningDesk.getState().extra?.localDuringHydrate,
      remote: window.learningDesk.getState().extra?.remoteDuringHydrate,
    }))).toEqual({ scope: profileBScope, local: true, remote: true });
    await expect.poll(() => api.rpcPayloads.find((payload) => payload.p_profile_id === SECOND_PROFILE_ID)).toMatchObject({
      p_state: {
        extra: { localDuringHydrate: true, remoteDuringHydrate: true },
      },
    });
    expect(await page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("cached-b");
    expect(await page.evaluate(({ scopedKey, profileBScope }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return envelope.scopes?.[profileBScope]?.extra;
    }, { scopedKey: SCOPED_KEY, profileBScope })).toMatchObject({
      localDuringHydrate: true,
      remoteDuringHydrate: true,
    });
  });

  test("preserves pending target check-in and rotation completion before remote hydration", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    const remoteBState = stateWithMarker("remote-b", profileBScope);
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("cached-b", profileBScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: remoteBState },
      stateDelays: { [SECOND_PROFILE_ID]: 600 },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.evaluate(({ scope }) => {
      window.learningDesk.activateScope(scope, {
        state: window.learningDesk.getState(scope),
        persist: true,
        render: false,
      });
      const state = window.learningDesk.getState();
      state.checkins["2026-09-01"] ??= {};
      state.checkins["2026-09-01"]["chinese-writing"] = true;
      const rotation = state.extra.hanziWorksheetRotationV1;
      const assignment = rotation.assignments["2026-09-01"];
      assignment.completions[assignment.canonicalAssignmentId] = {
        completedAt: "2026-09-01T02:00:00.000Z",
      };
      window.learningDesk.replaceState(state, { persist: true, render: false });
    }, { scope: profileBScope });
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect.poll(() => api.stateRequests.filter((profileId) => profileId === SECOND_PROFILE_ID).length).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      checked: window.learningDesk.getState().checkins["2026-09-01"]?.["chinese-writing"],
      completed: Object.keys(window.learningDesk.getState().extra.hanziWorksheetRotationV1.assignments["2026-09-01"].completions).length,
      remoteMarker: window.learningDesk.getState().extra.remoteOnly,
    }))).toEqual({
      scope: profileBScope,
      checked: true,
      completed: 1,
      remoteMarker: undefined,
    });
    await expect.poll(() => api.rpcPayloads.find((payload) => payload.p_profile_id === SECOND_PROFILE_ID)).toMatchObject({
      p_state: {
        checkins: { "2026-09-01": { "chinese-writing": true } },
      },
    });
    expect(await page.evaluate(() => window.learningDesk.getState().extra.marker)).toBe("cached-b");
  });

  test("retains pending target edits through a failed hydration and reload", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("cached-b", profileBScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: stateWithMarker("remote-b", profileBScope) },
      stateErrors: { [SECOND_PROFILE_ID]: "network timeout" },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await expect(page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`)).toBeVisible();
    await page.evaluate(({ scopedKey, scope }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey));
      const state = envelope.scopes[scope];
      state.extra.offlineBeforeReload = true;
      envelope.scopes[scope] = state;
      localStorage.setItem(scopedKey, JSON.stringify(envelope));
      localStorage.setItem(`${scopedKey}_sync_v1`, JSON.stringify({
        schemaVersion: 1,
        scopes: { [scope]: { pending: true, lastConfirmed: null } },
      }));
    }, { scopedKey: SCOPED_KEY, scope: profileBScope });
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect.poll(() => page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      offline: window.learningDesk.getState().extra.offlineBeforeReload,
      pending: window.learningDesk.getPersistenceStatus().pending,
    }))).toEqual({ scope: profileBScope, offline: true, pending: true });
    await page.reload();
    await expect.poll(() => page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      offline: window.learningDesk.getState().extra.offlineBeforeReload,
      pending: window.learningDesk.getPersistenceStatus().pending,
    }))).toEqual({ scope: profileBScope, offline: true, pending: true });
    expect(api.stateRequests.filter((profileId) => profileId === SECOND_PROFILE_ID).length).toBeGreaterThan(0);
  });

  test("migrates only anonymous local state into an empty newly selected profile", async ({ page }) => {
    const anonymousScope = "anonymous";
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [anonymousScope]: stateWithMarker("anonymous", anonymousScope),
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [],
      noMembership: true,
    });

    await page.goto("/");
    await expect(page.locator("#householdSetupForm")).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('[data-mod="chinese"]')?.click();
      document.querySelector('#main [data-cmod="chinese-writing"]')?.click();
    });
    await page.locator('#householdSetupForm input[name="household"]').fill("迁移测试家庭");
    await page.locator('#householdSetupForm input[name="learner"]').fill("学习者 B");
    await page.locator('#householdSetupForm input[name="guardianConsent"]').check();
    await page.locator('#householdSetupForm button[type="submit"]').click();

    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileBScope);
    await expect.poll(() => api.rpcPayloads.find((payload) => payload.p_profile_id === SECOND_PROFILE_ID)).not.toBeUndefined();
    const migratedPayload = api.rpcPayloads.find((payload) => payload.p_profile_id === SECOND_PROFILE_ID);
    expect(migratedPayload.p_state.extra.marker).toBe("anonymous");
    expect(migratedPayload.p_state.extra.hanziWorksheetRotationV1.learnerScope).toBe(profileBScope);
    expect(migratedPayload.p_state.checkins).toHaveProperty("2026-09-01.anonymous");
    expect(migratedPayload.p_state.checkins).not.toHaveProperty("2026-09-01.profile-a");
    expect(Object.values(migratedPayload.p_state.checkins).some((day) => day["chinese-writing"])).toBe(true);
    expect(Object.values(migratedPayload.p_state.extra.hanziWorksheetRotationV1.assignments)
      .some((assignment) => Object.keys(assignment.completions).length > 0)).toBe(true);
  });

  test("clearing local data removes anonymous and every learner scope", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      anonymous: stateWithMarker("anonymous", "anonymous"),
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("profile-b", profileBScope),
    });
    await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: null },
    });
    await page.addInitScript(() => { window.confirm = () => true; });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator("[data-clear-local]").click();

    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
    await expect(page.evaluate(({ scopedKey }) => localStorage.getItem(scopedKey), { scopedKey: SCOPED_KEY })).resolves.toBeNull();
    await expect(page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      state: window.learningDesk.getState(),
    }))).resolves.toEqual({ scope: "anonymous", state: emptyState });
  });

  test("does not report success or reset context when local clear fails", async ({ page }) => {
    const profileScope = `profile:${PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, { [profileScope]: stateWithMarker("recoverable", profileScope) });
    await mockCloudApi(page, { remoteStates: { [PROFILE_ID]: null } });
    await page.addInitScript(({ scopedKey }) => {
      const removeItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (key === scopedKey) throw new Error("scoped storage remove failed");
        return removeItem.call(this, key);
      };
      window.confirm = () => true;
    }, { scopedKey: SCOPED_KEY });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator("[data-clear-local]").click();

    await expect(page.locator("#syncToast")).toHaveText("本机数据清除失败，本机状态未重置，请稍后重试。");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect(page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      marker: window.learningDesk.getState().extra?.marker,
    }))).resolves.toEqual({ scope: profileScope, marker: "recoverable" });
  });

  test("invalidates an in-flight profile save when local data is cleared", async ({ page }) => {
    const profileScope = `profile:${PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, { [profileScope]: stateWithMarker("clear-in-flight", profileScope) });
    const api = await mockCloudApi(page, {
      remoteStates: { [PROFILE_ID]: stateWithMarker("remote", profileScope) },
      rpcDelayMs: 800,
    });
    await page.addInitScript(() => { window.confirm = () => true; });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator("[data-sync]").click();
    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    await page.locator("[data-clear-local]").click();

    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
    await expect(page.evaluate(() => window.learningDesk.getPersistenceScope())).resolves.toBe("anonymous");
    await page.waitForTimeout(1000);
    expect(api.rpcPayloads).toHaveLength(1);
    expect(api.rpcPayloads[0].p_profile_id).toBe(PROFILE_ID);
  });

  test("deleting one learner removes only that learner's local scope", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("profile-b", profileBScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: null },
    });
    await page.addInitScript(() => { window.confirm = () => true; });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator(`[data-delete-profile="${PROFILE_ID}"]`).click();

    await expect.poll(() => api.deletedProfiles.length).toBe(1);
    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileBScope);
    await expect.poll(() => page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("profile-b");
    await expect(page.evaluate(({ scopedKey, profileAScope, profileBScope }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return {
        deleted: envelope.scopes?.[profileAScope],
        retained: envelope.scopes?.[profileBScope]?.extra?.marker,
      };
    }, { scopedKey: SCOPED_KEY, profileAScope, profileBScope })).resolves.toEqual({
      deleted: undefined,
      retained: "profile-b",
    });
  });

  test("does not report learner deletion success when local scope removal fails", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("profile-b", profileBScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: null },
    });
    await page.addInitScript(() => { window.confirm = () => true; });

    await page.goto("/");
    await page.evaluate(({ scopedKey }) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === scopedKey) throw new Error("scoped storage write failed");
        return setItem.call(this, key, value);
      };
    }, { scopedKey: SCOPED_KEY });
    await page.click("#accountButton");
    await page.locator(`[data-delete-profile="${PROFILE_ID}"]`).click();

    await expect.poll(() => api.deletedProfiles.length).toBe(1);
    await expect(page.locator("#syncToast")).toHaveText("云端学习者已删除，但本机缓存清除失败，请稍后重试。");
    await expect(page.evaluate(({ scopedKey, profileAScope }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return envelope.scopes?.[profileAScope]?.extra?.marker;
    }, { scopedKey: SCOPED_KEY, profileAScope })).resolves.toBe("profile-a");
    expect(await page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileAScope);
    expect(await page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("profile-a");
    expect(api.deletedProfiles).toEqual([PROFILE_ID]);
  });

  test("ignores a delayed old-profile response after switching to a newer learner", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await page.addInitScript(({ profileId }) => {
      localStorage.setItem("shadow_mate_active_profile", profileId);
    }, { profileId: SECOND_PROFILE_ID });
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("cached-a", profileAScope),
      [profileBScope]: stateWithMarker("cached-b", profileBScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: {
        [PROFILE_ID]: stateWithMarker("remote-a", profileAScope),
        [SECOND_PROFILE_ID]: stateWithMarker("remote-b", profileBScope),
      },
      stateDelays: { [PROFILE_ID]: 1000 },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator(`[data-profile="${PROFILE_ID}"]`).click();
    await expect.poll(() => api.stateRequests.filter((profileId) => profileId === PROFILE_ID).length).toBeGreaterThan(0);
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileBScope);
    await expect.poll(() => page.evaluate(() => window.learningDesk.getState().extra?.marker)).toBe("remote-b");
    await page.waitForTimeout(1200);
    await expect(page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      marker: window.learningDesk.getState().extra?.marker,
    }))).resolves.toEqual({ scope: profileBScope, marker: "remote-b" });
  });

  test("does not let a delayed profile response write after logout", async ({ page }) => {
    const profileScope = `profile:${PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      anonymous: stateWithMarker("anonymous", "anonymous"),
      [profileScope]: stateWithMarker("cached-profile", profileScope),
    });
    const api = await mockCloudApi(page, {
      remoteStates: { [PROFILE_ID]: stateWithMarker("remote-profile", profileScope) },
      stateDelays: { [PROFILE_ID]: 800 },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await expect(page.locator(`[data-profile="${PROFILE_ID}"]`)).toBeVisible();
    await page.locator(`[data-profile="${PROFILE_ID}"]`).click();
    await expect.poll(() => api.stateRequests.filter((profileId) => profileId === PROFILE_ID).length).toBeGreaterThan(1);
    await page.locator("[data-signout]").click();

    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      marker: window.learningDesk.getState().extra?.marker,
    }))).resolves.toEqual({ scope: "anonymous", marker: "anonymous" });
    expect(api.rpcPayloads).toHaveLength(0);
  });

  test("fails closed before hydrating a profile with a mismatched local rotation scope", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      [profileAScope]: stateWithMarker("profile-a", profileAScope),
      [profileBScope]: stateWithMarker("wrong-scope", profileAScope),
    });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: null, [SECOND_PROFILE_ID]: stateWithMarker("remote-b", profileBScope) },
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect(page.locator("#syncToast")).toHaveText("本机记录与当前学习者不匹配，暂未加载。");
    await expect(page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      marker: window.learningDesk.getState().extra?.marker,
    }))).resolves.toEqual({ scope: profileAScope, marker: "profile-a" });
    expect(api.stateRequests.filter((profileId) => profileId === SECOND_PROFILE_ID)).toHaveLength(0);
  });

  test("binds cloud saves to the starting profile, scope, and state snapshot", async ({ page }) => {
    const profileAScope = `profile:${PROFILE_ID}`;
    const profileBScope = `profile:${SECOND_PROFILE_ID}`;
    const stateBeforeSave = stateWithMarker("before-save", profileAScope);
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, { [profileAScope]: stateBeforeSave });
    const api = await mockCloudApi(page, {
      profiles: [profileFixture(PROFILE_ID, "学习者 A"), profileFixture(SECOND_PROFILE_ID, "学习者 B")],
      remoteStates: { [PROFILE_ID]: stateBeforeSave, [SECOND_PROFILE_ID]: null },
      rpcDelayMs: 800,
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator("[data-sync]").click();
    await expect.poll(() => api.rpcPayloads.length).toBe(1);
    await page.evaluate(() => {
      const state = window.learningDesk.getState();
      state.extra.marker = "after-save-start";
      window.learningDesk.replaceState(state, { persist: true });
    });
    await page.locator(`[data-profile="${SECOND_PROFILE_ID}"]`).click();

    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileBScope);
    expect(api.rpcPayloads[0]).toMatchObject({
      p_profile_id: PROFILE_ID,
      p_state: { extra: { marker: "before-save" } },
    });
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
    await expect(page.evaluate(({ scopedKey, profileId }) => {
      const envelope = JSON.parse(localStorage.getItem(scopedKey) || "{}");
      return envelope.scopes?.[`profile:${profileId}`];
    }, { scopedKey: SCOPED_KEY, profileId: PROFILE_ID })).resolves.toBeUndefined();
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
    const profileScope = `profile:${PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      anonymous: stateWithMarker("anonymous", "anonymous"),
      [profileScope]: stateWithMarker("cached-profile", profileScope),
    });
    await mockCloudApi(page, {
      remoteState: stateWithMarker("remote-profile", profileScope),
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.click("[data-signout]");

    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
    await expect(page.evaluate(() => ({
      scope: window.learningDesk.getPersistenceScope(),
      marker: window.learningDesk.getState().extra?.marker,
    }))).resolves.toEqual({ scope: "anonymous", marker: "anonymous" });
  });

  test("fails closed when logout cannot save the profile scope", async ({ page }) => {
    const profileScope = `profile:${PROFILE_ID}`;
    await seedAuthenticatedSession(page);
    await seedScopedStates(page, {
      anonymous: stateWithMarker("anonymous", "anonymous"),
      [profileScope]: stateWithMarker("cached-profile", profileScope),
    });
    const api = await mockCloudApi(page, {
      remoteState: stateWithMarker("remote-profile", profileScope),
    });

    await page.goto("/");
    await page.click("#accountButton");
    await page.locator(`[data-profile="${PROFILE_ID}"]`).click();
    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe(profileScope);
    await page.evaluate((scopedKey) => {
      const originalSetItem = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, "setItem", {
        configurable: true,
        value(key, value) {
          if (key === scopedKey) {
            throw new Error("simulated logout storage failure");
          }
          return originalSetItem.call(this, key, value);
        },
      });
    }, SCOPED_KEY);
    await page.click("[data-signout]");

    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.learningDesk.getPersistenceScope())).toBe("anonymous");
    expect(api.rpcPayloads).toHaveLength(0);
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
