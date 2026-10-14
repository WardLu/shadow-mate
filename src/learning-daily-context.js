import { normalizeContentLearning } from "./content-learning.js";
import { getContentLearningPace, normalizeContentConfig } from "./learning-content-package.js";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function configFromPlan(config, plan) {
  const contentConfig = normalizeContentConfig({ ...config,
    package_ids: plan.packageIds ?? [plan.packageId], package_id: plan.packageId,
    learning_pace: {
      literacy_new: plan.limits.literacy.new,
      english_new: plan.limits.english.new,
      poems_new: plan.limits.poem.newPerIsoWeek ?? plan.limits.poem.new,
    },
  });
  contentConfig.learning_pace = getContentLearningPace(contentConfig);
  return contentConfig;
}

export function resolveDailyLearningContext({ learning, learnerScope, dayKey, contentConfig, mathLevel = null } = {}) {
  const normalized = normalizeContentLearning(learning, learnerScope);
  const saved = normalized.dailyContexts?.[dayKey];
  if (saved) return { context: structuredClone(saved), nextLearning: normalized };
  const day = normalized.plans[dayKey];
  const plan = day?.candidates[day.canonicalPlanId];
  const config = plan ? configFromPlan(contentConfig, plan) : normalizeContentConfig(contentConfig);
  config.learning_pace = getContentLearningPace(config);
  const context = { schemaVersion: 1, learnerScope: normalized.learnerScope, dayKey,
    contentConfig: config, mathLevel, ...(plan ? { planId: plan.planId } : {}) };
  const nextLearning = normalizeContentLearning({ ...normalized,
    dailyContexts: { ...normalized.dailyContexts, [dayKey]: context },
    referenceDay: [normalized.referenceDay, dayKey].filter(Boolean).sort(compareText).at(-1),
  }, learnerScope);
  return { context: structuredClone(nextLearning.dailyContexts[dayKey]), nextLearning };
}
