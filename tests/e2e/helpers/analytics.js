// Capture the SDK boundary locally; never send test events to Vercel.
export async function captureAnalytics(page) {
  await page.route("https://va.vercel-scripts.com/**", (route) => route.fulfill({
    status: 200, contentType: "application/javascript", body: "",
  }));
  await page.route("**/_vercel/insights/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.addInitScript(() => {
    window.__analyticsEvents = [];
    window.va = (command, payload) => {
      if (command === "event") window.__analyticsEvents.push(JSON.parse(JSON.stringify(payload)));
    };
  });
}

export function readAnalytics(page) {
  return page.evaluate(() => window.__analyticsEvents);
}
