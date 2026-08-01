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

async function mockCloudApi(page, { remoteState = emptyState, rpcResponses = ["success"] } = {}) {
  let state = structuredClone(remoteState);
  let version = 3;
  let rpcIndex = 0;
  const rpcPayloads = [];
  const deletedProfiles = [];
  const deletedHouseholds = [];
  let profileExists = true;

  await page.route("**/auth/v1/logout", async (route) => {
    await route.fulfill({ status: 204, body: "" });
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

    if (path.endsWith("/rpc/learning_delete_household")) {
      deletedHouseholds.push(JSON.parse(request.postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    if (path.endsWith("/learning_household_members")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ household_id: HOUSEHOLD_ID, role: "owner" }]),
      });
      return;
    }

    if (path.endsWith("/learning_profiles")) {
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
    getState: () => state,
  };
}

test.describe("Authenticated cloud workspace", () => {
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
  });
});
