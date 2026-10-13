import { expect } from "@playwright/test";

// Preserve the print/speech regression checks with an issued, parent-selected
// four-row snapshot. A new learner is tested separately without this fixture.
export async function seedIssuedWritingPlan(page, { dayKey = "2026-09-01", reload = true } = {}) {
  await page.evaluate(async (day) => {
    const { getLearningCatalog } = await import("/src/content/learning-catalog.js");
    const { resolveDailyLearningPlan, contentLearningOccurrenceId } = await import("/src/content-learning.js");
    const { replaceContentLearningState } = await import("/src/learning-state.js");
    const state = window.learningDesk.getState();
    const learnerScope = window.learningDesk.getPersistenceScope();
    const catalog = getLearningCatalog(state.content_config.package_id);
    const selected = ["火", "水", "山", "木"].map((glyph) => catalog.writing.find((item) => item.glyph === glyph));
    if (selected.some((item) => !item)) throw new Error("Issued writing fixture has missing catalog items");
    const { plan, nextLearning } = resolveDailyLearningPlan({
      learning: null, learnerScope, dayKey: day, packageId: state.content_config.package_id, catalog,
      deviceId: "e2e-issued-plan",
    });
    plan.activities.writing = selected.map((item, index) => ({
      activityId: "writing", itemId: item.id,
      occurrenceId: contentLearningOccurrenceId("writing", item.id, day),
      reason: "continue", optional: true, role: item.role || `issued-row-${index}`,
    }));
    nextLearning.plans[day] = { canonicalPlanId: plan.planId, candidates: { [plan.planId]: plan } };
    nextLearning.introductions = nextLearning.introductions.filter((entry) => entry.activityId !== "writing" || selected.some((item) => item.id === entry.itemId));
    for (const item of selected) {
      if (!nextLearning.introductions.some((entry) => entry.activityId === "writing" && entry.itemId === item.id)) {
        nextLearning.introductions.push({ activityId: "writing", itemId: item.id, firstPlannedDay: day });
      }
    }
    window.learningDesk.replaceState(replaceContentLearningState(state, nextLearning), { persist: true, render: false });
  }, dayKey);
  if (reload) await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(window.learningDesk))).toBe(true);
}
