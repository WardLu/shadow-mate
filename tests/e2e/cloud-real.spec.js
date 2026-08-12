import { test, expect } from "@playwright/test";

test.describe("Real local Supabase cloud lifecycle", () => {
  test("creates, exports, and deletes a real family workspace", async ({ page, request }) => {
    test.skip(process.env.E2E_REAL_SUPABASE !== "1", "requires E2E_REAL_SUPABASE=1");

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    expect(supabaseUrl).toBeTruthy();
    expect(publishableKey).toBeTruthy();

    const email = `e2e-${Date.now()}@example.test`;
    const password = "E2e-password-2026!";
    const authHeaders = {
      apikey: publishableKey,
      "content-type": "application/json",
    };
    const signupResponse = await request.post(`${supabaseUrl}/auth/v1/signup`, {
      headers: authHeaders,
      data: { email, password },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signup = await signupResponse.json();
    let session = signup;
    if (!session.access_token) {
      const tokenResponse = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers: authHeaders,
        data: { email, password },
      });
      expect(tokenResponse.ok()).toBeTruthy();
      session = await tokenResponse.json();
    }
    expect(session.access_token).toBeTruthy();
    expect(session.refresh_token).toBeTruthy();

    await page.addInitScript(({ baseUrl, authSession }) => {
      if (window.name === "shadow-mate-real-e2e-seeded") return;
      window.name = "shadow-mate-real-e2e-seeded";
      localStorage.clear();
      sessionStorage.clear();
      const projectRef = new URL(baseUrl).hostname.split(".")[0];
      sessionStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(authSession));
    }, { baseUrl: supabaseUrl, authSession: session });

    await page.goto("/");
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    // A newly authenticated user without a household gets the setup dialog automatically.
    await expect(page.locator("#householdSetupForm")).toBeVisible();
    await page.locator('#householdSetupForm input[name="household"]').fill("Real E2E Family");
    await page.locator('#householdSetupForm input[name="learner"]').fill("Real E2E Learner");
    await page.locator('#householdSetupForm input[name="guardianConsent"]').check();
    await page.locator("#householdSetupForm").getByRole("button", { name: "创建并同步" }).click();
    await expect(page.locator('#accountButton[data-state="online"]')).toBeVisible();
    await expect(page.locator("#accountButton")).toHaveAttribute("title", /Real E2E Learner/);

    const cloudDialog = page.locator("#cloudDialog");
    if (await cloudDialog.evaluate((element) => element.open)) await cloudDialog.evaluate((element) => element.close());
    await page.click("#accountButton");
    await expect(page.locator("#cloudPanel .learner-choice")).toBeVisible();
    await expect(page.locator("#cloudPanel .learner-choice")).toContainText("Real E2E Learner");
    await expect(page.locator("[data-export]")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.evaluate(() => document.querySelector("[data-export]")?.click());
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^shadow-mate-family-\d{4}-\d{2}-\d{2}\.json$/);

    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => document.querySelector("[data-delete-household]")?.click());
    await expect(page.locator('#accountButton[data-state="local"]')).toBeVisible({ timeout: 10000 });
  });
});
