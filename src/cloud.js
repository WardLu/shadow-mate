import { createClient } from "@supabase/supabase-js";
import { CLOUD_CONFIG } from "./config.js";
import { escapeHtml, formatAuthError, formatCloudError, passwordStrength, stateHasData, mergeObjects, mergeState, latestUpdatedAt, GRADE_OPTIONS, gradeLabel, gradeOptionsSelected } from "./lib.js";
import { runLockedAction } from "./action-lock.js";
import { icon } from "./icons.js";
import { buildCloudSavePayload, normalizeCloudLearningState } from "./learning-cloud-state.js";
import { createGrowthLoopTransport, fetchGrowthLoopSnapshot } from "./learning-growth-cloud.js";
import { buildHouseholdExport } from "./learning-export.js";
import { ACTIVITY_EVENT_TYPES, activityEventIdFor } from "./learning-analytics.js";
import { mergeGrowthLoopSnapshot } from "./learning-growth-loop.js";
import { createGrowthLoopRetryScheduler } from "./learning-growth-loop-retry.js";
import { isCurrentWorkspaceMetadata } from "./workspace-metadata-guard.js";

const PRODUCT_ID = CLOUD_CONFIG.productId;
const AUTH_PRODUCT_NAME = "影伴 Shadow Mate";
const ACTIVE_PROFILE_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_active_profile`;
const PASSWORD_PROMPT_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_password_prompt_skipped`;
const PROFILE_SCOPE_BLOCKED_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_profile_scope_blocked`;
export const GUARDIAN_CONSENT_TYPE = "learner_data_processing";
export const PRIVACY_POLICY_VERSION = "privacy-v1";
const PRIVACY_POLICY_URL = "https://sm.shadow.wang/privacy";
const MAX_CONFLICT_RETRIES = 2;
const CONFLICT_RETRY_DELAY_MS = 200;
const GROWTH_LOOP_SYNC_DEBOUNCE_MS = 500;
const GROWTH_LOOP_RETRY_FALLBACK_MS = 1000;
const PERFORMANCE_MARKS = new Set([
  "shadow-mate:workspace:start",
  "shadow-mate:workspace:memberships-ready",
  "shadow-mate:workspace:profiles-ready",
  "shadow-mate:workspace:metadata-ready",
  "shadow-mate:profile:local-ready",
  "shadow-mate:profile:remote-hydrate-start",
  "shadow-mate:profile:remote-hydrate-ready",
  "shadow-mate:profile:remote-hydrate-failed",
]);
const supabaseUrl = CLOUD_CONFIG.supabaseUrl;
const publishableKey = CLOUD_CONFIG.supabasePublishableKey;
const AUTH_STORAGE_KEY = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  : null;
const cloudEnabled = Boolean(supabaseUrl && publishableKey);
const supabase = cloudEnabled
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.sessionStorage,
      },
    })
  : null;
const growthLoopTransport = cloudEnabled ? createGrowthLoopTransport({ client: supabase }) : null;

function readProfileScopeBlock() {
  const blocked = localStorage.getItem(PROFILE_SCOPE_BLOCKED_KEY) === "1"
    || sessionStorage.getItem(PROFILE_SCOPE_BLOCKED_KEY) === "1";
  if (blocked && localStorage.getItem(PROFILE_SCOPE_BLOCKED_KEY) !== "1") {
    localStorage.setItem(PROFILE_SCOPE_BLOCKED_KEY, "1");
  }
  return blocked;
}

let session = null;
let memberships = [];
let profiles = [];
let guardianConsentHouseholds = new Set();
let guardianConsentMetadataReady = false;
let workspaceMetadataLoading = Promise.resolve();
let activeProfile = null;
let editingProfileId = null;
let editingHousehold = false;
let householdName = "";
let cloudVersion = null;
let saveTimer = null;
let saveInFlight = false;
let saveQueued = null;
let cloudSyncBlocked = false;
let profileScopeWriteBlocked = readProfileScopeBlock();
let toastTimer = null;
let lastSyncAt = null;
let workspaceLoading = null;
let authChangeVersion = 0;
let localResetInProgress = false;
let profileScopeResetInProgress = false;
let lastAuthSessionKey = null;
let passwordRecoveryActive = false;
let passwordStatusCheckedForSession = null;
let profileOperationQueue = Promise.resolve();
let profileOperationGeneration = 0;
let remoteHydratePending = null;

const growthLoopRetryScheduler = createGrowthLoopRetryScheduler({
  onTimer() {
    if (profileScopeWriteBlocked) return;
    const profile = activeProfile;
    if (!profile) return;
    const generation = profileOperationGeneration;
    void loadGrowthLoopProfile(profile, { generation }).catch((error) => {
      console.warn("Growth Loop cloud sync deferred:", error);
    });
  },
});

const accountButton = document.querySelector("#accountButton");
const dialog = document.querySelector("#cloudDialog");
const panel = document.querySelector("#cloudPanel");
const toast = document.querySelector("#syncToast");

function markPerformance(name) {
  if (!PERFORMANCE_MARKS.has(name) || typeof globalThis.performance?.mark !== "function") return;
  globalThis.performance.mark(name);
}

function restoreToastLocation() {
  if (!toast?.classList.contains("show")) return;
  if (dialog?.open) {
    panel?.prepend(toast);
    toast.classList.add("in-dialog");
  } else {
    document.body.append(toast);
    toast.classList.remove("in-dialog");
  }
}

function hideToast() {
  toast?.classList.remove("show", "in-dialog");
  if (toast && toast.parentElement !== document.body) document.body.append(toast);
}

function showToast(message, duration = 2800) {
  if (!toast) return;
  toast.textContent = message;
  if (dialog?.open) {
    panel?.prepend(toast);
    toast.classList.add("in-dialog");
  } else {
    document.body.append(toast);
    toast.classList.remove("in-dialog");
  }
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

function isActiveGrowthLoopProfile(profile) {
  const scope = window.growthLoop?.getScope?.() || {};
  return activeProfile?.id === profile?.id
    && activeProfile?.household_id === profile?.household_id
    && scope.profile_id === profile?.id
    && scope.household_id === profile?.household_id;
}

function isActiveProfile(profile) {
  return activeProfile?.id === profile?.id
    && activeProfile?.household_id === profile?.household_id;
}

function sameProfileScope(left = {}, right = {}) {
  return left?.household_id === right?.household_id
    && left?.profile_id === right?.profile_id;
}

function failClosedProfileScope() {
  profileScopeWriteBlocked = true;
  try {
    localStorage.setItem(PROFILE_SCOPE_BLOCKED_KEY, "1");
  } catch (error) {
    console.warn("Unable to persist the profile scope block:", error);
  }
  advanceProfileOperationGeneration();
  clearTimeout(saveTimer);
  saveTimer = null;
  saveQueued = null;
  resetGrowthLoopRemoteRetry();
  activeProfile = null;
  cloudVersion = null;
  cloudSyncBlocked = true;
  try {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch (error) {
    console.warn("Unable to remove the active profile key while failing closed:", error);
  }
  setAccountState();
  showToast("孩子切换未完成，本机作用域无法确认，已暂停同步；请在账号面板点击“清除本机数据”后重试。", 7000);
}

async function restoreScopeWithCas({ name, getScope, restoreScope, previousScope, targetScope }) {
  try {
    const currentScope = getScope?.() || {};
    if (sameProfileScope(currentScope, previousScope)) return { restored: true, already: true };
    if (!sameProfileScope(currentScope, targetScope)) return { failed: true, reason: "rollback_target_changed" };
    const compareScope = getScope?.() || {};
    if (!sameProfileScope(compareScope, targetScope)) return { failed: true, reason: "rollback_target_changed" };
    await restoreScope?.(previousScope, { adoptPending: false });
    const restoredScope = getScope?.() || {};
    if (!sameProfileScope(restoredScope, previousScope)) {
      throw new Error(`${name}_scope_rollback_not_committed`);
    }
    return { restored: true };
  } catch (rollbackError) {
    console.warn(`${name} profile scope rollback failed:`, rollbackError);
    return { failed: true };
  }
}

async function restoreProfileScopes(previousGrowthScope, previousLearningScope, targetScope) {
  const growthResult = await restoreScopeWithCas({
    name: "Growth Loop",
    getScope: () => window.growthLoop?.getScope?.(),
    restoreScope: (scope, options) => window.growthLoop?.loadScope?.(scope, options),
    previousScope: previousGrowthScope,
    targetScope,
  });
  const learningResult = await restoreScopeWithCas({
    name: "Learning Desk",
    getScope: () => window.learningDesk?.getEnvelope?.()?.scope,
    restoreScope: (scope, options) => window.learningDesk?.setScope?.(scope, options),
    previousScope: previousLearningScope,
    targetScope,
  });

  const growthScope = window.growthLoop?.getScope?.() || {};
  const learningScope = window.learningDesk?.getEnvelope?.()?.scope || {};
  const rollbackFailed = growthResult.failed || learningResult.failed;
  if (
    rollbackFailed
    || !sameProfileScope(growthScope, previousGrowthScope)
    || !sameProfileScope(learningScope, previousLearningScope)
  ) {
    failClosedProfileScope();
    return false;
  }
  return true;
}

function captureProfileCommitState() {
  return {
    activeProfile: activeProfile ? structuredClone(activeProfile) : null,
    activeProfileKey: localStorage.getItem(ACTIVE_PROFILE_KEY),
    cloudVersion,
    cloudSyncBlocked,
    lastSyncAt,
    growthScope: window.growthLoop?.getScope?.() || {},
    learningScope: window.learningDesk?.getEnvelope?.()?.scope || {},
  };
}

function sameActiveProfile(left, right) {
  return (left?.id || null) === (right?.id || null)
    && (left?.household_id || null) === (right?.household_id || null);
}

function restoreActiveProfileTuple(previous, targetProfile) {
  const targetTuple = activeProfile?.id === targetProfile?.id
    && localStorage.getItem(ACTIVE_PROFILE_KEY) === targetProfile?.id;
  const alreadyPrevious = sameActiveProfile(activeProfile, previous.activeProfile)
    && localStorage.getItem(ACTIVE_PROFILE_KEY) === (previous.activeProfileKey || null);
  if (!targetTuple && !alreadyPrevious) return false;

  activeProfile = previous.activeProfile ? structuredClone(previous.activeProfile) : null;
  cloudVersion = previous.cloudVersion;
  cloudSyncBlocked = previous.cloudSyncBlocked;
  lastSyncAt = previous.lastSyncAt;
  if (previous.activeProfileKey) localStorage.setItem(ACTIVE_PROFILE_KEY, previous.activeProfileKey);
  else localStorage.removeItem(ACTIVE_PROFILE_KEY);

  return sameActiveProfile(activeProfile, previous.activeProfile)
    && localStorage.getItem(ACTIVE_PROFILE_KEY) === (previous.activeProfileKey || null)
    && cloudVersion === previous.cloudVersion
    && sameProfileScope(window.growthLoop?.getScope?.() || {}, previous.growthScope)
    && sameProfileScope(window.learningDesk?.getEnvelope?.()?.scope || {}, previous.learningScope);
}

async function restoreProfileCommit(previous, targetProfile) {
  const restoredScopes = await restoreProfileScopes(previous.growthScope, previous.learningScope, {
    household_id: targetProfile?.household_id,
    profile_id: targetProfile?.id,
  });
  if (!restoredScopes || !restoreActiveProfileTuple(previous, targetProfile)) {
    if (!profileScopeWriteBlocked) failClosedProfileScope();
    return false;
  }
  setAccountState();
  return true;
}

function enqueueProfileOperation(operation, { advanceGeneration = true } = {}) {
  const generation = advanceGeneration
    ? advanceProfileOperationGeneration()
    : profileOperationGeneration;
  const result = profileOperationQueue.then(() => operation(generation));
  profileOperationQueue = result.catch(() => false);
  return result;
}

function advanceProfileOperationGeneration() {
  profileOperationGeneration += 1;
  window.growthLoop?.invalidateWriteOperations?.();
  return profileOperationGeneration;
}

function isCurrentProfileOperation(generation) {
  return !profileScopeWriteBlocked
    && (generation === null || generation === profileOperationGeneration);
}

async function loadGrowthLoopProfile(profile, { adoptPending = false, generation = null } = {}) {
  const isCurrent = () => isCurrentProfileOperation(generation) && isActiveGrowthLoopProfile(profile);
  if (profileScopeWriteBlocked || !profile || !window.growthLoop || !window.learningDesk || !isCurrent()) return;
  const scope = { household_id: profile.household_id, profile_id: profile.id };
  await window.growthLoop.loadScope(scope, { adoptPending, canCommit: isCurrent });
  if (!isCurrent()) return;
  await queueGrowthCloudActivity(profile, ACTIVITY_EVENT_TYPES.HOUSEHOLD_ACTIVATED, {}, "once", { generation });
  if (!isCurrent()) return;
  if (!growthLoopTransport) return;
  let remote;
  try {
    remote = await fetchGrowthLoopSnapshot(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
    });
  } catch (error) {
    if (isCurrent()) scheduleGrowthLoopRemoteRetry();
    throw error;
  }
  if (!isCurrent()) return;
  // A not-yet-migrated environment must not overwrite local records with an
  // empty fallback snapshot. Release-time migrations enable this path.
  if (remote.errors.length) {
    if (remote.errors.some(isRetryableGrowthLoopFetchError)) {
      scheduleGrowthLoopRemoteRetry();
    }
    return { skipped: true, reason: "remote_fetch_failed", errors: remote.errors };
  }
  if (!isCurrent()) return;
  resetGrowthLoopRemoteRetry();
  await window.growthLoop.mergeRemote(remote.snapshot);
  if (!isCurrent()) return;
  const report = await window.growthLoop.sync({ transport: growthLoopTransport });
  if (!isCurrent()) return;
  if (report.retryable || report.conflict || report.rejected) {
    await queueGrowthCloudActivity(profile, ACTIVITY_EVENT_TYPES.SYNC_FAILED, {
      source: "growth_loop_sync",
      error_code: report.conflict ? "conflict" : report.rejected ? "rejected" : "retryable",
      retryable: Boolean(report.retryable),
    }, `sync:${new Date().toISOString().slice(0, 13)}`, { generation });
  }
  if (!isCurrent()) return;
  if (report.next_attempt_at !== null && report.next_attempt_at !== undefined) {
    void scheduleGrowthLoopRetry({ notBefore: report.next_attempt_at, generation });
  } else if (report.retryable || report.conflict || report.rejected) {
    scheduleGrowthLoopSync();
  }
  return report;
}

async function queueGrowthCloudActivity(profile, event_type, payload = {}, bucket = "once", { ensureScope = false, generation = null } = {}) {
  if (profileScopeWriteBlocked || !profile || !window.growthLoop) return null;
  const scope = { household_id: profile.household_id, profile_id: profile.id };
  if (!scope.household_id || !scope.profile_id) return null;
  const isCurrent = () => isCurrentProfileOperation(generation) && isActiveGrowthLoopProfile(profile);
  try {
    if (!isCurrent()) return null;
    const currentScope = window.growthLoop.getScope();
    if (currentScope.household_id !== scope.household_id || currentScope.profile_id !== scope.profile_id) {
      if (!ensureScope) return null;
      await window.growthLoop.loadScope(scope, { adoptPending: false, canCommit: isCurrent });
    }
    if (!isCurrent() || window.growthLoop.getScope().profile_id !== scope.profile_id) return null;
    const event = await window.growthLoop.queueActivity({
      event_type,
      event_id: activityEventIdFor({ ...scope, event_type, bucket }),
      payload,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      client_version: document.documentElement.dataset.version || null,
    });
    return event;
  } catch (error) {
    console.warn("Growth Loop cloud activity event deferred:", error);
    return null;
  }
}

function isRetryableGrowthLoopFetchError(error = {}) {
  const status = Number(error.status ?? error.code);
  return !Number.isFinite(status) || status === 0 || status === 408 || status === 429 || status >= 500;
}

function nextGrowthLoopAttemptAt(events, now = Date.now()) {
  // The outbox is FIFO, so the queue head is the earliest eligible attempt;
  // later pending events cannot skip a retryable head that is backing off.
  const next = (events || [])
    .filter((event) => event.status === "pending" || event.status === "retryable")
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))[0];
  if (!next) return null;
  return Math.max(now, Number(next.next_attempt_at || 0));
}

function scheduleGrowthLoopSyncAt(targetAt) {
  if (profileScopeWriteBlocked || !activeProfile) return null;
  return growthLoopRetryScheduler.scheduleAt(targetAt);
}

function scheduleGrowthLoopRemoteRetry() {
  if (!activeProfile) return null;
  return growthLoopRetryScheduler.recordRemoteFailure();
}

function resetGrowthLoopRemoteRetry() {
  growthLoopRetryScheduler.resetRemoteFailures({ clearTimer: true });
}

async function scheduleGrowthLoopRetry({
  notBefore = Date.now(),
  fallbackDelayMs = GROWTH_LOOP_RETRY_FALLBACK_MS,
  generation = null,
} = {}) {
  if (profileScopeWriteBlocked || !activeProfile || !isCurrentProfileOperation(generation)) return null;
  const profileId = activeProfile.id;
  const now = Date.now();
  let scheduledAt = Math.max(Number(notBefore) || now, now + fallbackDelayMs);
  try {
    const events = await window.growthLoop?.pendingOutbox?.();
    if (!isCurrentProfileOperation(generation) || activeProfile?.id !== profileId) return null;
    const nextAttemptAt = nextGrowthLoopAttemptAt(events, now);
    if (nextAttemptAt !== null) scheduledAt = Math.max(Number(notBefore) || now, nextAttemptAt);
  } catch (error) {
    console.warn("Growth Loop retry schedule deferred:", error);
  }
  return scheduleGrowthLoopSyncAt(scheduledAt);
}

function scheduleGrowthLoopSync() {
  return scheduleGrowthLoopSyncAt(Date.now() + GROWTH_LOOP_SYNC_DEBOUNCE_MS);
}

function guardianConsentField() {
  return `<label class="cloud-consent cloud-field">
    <input type="checkbox" name="guardianConsent" value="on" required>
    <span>我是孩子的家长或监护人，已阅读<a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer">隐私说明</a>，同意影伴为学习者保存昵称、年级和学习记录。</span>
  </label>`;
}

function guardianConsentPayload(householdId) {
  return {
    household_id: householdId,
    user_id: session.user.id,
    consent_type: GUARDIAN_CONSENT_TYPE,
    policy_version: PRIVACY_POLICY_VERSION,
  };
}

async function clearLocalAccountState() {
  resetGrowthLoopRemoteRetry();
  profileScopeWriteBlocked = true;
  cloudSyncBlocked = true;
  try {
    localStorage.setItem(PROFILE_SCOPE_BLOCKED_KEY, "1");
  } catch (error) {
    console.warn("Unable to persist the profile scope block before cleanup:", error);
  }
  advanceProfileOperationGeneration();
  let signOutError = null;
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    signOutError = error;
  } catch (error) {
    signOutError = error;
  }
  try {
    if (AUTH_STORAGE_KEY) sessionStorage.clear();
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    await window.growthLoop?.clearAllLocalData?.();
    window.learningDesk.clearLocalData({ reload: false });
  } catch (error) {
    profileScopeWriteBlocked = true;
    cloudSyncBlocked = true;
    try {
      localStorage.setItem(PROFILE_SCOPE_BLOCKED_KEY, "1");
    } catch (markerError) {
      console.warn("Unable to persist the profile scope block after cleanup failure:", markerError);
    }
    setAccountState();
    throw error;
  }
  try {
    localStorage.removeItem(PROFILE_SCOPE_BLOCKED_KEY);
    sessionStorage.removeItem(PROFILE_SCOPE_BLOCKED_KEY);
  } catch (error) {
    profileScopeWriteBlocked = true;
    cloudSyncBlocked = true;
    try {
      localStorage.setItem(PROFILE_SCOPE_BLOCKED_KEY, "1");
    } catch (markerError) {
      console.warn("Unable to restore the profile scope block:", markerError);
    }
    setAccountState();
    throw error;
  }
  session = null;
  memberships = [];
  profiles = [];
  guardianConsentHouseholds = new Set();
  activeProfile = null;
  profileScopeWriteBlocked = false;
  cloudSyncBlocked = false;
  setAccountState();
  return signOutError;
}

async function completeLocalAccountReset(successMessage) {
  localResetInProgress = true;
  let signOutError;
  try {
    signOutError = await clearLocalAccountState();
  } catch (error) {
    console.warn("Local account cleanup failed; fail-closed protection remains:", error);
    showToast("本机数据清理未完成，保护模式仍保持；请重试。", 7000);
    return false;
  } finally {
    localResetInProgress = false;
  }
  closeDialog();
  showToast(
    signOutError
      ? `${successMessage}；本机已退出登录，云端会话注销未完成，请稍后重试。`
      : successMessage,
    5000,
  );
  return true;
}

async function resetSignedOutProfileScope(changeVersion) {
  const pendingScope = { household_id: null, profile_id: null };
  const canCommit = () => !session
    && changeVersion === authChangeVersion;
  try {
    if (!canCommit()) return false;
    if (
      typeof window.growthLoop?.loadScope !== "function"
      || typeof window.growthLoop?.getScope !== "function"
      || typeof window.learningDesk?.setScope !== "function"
      || typeof window.learningDesk?.getEnvelope !== "function"
    ) {
      throw new Error("signed_out_profile_scope_reset_dependencies_missing");
    }
    await window.growthLoop.loadScope(pendingScope, { adoptPending: false, canCommit });
    if (!canCommit()) return false;
    await window.learningDesk.setScope(pendingScope, { adoptPending: false, canCommit });
    if (!canCommit()) return false;
    const growthScope = window.growthLoop.getScope();
    const learningScope = window.learningDesk.getEnvelope()?.scope;
    if (!sameProfileScope(growthScope, pendingScope) || !sameProfileScope(learningScope, pendingScope)) {
      throw new Error("signed_out_profile_scope_not_reset");
    }
    return true;
  } catch (error) {
    console.warn("Unable to reset profile scope after sign-out:", error);
    failClosedProfileScope();
    return false;
  }
}

function formatSyncTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function updateSyncStatus() {
  const status = panel?.querySelector("[data-last-sync]");
  if (status) status.textContent = `家庭空间最近同步：${formatSyncTime(lastSyncAt)}`;
}

async function sendLoginOtp(email) {
  localResetInProgress = false;
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
      data: {
        product_id: PRODUCT_ID,
        product_name: AUTH_PRODUCT_NAME,
      },
    },
  });
}

async function checkAuthEmail(email) {
  if (!supabase) return { data: null, error: new Error("Cloud authentication is unavailable") };
  return supabase.functions.invoke("check-auth-email", { body: { email } });
}

function passwordPromptStorageKey() {
  return session?.user?.id ? `${PASSWORD_PROMPT_KEY}:${session.user.id}` : PASSWORD_PROMPT_KEY;
}

async function fetchHasPassword() {
  const { data, error } = await supabase.rpc("learning_has_password");
  if (error) {
    console.error("Password status error:", error);
    return null;
  }
  return Boolean(data);
}

function strengthMarkup(value) {
  const strength = passwordStrength(value);
  return `
    <div class="password-strength" data-score="${strength.score}" aria-live="polite">
      <div class="password-strength-head"><span>密码强度</span><strong>${strength.label}</strong></div>
      <div class="password-strength-bars" aria-hidden="true">
        ${[1, 2, 3, 4].map((level) => `<span class="${level <= strength.score ? "active" : ""}"></span>`).join("")}
      </div>
      <p>${strength.valid ? "已满足至少 6 位要求；混合字母、数字和符号会更安全。" : "密码至少需要 6 位。"}</p>
    </div>`;
}

function bindPasswordEditor(form) {
  const passwordInput = form.querySelector("[name=newPassword]");
  const strength = form.querySelector("[data-password-strength]");
  const updateStrength = () => { strength.innerHTML = strengthMarkup(passwordInput.value); };
  passwordInput.addEventListener("input", updateStrength);
  updateStrength();
  form.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = form.querySelector(`[name="${button.dataset.togglePassword}"]`);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "显示" : "隐藏";
      button.setAttribute("aria-pressed", String(!showing));
    });
  });
}

function renderPasswordEditor({ mode = "setup" } = {}) {
  const isChange = mode === "change";
  const isRecovery = mode === "recovery";
  const title = isChange ? "修改共享密码" : isRecovery ? "重设共享密码" : "设置共享密码";
  panel.innerHTML = `
    <div class="cloud-heading">
      <h2>${icon("cloudCheck")} ${title}</h2>
      ${isRecovery ? "" : `<button class="icon-button" type="button" data-password-close aria-label="关闭密码设置">${icon("close")}</button>`}
    </div>
    <p>此密码属于当前 Supabase 账号，适用于使用同一账号的 Shadow 系列产品。密码至少 6 位。</p>
    <form id="passwordEditorForm">
      ${isChange ? `<label class="cloud-field">当前密码<div class="password-input-row"><input name="currentPassword" type="password" autocomplete="current-password" required><button class="cloud-action secondary compact" type="button" data-toggle-password="currentPassword">显示</button></div></label>` : ""}
      <label class="cloud-field">新密码<div class="password-input-row"><input name="newPassword" type="password" autocomplete="new-password" minlength="6" required><button class="cloud-action secondary compact" type="button" data-toggle-password="newPassword">显示</button></div></label>
      <div data-password-strength></div>
      <label class="cloud-field">确认新密码<div class="password-input-row"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required><button class="cloud-action secondary compact" type="button" data-toggle-password="confirmPassword">显示</button></div></label>
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">${isChange ? "保存新密码" : "设置密码"}</button>
        ${mode === "setup" ? '<button class="cloud-action secondary" type="button" data-password-later>稍后设置</button>' : ""}
        ${isChange ? '<button class="cloud-action secondary" type="button" data-password-cancel>取消</button>' : ""}
      </div>
    </form>
  `;
  restoreToastLocation();
  const form = panel.querySelector("#passwordEditorForm");
  bindPasswordEditor(form);

  const leaveEditor = () => {
    passwordRecoveryActive = false;
    renderPanel();
  };
  panel.querySelector("[data-password-close]")?.addEventListener("click", leaveEditor);
  panel.querySelector("[data-password-cancel]")?.addEventListener("click", leaveEditor);
  panel.querySelector("[data-password-later]")?.addEventListener("click", () => {
    sessionStorage.setItem(passwordPromptStorageKey(), "1");
    renderPanel();
    showToast("本次登录已跳过密码设置；下次使用验证码登录时会再次提醒。", 5000);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("[type=submit]");
    await runLockedAction(submitButton, async () => {
      const values = new FormData(form);
      const nextPassword = String(values.get("newPassword") || "");
      const confirmation = String(values.get("confirmPassword") || "");
      const strength = passwordStrength(nextPassword);
      if (!strength.valid) {
        showToast("密码至少需要 6 位。", 5000);
        return;
      }
      if (nextPassword !== confirmation) {
        showToast("两次输入的密码不一致。", 5000);
        return;
      }
      if (isChange) {
        const currentPassword = String(values.get("currentPassword") || "");
        const email = session?.user?.email || "";
        const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (reauthenticationError) {
          showToast(formatAuthError(reauthenticationError, "当前密码不正确。"), 6000);
          return;
        }
      }
      const { error } = await supabase.auth.updateUser({
        password: nextPassword,
        data: { shared_password_set: true },
      });
      if (error) {
        showToast(formatAuthError(error, isChange ? "当前密码不正确或新密码无法保存。" : "密码设置失败，请稍后再试。"), 6000);
        return;
      }
      sessionStorage.removeItem(passwordPromptStorageKey());
      passwordRecoveryActive = false;
      passwordStatusCheckedForSession = session?.access_token || null;
      renderPanel();
      showToast(isChange ? "共享密码已修改" : "共享密码已设置，可用于 Shadow 系列产品登录", 6000);
    });
  });
}

function renderPasswordRecoveryRequest(prefillEmail = "") {
  panel.innerHTML = `
    <div class="cloud-heading"><h2>${icon("cloud")} 找回密码</h2><button class="icon-button" type="button" data-recovery-back aria-label="返回登录">${icon("close")}</button></div>
    <p>输入账号邮箱，我们会先确认账号是否存在，再发送密码重设邮件。</p>
    <form id="passwordRecoveryForm">
      <label class="cloud-field">账号邮箱<input name="email" type="email" autocomplete="email" required value="${escapeHtml(prefillEmail)}" placeholder="parent@example.com"></label>
      <div class="cloud-actions"><button class="cloud-action" type="submit">发送重设邮件</button><button class="cloud-action secondary" type="button" data-recovery-cancel>返回登录</button></div>
    </form>
  `;
  restoreToastLocation();
  const goBack = () => renderSignedOut("password", prefillEmail);
  panel.querySelector("[data-recovery-back]").addEventListener("click", goBack);
  panel.querySelector("[data-recovery-cancel]").addEventListener("click", goBack);
  const form = panel.querySelector("#passwordRecoveryForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("[type=submit]");
    await runLockedAction(submitButton, async () => {
      const email = String(new FormData(form).get("email") || "").trim();
      const { data: emailStatus, error: lookupError } = await checkAuthEmail(email);
      if (lookupError || typeof emailStatus?.registered !== "boolean") {
        showToast("暂时无法确认该邮箱，请稍后再试。", 6000);
        return;
      }
      if (!emailStatus.registered) {
        showToast("该邮箱尚未注册，请先注册账号或使用邮箱验证码登录。", 6000);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        showToast(formatAuthError(error, "密码重设邮件发送失败，请稍后再试。"), 6000);
        return;
      }
      panel.innerHTML = `
        <h2>${icon("cloudCheck")} 请检查邮箱</h2>
        <p>如果该邮箱已注册，密码重设邮件已经发送。请点击邮件中的按钮返回当前产品并设置新密码。</p>
        <div class="cloud-actions"><button class="cloud-action secondary" type="button" data-recovery-done>返回登录</button></div>
      `;
      panel.querySelector("[data-recovery-done]").addEventListener("click", () => renderSignedOut("password", email));
    });
  });
}

// escapeHtml imported from lib.js
function readRememberedProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

// stateHasData, mergeObjects, mergeState imported from lib.js

function setAccountState() {
  if (!accountButton) return;
  const subEl = document.querySelector(".topbar .sub");
  if (session && activeProfile) {
    accountButton.dataset.state = "online";
    accountButton.innerHTML = `${icon("cloud")}<span>云端</span>`;
    accountButton.setAttribute("aria-label", "账户与云端同步，当前已连接");
    accountButton.title = `${activeProfile.display_name} · 云端已连接`;
    if (subEl) subEl.innerHTML = `${icon("learner")} ${escapeHtml(activeProfile.display_name)} · ${gradeLabel(activeProfile.grade_level)}`;
  } else if (session) {
    accountButton.dataset.state = "online";
    accountButton.innerHTML = `${icon("learner")}<span>账户</span>`;
    accountButton.setAttribute("aria-label", "账户与云端同步，选择学习者");
    accountButton.title = "已登录，待选择学习者";
    if (subEl) subEl.textContent = "已登录 · 点击右上角选择孩子";
  } else {
    accountButton.dataset.state = "local";
    accountButton.innerHTML = `${icon("learner")}<span>登录</span>`;
    accountButton.setAttribute("aria-label", "账户与云端同步，登录");
    accountButton.title = "点击登录，开启云端跨设备同步";
    if (subEl) subEl.textContent = "绿色挖掘机 · 每日成长打卡";
  }
}

function openDialog() {
  if (session && workspaceLoading) renderWorkspaceLoading();
  else renderPanel();
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  if (dialog.open) dialog.close();
  hideToast();
}

function renderWorkspaceLoading() {
  panel.innerHTML = `
    <div class="cloud-heading">
      <h2>${icon("cloudCheck")} 家庭学习空间</h2>
      <button class="icon-button" type="button" data-close-dialog aria-label="关闭账户面板">${icon("close")}</button>
    </div>
    <p class="cloud-sync-copy">正在连接云端学习空间，请稍候…</p>
  `;
  panel.querySelector("[data-close-dialog]")?.addEventListener("click", closeDialog);
}

function renderOtpVerification(email) {
  panel.innerHTML = `
    <h2>${icon("checkCircle")} 输入邮箱验证码</h2>
    <p>验证码已发送到 <b>${escapeHtml(email)}</b>。输入邮件中的验证码完成注册或登录；如果邮件提供登录按钮，也可以直接点击。</p>
    <form id="emailOtpForm">
      <label class="cloud-field">
        邮箱验证码
        <input name="token" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" required placeholder="请输入 6 位验证码">
      </label>
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">验证并登录</button>
        <button class="cloud-action secondary" type="button" data-resend>重新发送</button>
        <button class="cloud-action secondary" type="button" data-change-email>更换邮箱</button>
        <button class="cloud-action secondary" type="button" data-close>稍后验证</button>
      </div>
    </form>
    <p class="cloud-hint">验证码通常为 6 位数字，仅能使用一次。收不到邮件时请检查垃圾邮件夹，或等待片刻后重新发送。</p>
  `;
  restoreToastLocation();

  const form = panel.querySelector("#emailOtpForm");
  const input = form.querySelector("[name=token]");
  const submitButton = form.querySelector("[type=submit]");
  const resendButton = form.querySelector("[data-resend]");

  input.focus();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("token") || "").trim();
    if (!/^\d{6,8}$/.test(token)) {
      showToast("请输入 6-8 位数字验证码", 4000);
      input.focus();
      return;
    }
    await runLockedAction(submitButton, async () => {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error) {
        input.select();
        showToast(formatAuthError(error), 5000);
        return;
      }
      showToast("验证成功，正在连接云端…", 4000);
    }, { busyText: "正在验证…" });
  };

  resendButton.onclick = async () => {
    let sent = false;
    await runLockedAction(resendButton, async () => {
      const { error } = await sendLoginOtp(email);
      if (error) {
        showToast(formatAuthError(error, "重新发送失败，请稍后再试。"), 5000);
        return;
      }
      sent = true;
      showToast("新的验证码已发送", 4000);
    }, { busyText: "正在发送…" });
    if (sent && resendButton.isConnected) {
      resendButton.disabled = true;
      resendButton.textContent = "30 秒后可重发";
      window.setTimeout(() => {
        if (resendButton.isConnected) {
          resendButton.disabled = false;
          resendButton.textContent = "重新发送";
        }
      }, 30000);
    }
  };

  panel.querySelector("[data-change-email]").onclick = renderSignedOut;
  panel.querySelector("[data-close]").onclick = closeDialog;

}

async function consumeAuthTokenHash() {
  if (!cloudEnabled) return;
  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (!tokenHash || type !== "email") return;

  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) showToast(formatAuthError(error, "邮件链接验证失败，请重新获取验证码。"), 6000);
}

function renderSignedOut(mode = "otp", prefillEmail = "") {
  const otpMode = mode !== "password";
  panel.innerHTML = `
    <h2>${icon("cloud")} 跨设备同步</h2>
    <p>平时可以继续离线使用。家长用邮箱登录后，学习记录会同步到云端，孩子不需要单独注册邮箱。登录后可以添加多个孩子并随时切换。</p>
    <div class="auth-mode-switch" role="tablist" aria-label="选择登录方式">
      <button class="${otpMode ? "active" : ""}" type="button" role="tab" aria-selected="${otpMode}" data-auth-mode="otp">邮箱验证码</button>
      <button class="${otpMode ? "" : "active"}" type="button" role="tab" aria-selected="${!otpMode}" data-auth-mode="password">邮箱密码</button>
    </div>
    <form id="emailLoginForm" data-auth-form="${otpMode ? "otp" : "password"}">
      <label class="cloud-field">
        家长邮箱
        <input type="email" name="email" autocomplete="email" required value="${escapeHtml(prefillEmail)}" placeholder="parent@example.com">
      </label>
      ${otpMode ? "" : `<label class="cloud-field">密码<div class="password-input-row"><input type="password" name="password" autocomplete="current-password" minlength="6" required><button class="cloud-action secondary compact" type="button" data-toggle-login-password>显示</button></div></label>`}
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">${otpMode ? "发送验证码" : "登录"}</button>
        ${otpMode ? "" : '<button class="cloud-action secondary" type="button" data-forgot-password>忘记密码</button>'}
        <button class="cloud-action secondary" type="button" data-close>继续本机使用</button>
        <button class="cloud-action danger" type="button" data-clear-local>清除本机数据</button>
      </div>
    </form>
    <p class="cloud-hint">${icon("hint")} ${otpMode ? "验证码可用于首次注册或登录。" : "密码属于共享账号，可用于使用同一 Supabase Auth 的 Shadow 系列产品；尚未设置密码时请使用邮箱验证码。"}</p>
    ${
      cloudEnabled
        ? ""
        : `<div class="cloud-status">${icon("alert")} 尚未配置云端环境，当前只能使用本机模式。</div>`
    }
  `;
  restoreToastLocation();

  panel.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const email = panel.querySelector("[name=email]")?.value || "";
      renderSignedOut(button.dataset.authMode, email);
    });
  });
  panel.querySelector("[data-close]").onclick = closeDialog;
  panel.querySelector("[data-clear-local]").onclick = async () => {
    const confirmed = window.confirm("将清除此设备上的影伴学习记录。此操作不可撤销，是否继续？");
    if (!confirmed) return;
    await runLockedAction(panel.querySelector("[data-clear-local]"), () => (
      completeLocalAccountReset("本机数据已清除")
    ), { busyText: "正在清除…" });
  };
  panel.querySelector("[data-toggle-login-password]")?.addEventListener("click", (event) => {
    const input = panel.querySelector("[name=password]");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    event.currentTarget.textContent = showing ? "显示" : "隐藏";
  });
  panel.querySelector("[data-forgot-password]")?.addEventListener("click", () => {
    renderPasswordRecoveryRequest(panel.querySelector("[name=email]")?.value || "");
  });
  panel.querySelector("#emailLoginForm").onsubmit = async (event) => {
    event.preventDefault();
    if (!cloudEnabled) {
      showToast("请先配置云端环境");
      return;
    }
    const form = event.currentTarget;
    const submitButton = form.querySelector("[type=submit]");
    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    await runLockedAction(submitButton, async () => {
      if (form.dataset.authForm === "password") {
        const password = String(values.get("password") || "");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          showToast(formatAuthError(error, "邮箱或密码不正确；如果尚未设置密码，请改用邮箱验证码登录。"), 6000);
          return;
        }
        showToast("登录成功，正在连接云端…", 4000);
        return;
      }
      const { error } = await sendLoginOtp(email);
      if (error) {
        showToast(formatAuthError(error, "验证码发送失败，请稍后再试。"), 5000);
        return;
      }
      renderOtpVerification(email);
    }, { busyText: otpMode ? "正在发送…" : "正在登录…" });
  };
}

function renderSetup() {
  panel.innerHTML = `
    <h2>建立家庭学习空间</h2>
    <p>学习者是家庭内的独立档案，不是登录账号。只保存显示名称和年级，不要求孩子提供邮箱或生日。</p>
    <form id="householdSetupForm">
      <label class="cloud-field">
        家庭空间名称
        <input name="household" maxlength="40" required value="家庭空间">
      </label>
      <label class="cloud-field">
        第一个学习者
        <input name="learner" maxlength="30" required placeholder="请输入学习者昵称">
      </label>
      <label class="cloud-field">
        当前年级
        <select name="grade">
          ${GRADE_OPTIONS}
        </select>
      </label>
      ${guardianConsentField()}
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">创建并同步</button>
        <button class="cloud-action secondary" type="button" data-close>稍后设置</button>
      </div>
    </form>
  `;
  restoreToastLocation();
  panel.querySelector("[data-close]").onclick = closeDialog;
  const householdInput = panel.querySelector('input[name="household"]');
  if (householdInput) {
    householdInput.addEventListener('focus', () => {
      if (householdInput.value === '家庭空间') {
        householdInput.value = '';
      }
    });
    householdInput.addEventListener('blur', () => {
      if (!householdInput.value.trim()) {
        householdInput.value = '家庭空间';
      }
    });
  }
  panel.querySelector("#householdSetupForm").onsubmit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submitButton = formElement.querySelector("[type=submit]");
    await runLockedAction(submitButton, async () => {
      const form = new FormData(formElement);
      if (form.get("guardianConsent") !== "on") {
        showToast("请先确认你是家长或监护人并阅读隐私说明。", 5000);
        return;
      }
      const householdId = crypto.randomUUID();
      const profileId = crypto.randomUUID();
      const payload = {
        id: householdId,
        project_id: PRODUCT_ID,
        name: form.get("household").trim(),
        owner_user_id: session.user.id,
      };
      const { error: householdError } = await supabase
        .from("learning_households")
        .insert(payload);
      if (householdError) {
        console.error("Household error:", householdError);
        showToast(formatCloudError(householdError, "创建家庭失败，请稍后再试。"), 5000);
        return;
      }
      const { error: memberError } = await supabase
        .from("learning_household_members")
        .insert({
          household_id: householdId,
          user_id: session.user.id,
          role: "owner",
        });
      if (memberError) {
        console.error("Member error:", memberError);
        showToast(formatCloudError(memberError, "创建成员失败，请稍后再试。"), 5000);
        return;
      }
      const { error: consentError } = await supabase
        .from("learning_guardian_consents")
        .insert(guardianConsentPayload(householdId));
      if (consentError) {
        console.error("Guardian consent error:", consentError);
        showToast(formatCloudError(consentError, "保存家长同意失败，请稍后再试。"), 5000);
        return;
      }
      const { error: profileError } = await supabase
        .from("learning_profiles")
        .insert({
          id: profileId,
          household_id: householdId,
          display_name: form.get("learner").trim(),
          grade_level: Number(form.get("grade")),
        });
      if (profileError) {
        console.error("Profile error:", profileError);
        showToast(formatCloudError(profileError, "创建学习者失败，请稍后再试。"), 5000);
        return;
      }
      await loadWorkspace(profileId, { migrateLocal: true, deferGrowthLoopSync: true });
      void enqueueProfileOperation(
        (generation) => queueGrowthCloudActivity(
          { household_id: householdId, id: profileId },
          ACTIVITY_EVENT_TYPES.LEARNER_CREATED,
          { source: "household_setup" },
          `learner:${profileId}`,
          { ensureScope: true, generation },
        ),
        { advanceGeneration: false },
      ).catch((error) => {
        console.warn("Growth Loop learner-created activity deferred:", error);
      });
      showToast("家庭学习空间已建立，正在同步本机记录");
      renderPanel();
      const prompted = await maybePromptPasswordSetup({ force: true });
      if (!prompted) {
        closeDialog();
      }
    }, { busyText: "正在创建…" });
  };
}

function renderAccount() {
  const activeHouseholdId = memberships[0]?.household_id;
  const hasGuardianConsent = guardianConsentHouseholds.has(activeHouseholdId);
  const choices = profiles
    .map((profile) => {
      if (editingProfileId === profile.id) {
        return `<div class="learner-choice active">
          <form class="learner-edit-form" data-edit-profile="${profile.id}">
            <label class="cloud-field">学习者昵称<input name="name" value="${escapeHtml(profile.display_name)}" maxlength="30" required class="peanut-input" placeholder="昵称"></label>
            <label class="cloud-field">年级<select name="grade" class="peanut-input learner-edit-grade">${gradeOptionsSelected(profile.grade_level)}</select></label>
            <div class="cloud-actions">
              <button class="cloud-action" type="submit">保存</button>
              <button class="cloud-action secondary" type="button" data-cancel-edit>取消</button>
            </div>
          </form>
        </div>`;
      }
      return `<div class="learner-choice-row">
        <div class="learner-choice-group">
          <button class="learner-choice ${profile.id === activeProfile?.id ? "active" : ""}" type="button" data-profile="${profile.id}">
            <span class="learner-avatar">${profile.id === activeProfile?.id ? icon("checkCircle") : icon("learner")}</span>
            <span><strong>${escapeHtml(profile.display_name)}</strong><small>${gradeLabel(profile.grade_level)}</small></span>
          </button>
          <button class="icon-button learner-edit-btn" type="button" data-edit="${profile.id}" aria-label="编辑${escapeHtml(profile.display_name)}">${icon("pencil")}</button>
        </div>
        <button class="cloud-action danger learner-delete" type="button" data-delete-profile="${profile.id}">删除学习者</button>
      </div>`;
    })
    .join("");
  const hhDisplay = editingHousehold
    ? `<form id="householdEditForm"><label class="cloud-field">家庭空间名称<input name="household" value="${escapeHtml(householdName)}" maxlength="40" required class="peanut-input household-edit-input"></label><div class="cloud-actions"><button class="cloud-action" type="submit">保存</button><button class="cloud-action secondary" type="button" data-cancel-hh>取消</button></div></form>`
    : `<p>${escapeHtml(session.user.email || "已登录")} · ${escapeHtml(householdName || "家庭")} · 数据按家庭隔离 <button class="icon-button learner-edit-btn" type="button" data-edit-household aria-label="编辑家庭名称">${icon("pencil")}</button></p>`;
  panel.innerHTML = `
    <div class="cloud-heading"><h2>${icon("house")} 家庭学习空间</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭账户面板">${icon("close")}</button></div>
    ${hhDisplay}
    <div class="cloud-status">${icon("cloudCheck")} ${
      activeProfile ? `${escapeHtml(activeProfile.display_name)} 的记录已连接云端` : "请选择学习者"
    }</div>
    <div class="cloud-sync-meta" data-last-sync>家庭空间最近同步：${formatSyncTime(lastSyncAt)}</div>
    <p class="cloud-sync-copy">家庭空间统一管理，学习记录按孩子分别同步。切换孩子后会加载对应的学习记录。</p>
    <div class="learner-list">${choices}</div>
    <form id="addLearnerForm">
      ${hasGuardianConsent ? '<p class="cloud-hint">家长同意已记录（隐私说明版本 privacy-v1）。</p>' : `<p class="cloud-hint">添加学习者前，需要由家长或监护人确认隐私说明。</p>${guardianConsentField()}`}
      <label class="cloud-field">
        添加学习者
        <input name="learner" maxlength="30" required placeholder="例如：弟弟">
      </label>
      <label class="cloud-field">
        年级
        <select name="grade">
          ${GRADE_OPTIONS}
        </select>
      </label>
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">添加</button>
        <button class="cloud-action secondary" type="button" data-sync>立即同步</button>
        <button class="cloud-action secondary" type="button" data-export>导出家庭数据</button>
        <button class="cloud-action secondary" type="button" data-password-settings>密码设置</button>
        <button class="cloud-action danger" type="button" data-signout>退出登录</button>
        <button class="cloud-action danger" type="button" data-clear-local>清除本机数据</button>
        <button class="cloud-action danger" type="button" data-delete-household>删除全部家庭数据</button>
        ${CLOUD_CONFIG.authAccountDeletionEnabled ? '<button class="cloud-action danger" type="button" data-delete-account>注销账号并删除全部数据</button>' : ""}
      </div>
    </form>
  `;
  restoreToastLocation();
  panel.querySelector("[data-close-dialog]")?.addEventListener("click", closeDialog);
  panel.querySelectorAll("[data-profile]").forEach((button) => {
    button.onclick = async () => {
      await runLockedAction(button, async () => {
        await enqueueProfileOperation(async (generation) => {
          let migrateLocal = false;
          try {
            if (button.dataset.profile !== activeProfile?.id && await window.growthLoop?.hasPendingData?.()) {
              if (!isCurrentProfileOperation(generation)) return false;
              migrateLocal = window.confirm("发现这台设备上还有未关联学习记录。是否将它们导入到这个孩子的档案？");
            }
          } catch (growthError) {
            console.warn("Growth Loop profile switch blocked:", growthError);
            if (isCurrentProfileOperation(generation)) {
              showToast("孩子切换未完成，本机成长记录暂时不可用；当前孩子未变，请重试。", 6000);
            }
            return false;
          }
          if (!isCurrentProfileOperation(generation)) return false;
          return selectProfileNow(button.dataset.profile, { migrateLocal }, generation);
        });
        renderAccount();
      }, { busyText: "正在切换…" });
    };
  });
  panel.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); editingProfileId = btn.dataset.edit; renderAccount(); };
  });
  panel.querySelectorAll("[data-delete-profile]").forEach((button) => {
    button.onclick = async () => {
      const profile = profiles.find((item) => item.id === button.dataset.deleteProfile);
      if (!profile) return;
      const confirmed = window.confirm(`将删除 ${profile.display_name} 的云端学习记录和本机缓存，此操作不可撤销。是否继续？`);
      if (!confirmed) return;
      await runLockedAction(button, async () => {
        const { error } = await supabase.from("learning_profiles").delete().eq("id", profile.id);
        if (error) {
          showToast(formatCloudError(error, "删除学习者失败，请稍后再试。"), 5000);
          return;
        }
        const deletingActive = activeProfile?.id === profile.id;
        await window.growthLoop?.clearScope?.({ household_id: profile.household_id, profile_id: profile.id });
        profiles = profiles.filter((item) => item.id !== profile.id);
        if (deletingActive) {
          resetGrowthLoopRemoteRetry();
          activeProfile = null;
          cloudVersion = null;
          localStorage.removeItem(ACTIVE_PROFILE_KEY);
          window.learningDesk.replaceState({}, { persist: true });
        }
        await loadWorkspace();
        renderAccount();
        showToast("学习者及其学习记录已删除");
      }, { busyText: "正在删除…" });
    };
  });
  panel.querySelector("[data-edit-household]")?.addEventListener("click", () => { editingHousehold = true; renderAccount(); });
  panel.querySelector("[data-cancel-edit]")?.addEventListener("click", () => { editingProfileId = null; renderAccount(); });
  panel.querySelector("[data-cancel-hh]")?.addEventListener("click", () => { editingHousehold = false; renderAccount(); });
  panel.querySelector("#householdEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    await runLockedAction(formElement.querySelector("[type=submit]"), async () => {
      const name = new FormData(formElement).get("household").trim();
      const hhId = memberships[0]?.household_id;
      if (!hhId) return;
      const { error } = await supabase.from("learning_households").update({ name }).eq("id", hhId);
      if (error) { showToast(formatCloudError(error, "修改家庭名称失败，请稍后再试。"), 5000); return; }
      householdName = name; editingHousehold = false; renderAccount();
      showToast("家庭名称已更新");
    }, { busyText: "正在保存…" });
  });
  panel.querySelectorAll("[data-edit-profile]").forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await runLockedAction(form.querySelector("[type=submit]"), async () => {
        const fd = new FormData(form);
        const pid = form.dataset.editProfile;
        const { error } = await supabase.from("learning_profiles").update({
          display_name: fd.get("name").trim(), grade_level: Number(fd.get("grade")),
        }).eq("id", pid);
        if (error) { showToast(formatCloudError(error, "修改学习者信息失败，请稍后再试。"), 5000); return; }
        const p = profiles.find((x) => x.id === pid);
        if (p) { p.display_name = fd.get("name").trim(); p.grade_level = Number(fd.get("grade")); }
        editingProfileId = null;
        if (activeProfile?.id === pid) setAccountState();
        renderAccount();
        showToast("孩子信息已更新");
      }, { busyText: "正在保存…" });
    };
  });
  panel.querySelector("[data-sync]")?.addEventListener("click", async (event) => {
    await runLockedAction(event.currentTarget, async () => {
      await enqueueProfileOperation(async (generation) => {
        const profile = activeProfile;
        if (!profile) return;
        const request = captureSaveRequest(true);
        if (!request) return;
        await saveCloudState(true, request);
        if (!isCurrentProfileOperation(generation) || !isActiveGrowthLoopProfile(profile)) return;
        try {
          await loadGrowthLoopProfile(profile, { generation });
        } catch (growthError) {
          console.warn("Growth Loop cloud data unavailable until release migration:", growthError);
        }
      }, { advanceGeneration: false });
    }, { busyText: "正在同步…" });
  });
  panel.querySelector("[data-export]")?.addEventListener("click", async (event) => {
    await runLockedAction(event.currentTarget, exportWorkspace, { busyText: "正在导出…" });
  });
  panel.querySelector("[data-password-settings]")?.addEventListener("click", async (event) => {
    await runLockedAction(event.currentTarget, async () => {
      const hasPassword = await fetchHasPassword();
      if (hasPassword === null) {
        showToast("暂时无法读取密码状态，请稍后再试。", 5000);
        return;
      }
      renderPasswordEditor({ mode: hasPassword ? "change" : "setup" });
    }, { busyText: "正在检查…" });
  });
  panel.querySelector("[data-signout]")?.addEventListener("click", async (event) => {
    await runLockedAction(event.currentTarget, async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        showToast(formatAuthError(error, "退出登录失败，请稍后再试。"), 5000);
        return;
      }
      sessionStorage.removeItem(passwordPromptStorageKey());
      closeDialog();
      showToast("已退出登录", 4000);
    }, { busyText: "正在退出…" });
  });
  panel.querySelector("[data-clear-local]")?.addEventListener("click", async (event) => {
    const confirmed = window.confirm("将清除此设备上的影伴学习记录并退出登录。云端数据不会删除。是否继续？");
    if (!confirmed) return;
    await runLockedAction(event.currentTarget, () => completeLocalAccountReset("本机数据已清除，已退出登录"), { busyText: "正在清除…" });
  });
  panel.querySelector("[data-delete-household]")?.addEventListener("click", async (event) => {
    const householdId = memberships[0]?.household_id;
    if (!householdId) return;
    const confirmed = window.confirm("将删除整个家庭空间、所有学习者和云端学习记录；此操作不可撤销。是否继续？");
    if (!confirmed) return;
    await runLockedAction(event.currentTarget, async () => {
      const { error } = await supabase.rpc("learning_delete_household", { p_household_id: householdId });
      if (error) {
        showToast(formatCloudError(error, "删除家庭失败，请稍后再试。"), 5000);
        return;
      }
      await completeLocalAccountReset("家庭数据已删除，已退出登录");
    }, { busyText: "正在删除…" });
  });
  panel.querySelector("[data-delete-account]")?.addEventListener("click", async (event) => {
    const confirmed = window.confirm("将注销当前登录账号，并删除 Shadow Mate 家庭数据。此操作不可恢复。是否继续？");
    if (!confirmed) return;
    await runLockedAction(event.currentTarget, async () => {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
      if (error || data?.code || !data?.deleted) {
        showToast(formatCloudError(error || { message: data?.message }, "注销失败，请稍后再试。"), 6000);
        return;
      }
      await completeLocalAccountReset("账号及家庭数据已删除，已退出登录");
    }, { busyText: "正在注销…" });
  });
  panel.querySelector("#addLearnerForm").onsubmit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submitButton = formElement.querySelector("[type=submit]");
    await runLockedAction(submitButton, async () => {
      const form = new FormData(formElement);
      const householdId = memberships[0]?.household_id;
      if (!householdId) return;
      if (!await waitForGuardianConsentMetadata()) {
        showToast("正在确认家长同意状态，请稍后重试。", 5000);
        return;
      }
      if (!guardianConsentHouseholds.has(householdId)) {
        if (form.get("guardianConsent") !== "on") {
          showToast("请先确认你是家长或监护人并阅读隐私说明。", 5000);
          return;
        }
        const { error: consentError } = await supabase
          .from("learning_guardian_consents")
          .insert(guardianConsentPayload(householdId));
        if (consentError) {
          console.error("Guardian consent error:", consentError);
          showToast(formatCloudError(consentError, "保存家长同意失败，请稍后再试。"), 5000);
          return;
        }
        guardianConsentHouseholds.add(householdId);
      }
      const { data, error } = await supabase
        .from("learning_profiles")
        .insert({
          household_id: householdId,
          display_name: form.get("learner").trim(),
          grade_level: Number(form.get("grade")),
        })
        .select()
        .single();
      if (error) {
        showToast(formatCloudError(error, "添加学习者失败，请稍后再试。"), 5000);
        return;
      }
      profiles.push(data);
      const selected = await selectProfile(data.id);
      if (!selected) {
        renderAccount();
        return;
      }
      const selectedGeneration = profileOperationGeneration;
      await queueGrowthCloudActivity(
        data,
        ACTIVITY_EVENT_TYPES.LEARNER_CREATED,
        { source: "add_learner" },
        `learner:${data.id}`,
        { ensureScope: true, generation: selectedGeneration },
      );
      renderAccount();
      showToast("已添加新的学习者");
    }, { busyText: "正在添加…" });
  };
}

function renderPanel() {
  if (!session) renderSignedOut();
  else if (!memberships.length) renderSetup();
  else renderAccount();
}

function refreshWorkspaceMetadata({ householdIds, workspaceProfiles, requestSession }) {
  const stateMetadata = workspaceProfiles.length
    ? supabase
      .from("learning_profile_states")
      .select("profile_id, updated_at")
      .in("profile_id", workspaceProfiles.map((profile) => profile.id))
    : Promise.resolve({ data: [], error: null });
  const consentMetadata = supabase
    .from("learning_guardian_consents")
    .select("household_id")
    .in("household_id", householdIds)
    .eq("user_id", requestSession.user.id)
    .eq("consent_type", GUARDIAN_CONSENT_TYPE)
    .eq("policy_version", PRIVACY_POLICY_VERSION);
  const householdMetadata = supabase.from("learning_households").select("name").in("id", householdIds);

  return Promise.all([consentMetadata, stateMetadata, householdMetadata]).then(([
    { data: consentRows, error: consentError },
    { data: stateRows, error: stateMetaError },
    { data: householdRows },
  ]) => {
    if (!isCurrentWorkspaceMetadata(requestSession, session)) return false;
    if (!consentError) {
      guardianConsentHouseholds = new Set((consentRows || []).map((row) => row.household_id));
      guardianConsentMetadataReady = true;
    }
    if (!stateMetaError) lastSyncAt = latestUpdatedAt(stateRows || []);
    householdName = householdRows?.[0]?.name || "";
    markPerformance("shadow-mate:workspace:metadata-ready");
    if (dialog?.open && !passwordRecoveryActive) renderPanel();
    return !consentError;
  }).catch((error) => {
    if (isCurrentWorkspaceMetadata(requestSession, session)) console.warn("Workspace metadata refresh deferred:", error);
    return false;
  });
}

async function waitForGuardianConsentMetadata() {
  if (guardianConsentMetadataReady) return true;
  await workspaceMetadataLoading;
  return guardianConsentMetadataReady;
}

async function fetchWorkspace() {
  const requestSession = session;
  if (!requestSession) return;
  markPerformance("shadow-mate:workspace:start");
  lastSyncAt = null;
  const { data: memberRows, error: memberError } = await supabase
    .from("learning_household_members")
    .select("household_id, role")
    .eq("user_id", requestSession.user.id);
  if (memberError) throw memberError;
  if (session !== requestSession) return;
  memberships = memberRows || [];
  markPerformance("shadow-mate:workspace:memberships-ready");
  if (!memberships.length) {
    profiles = [];
    guardianConsentHouseholds = new Set();
    guardianConsentMetadataReady = true;
    workspaceMetadataLoading = Promise.resolve(true);
    resetGrowthLoopRemoteRetry();
    activeProfile = null;
    return;
  }
  const householdIds = memberships.map((item) => item.household_id);
  guardianConsentHouseholds = new Set();
  guardianConsentMetadataReady = false;
  const { data: profileRows, error: profileError } = await supabase
    .from("learning_profiles")
    .select("id, household_id, display_name, grade_level")
    .in("household_id", householdIds)
    .order("created_at");
  if (profileError) throw profileError;
  if (session !== requestSession) return;
  profiles = profileRows || [];
  markPerformance("shadow-mate:workspace:profiles-ready");
  workspaceMetadataLoading = refreshWorkspaceMetadata({ householdIds, workspaceProfiles: profiles, requestSession });
}

async function exportWorkspace() {
  if (!memberships.length) {
    showToast("还没有可导出的家庭空间");
    return;
  }
  const householdIds = memberships.map((item) => item.household_id);
  const { data: profileRows, error: profileError } = await supabase
    .from("learning_profiles")
    .select("id, household_id, display_name, grade_level, avatar_key, created_at, updated_at")
    .in("household_id", householdIds)
    .order("created_at");
  if (profileError) {
    showToast(formatCloudError(profileError, "导出家庭数据失败，请稍后再试。"), 5000);
    return;
  }
  const profilesForExport = profileRows || [];
  let stateRows = [];
  if (profilesForExport.length) {
    const { data, error: stateError } = await supabase
      .from("learning_profile_states")
      .select("profile_id, state, version, updated_at")
      .in("profile_id", profilesForExport.map((profile) => profile.id));
    if (stateError) {
      showToast(formatCloudError(stateError, "导出家庭数据失败，请稍后再试。"), 5000);
      return;
    }
    stateRows = data || [];
  }
  const statesByProfile = new Map(stateRows.map((row) => [row.profile_id, row]));
  const consentResult = await supabase
    .from("learning_guardian_consents")
    .select("household_id, consent_type, policy_version, consented_at, created_at")
    .in("household_id", householdIds)
    .eq("user_id", session.user.id);
  const consents = consentResult.error ? [] : (consentResult.data || []);
  const growthResults = await Promise.all(profilesForExport.map(async (profile) => ({
    profile,
    result: await fetchGrowthLoopSnapshot(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
    }),
  })));
  const growthLoop = growthResults.reduce((result, current) => {
    const localSnapshot = current.profile.id === activeProfile?.id && window.growthLoop?.getSnapshot?.();
    const snapshot = localSnapshot
      ? mergeGrowthLoopSnapshot(current.result.snapshot, localSnapshot)
      : current.result.snapshot;
    for (const item of snapshot.point_items) result.pointItems.set(item.id, item);
    for (const reward of snapshot.rewards) result.rewards.set(reward.id, reward);
    for (const binding of snapshot.profile_point_items) result.profilePointItems.set(`${binding.profile_id}:${binding.point_item_id}`, binding);
    for (const binding of snapshot.profile_rewards) result.profileRewards.set(`${binding.profile_id}:${binding.reward_id}`, binding);
    result.ledger.push(...snapshot.ledger);
    result.redemptions.push(...snapshot.redemptions);
    return result;
  }, {
    pointItems: new Map(),
    profilePointItems: new Map(),
    rewards: new Map(),
    profileRewards: new Map(),
    ledger: [],
    redemptions: [],
  });
  growthLoop.pointItems = [...growthLoop.pointItems.values()];
  growthLoop.profilePointItems = [...growthLoop.profilePointItems.values()];
  growthLoop.rewards = [...growthLoop.rewards.values()];
  growthLoop.profileRewards = [...growthLoop.profileRewards.values()];
  const household = {
    id: householdIds[0],
    name: householdName || "家庭",
  };
  const payload = buildHouseholdExport({
    household,
    consents,
    learners: profilesForExport.map((profile) => ({
      ...profile,
      state: statesByProfile.get(profile.id)?.state || {},
      state_version: statesByProfile.get(profile.id)?.version || null,
      state_updated_at: statesByProfile.get(profile.id)?.updated_at || null,
    })),
    growthLoop,
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shadow-mate-family-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("家庭数据已导出");
}

async function loadWorkspace(preferredProfileId = null, options = {}) {
  await fetchWorkspace();
  if (!memberships.length) {
    renderPanel();
    return false;
  }
  const remembered = preferredProfileId || readRememberedProfileId();
  if (remembered && !profiles.some((item) => item.id === remembered)) {
    // 残留引用指向已不存在的 profile（如云端删除 / household 残留）→ 清除，
    // 避免后续对不存在的 profile 发起无效同步（曾在生产触发 not_found 冲突风暴）。
    if (!profileScopeWriteBlocked) localStorage.removeItem(ACTIVE_PROFILE_KEY);
  }
  const profile = profiles.find((item) => item.id === remembered) || profiles[0] || null;
  return profile ? selectProfile(profile.id, options) : false;
}

function selectProfile(profileId, options = {}) {
  return enqueueProfileOperation((generation) => selectProfileNow(profileId, options, generation));
}

async function selectProfileNow(profileId, { migrateLocal = false } = {}, generation) {
  const isCurrent = () => isCurrentProfileOperation(generation);
  if (profileScopeWriteBlocked) return false;
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return false;
  const scope = { household_id: profile.household_id, profile_id: profile.id };
  const profileChanged = activeProfile?.id !== profile.id
    || activeProfile?.household_id !== profile.household_id;
  const previousProfileState = captureProfileCommitState();

  // The Growth Loop controller commits its scope only after the local database
  // load succeeds. Make it the profile-switch commit barrier so a failed
  // IndexedDB reopen cannot leave the UI on a new learner and Growth Loop on
  // the old scope.
  try {
    let growthScope;
    // A superseded local read can return the previous snapshot without throwing;
    // retry once while this profile operation is still current.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await window.growthLoop?.loadScope?.(scope, { adoptPending: migrateLocal, canCommit: isCurrent });
      if (!isCurrent()) {
        await restoreProfileCommit(previousProfileState, profile);
        return false;
      }
      growthScope = window.growthLoop?.getScope?.();
      if (sameProfileScope(growthScope, scope)) break;
      if (attempt === 1) throw new Error("growth_loop_scope_not_ready");
    }
  } catch (growthError) {
    console.warn("Growth Loop profile switch blocked:", growthError);
    const restored = await restoreProfileCommit(previousProfileState, profile);
    if (!restored) return false;
    if (!isCurrent()) return false;
    showToast("孩子切换未完成，本机成长记录暂时不可用；当前孩子未变，请重试。", 6000);
    return false;
  }

  try {
    await window.learningDesk.setScope(scope, { adoptPending: migrateLocal, canCommit: isCurrent });
    if (!isCurrent()) {
      await restoreProfileCommit(previousProfileState, profile);
      return false;
    }
  } catch (scopeError) {
    console.warn("Learning profile switch rolled back:", scopeError);
    const restored = await restoreProfileCommit(previousProfileState, profile);
    if (!restored) return false;
    if (!isCurrent()) return false;
    showToast("孩子切换未完成，本机学习记录暂时不可用；当前孩子未变，请重试。", 6000);
    return false;
  }

  if (!isCurrent()) {
    await restoreProfileCommit(previousProfileState, profile);
    return false;
  }
  if (profileChanged) resetGrowthLoopRemoteRetry();
  activeProfile = profile;
  cloudVersion = null;
  cloudSyncBlocked = false;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  setAccountState();
  markPerformance("shadow-mate:profile:local-ready");
  void queueGrowthCloudActivity(
    profile,
    ACTIVITY_EVENT_TYPES.HOUSEHOLD_ACTIVATED,
    {},
    "once",
    { generation },
  );
  void loadGrowthLoopProfile(profile, { adoptPending: migrateLocal, generation }).catch((growthError) => {
    console.warn("Growth Loop cloud data unavailable until release migration:", growthError);
  });
  const hydrateOperation = { profileId: profile.id, generation };
  remoteHydratePending = hydrateOperation;
  void hydrateProfileRemote(profile, { migrateLocal, generation }).finally(() => {
    if (remoteHydratePending === hydrateOperation) remoteHydratePending = null;
  });
  return isCurrent() && activeProfile?.id === profile.id;
}

async function hydrateProfileRemote(profile, { migrateLocal = false, generation = null } = {}) {
  const scope = { household_id: profile.household_id, profile_id: profile.id };
  const isCurrent = () => isCurrentProfileOperation(generation)
    && isActiveProfile(profile)
    && sameProfileScope(window.learningDesk?.getEnvelope?.()?.scope || {}, scope);
  if (!isCurrent()) return;
  markPerformance("shadow-mate:profile:remote-hydrate-start");
  try {
    const { data, error } = await supabase
      .from("learning_profile_states")
      .select("state, version, updated_at")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!isCurrent()) return;
    if (error) {
      markPerformance("shadow-mate:profile:remote-hydrate-failed");
      showToast(formatCloudError(error, "读取云端记录失败，本机学习记录可继续使用。"), 5000);
      return;
    }
    const normalizedRemote = data ? normalizeCloudLearningState(data, scope) : null;
    if (normalizedRemote?.scope_mismatch) {
      markPerformance("shadow-mate:profile:remote-hydrate-failed");
      failClosedProfileScope();
      return;
    }
    const localState = window.learningDesk.getState();
    if (!data) {
      cloudVersion = null;
      if (migrateLocal || stateHasData(localState)) {
        await saveCloudState(true, { generation, profileId: profile.id, allowPendingRemoteHydrate: true });
        if (!isCurrent()) return;
      }
    } else {
      lastSyncAt = latestUpdatedAt([{ updated_at: data.updated_at }, { updated_at: lastSyncAt }]);
      cloudVersion = normalizedRemote.version;
      const remoteLearningState = normalizedRemote.state.learning;
      const merged = stateHasData(localState) ? mergeState(localState, remoteLearningState) : remoteLearningState;
      window.learningDesk.replaceState(merged, { persist: true });
      if (JSON.stringify(merged) !== JSON.stringify(remoteLearningState)) {
        await saveCloudState(true, { generation, profileId: profile.id, allowPendingRemoteHydrate: true });
        if (!isCurrent()) return;
      }
    }
    markPerformance("shadow-mate:profile:remote-hydrate-ready");
  } catch (error) {
    if (!isCurrent()) return;
    markPerformance("shadow-mate:profile:remote-hydrate-failed");
    console.warn("Profile remote hydrate unavailable:", error);
  }
}

function captureSaveRequest(manual = false) {
  if (profileScopeWriteBlocked || !session || !activeProfile) return null;
  return {
    profileId: activeProfile.id,
    generation: profileOperationGeneration,
    manual: Boolean(manual),
    requestSession: session,
    state: window.learningDesk.getEnvelope(),
    expectedVersion: cloudVersion,
    fromDebounce: true,
  };
}

async function saveCloudState(manual = false, {
  generation = null,
  profileId = null,
  requestSession = null,
  state = null,
  expectedVersion = undefined,
  fromDebounce = false,
  allowPendingRemoteHydrate = false,
} = {}) {
  if (profileScopeWriteBlocked) return;
  const requestedProfileId = profileId ?? activeProfile?.id ?? null;
  const requestedGeneration = generation ?? profileOperationGeneration;
  const saveSession = requestSession ?? session;
  const requestedState = state ? structuredClone(state) : null;
  const requestedVersion = expectedVersion === undefined ? cloudVersion : expectedVersion;
  if (requestSession && session !== requestSession) return;
  if (!allowPendingRemoteHydrate
    && remoteHydratePending?.generation === requestedGeneration
    && remoteHydratePending?.profileId === requestedProfileId) {
    if (manual) showToast("正在读取云端记录，请稍后再试。", 3000);
    return;
  }
  if (saveInFlight) {
    if (session && saveSession === session && requestedProfileId) {
      const queuedRequest = {
        profileId: requestedProfileId,
        generation: requestedGeneration,
        manual: Boolean(manual),
        requestSession: saveSession,
        state: requestedState,
        expectedVersion: requestedVersion,
        fromDebounce: Boolean(fromDebounce),
      };
      saveQueued = {
        ...queuedRequest,
        manual: queuedRequest.manual || (
          saveQueued?.profileId === queuedRequest.profileId
          && saveQueued?.generation === queuedRequest.generation
          && saveQueued.manual
        ),
      };
    }
    return;
  }
  if (!session || !saveSession || session !== saveSession || !requestedProfileId) return;
  const saveProfile = profiles.find((profile) => profile.id === requestedProfileId)
    || (activeProfile?.id === requestedProfileId ? activeProfile : null);
  if (!saveProfile) return;
  const requestScope = requestedState?.scope;
  if (requestScope?.profile_id && !sameProfileScope(requestScope, {
    household_id: saveProfile.household_id,
    profile_id: saveProfile.id,
  })) return;
  const saveGeneration = requestedGeneration;
  const canWrite = () => !profileScopeWriteBlocked
    && session === saveSession
    && (fromDebounce || (
      isCurrentProfileOperation(saveGeneration)
      && activeProfile?.id === saveProfile.id
      && requestedProfileId === saveProfile.id
    ));
  const canApplyActiveState = () => !profileScopeWriteBlocked
    && session === saveSession
    && isCurrentProfileOperation(saveGeneration)
    && activeProfile?.id === saveProfile.id;
  if (!canWrite()) return;
  if (cloudSyncBlocked && !manual) return;
  if (manual) cloudSyncBlocked = false;
  saveInFlight = true;
  let conflictRetries = 0;
  let requestState = requestedState || window.learningDesk.getEnvelope();
  let requestVersion = requestedVersion;
  try {
    while (true) {
      if (!canWrite()) break;
      const { data, error } = await supabase.rpc("learning_save_state", {
        p_profile_id: saveProfile.id,
        ...buildCloudSavePayload(requestState, requestVersion),
      });
      if (!canWrite()) break;
      if (error) {
        if (error.message.includes("learning_rate_limited")) {
          showToast("操作过于频繁，请稍后再试。", 5000);
          break;
        }
        if (!error.message.includes("learning_state_conflict")) {
          showToast(formatCloudError(error, "云端同步失败，请稍后再试。"), 5000);
          break;
        }
        // 旧服务端兼容：learning_state_conflict 错误 → 走下方统一冲突处理。
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          if (canApplyActiveState()) {
            cloudVersion = row?.version ?? cloudVersion;
            lastSyncAt = latestUpdatedAt([{ updated_at: row?.updated_at }, { updated_at: lastSyncAt }]);
            updateSyncStatus();
          }
          if (manual) showToast("云端记录已更新");
          break;
        }
        // 空集 = 版本冲突（服务端不再 raise，避免事务回滚绕过限流）→ 走下方统一冲突处理。
      }

      if (conflictRetries >= MAX_CONFLICT_RETRIES) {
        if (canApplyActiveState()) cloudSyncBlocked = true;
        showToast("云端记录冲突次数过多，自动同步已暂停，点击同步按钮重试。", 6000);
        break;
      }

      const { data: remote, error: remoteError } = await supabase
        .from("learning_profile_states")
        .select("state, version")
        .eq("profile_id", saveProfile.id)
        .single();
      if (!canWrite()) break;
      if (remoteError || !remote) {
        if (remoteError?.code === "PGRST116" || (!remoteError && !remote)) {
          // 目标 profile 在云端已不存在 → 熔断自动同步，避免每次编辑都触发一次无效冲突往返
          if (canApplyActiveState()) {
            resetGrowthLoopRemoteRetry();
            activeProfile = null;
            cloudSyncBlocked = true;
            localStorage.removeItem(ACTIVE_PROFILE_KEY);
          }
          showToast("云端记录已不存在，已停止自动同步。", 6000);
        } else {
          showToast(formatCloudError(remoteError, "读取最新云端记录失败，请稍后再试。"), 5000);
        }
        break;
      }

      if (!canWrite()) break;
      requestVersion = remote.version;
      requestState = mergeState(requestState, remote.state);
      if (canApplyActiveState()) {
        cloudVersion = remote.version;
        window.learningDesk.replaceState(requestState, { persist: true });
      }
      conflictRetries += 1;
      await new Promise((resolve) => window.setTimeout(resolve, CONFLICT_RETRY_DELAY_MS * conflictRetries));
    }
  } finally {
    saveInFlight = false;
  }

  const queuedAfterSave = saveQueued;
  saveQueued = null;
  if (queuedAfterSave) {
    await saveCloudState(queuedAfterSave.manual, queuedAfterSave);
  }
}

function scheduleSave(manual = false) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (manual && !profileScopeWriteBlocked) cloudSyncBlocked = false;
  const request = captureSaveRequest(manual);
  if (!cloudSyncBlocked && request) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveCloudState(request.manual, request);
    }, 500);
  }
  scheduleGrowthLoopSync();
}

window.cloudSync = {
  schedule: scheduleSave,
  scheduleGrowthLoop: scheduleGrowthLoopSync,
  isProfileScopeWriteBlocked: () => profileScopeWriteBlocked,
  canWriteLocalState: () => !profileScopeWriteBlocked
    && !profileScopeResetInProgress
    && (!session || Boolean(activeProfile)),
  canWriteScopeTransition: () => !profileScopeWriteBlocked,
  getProfileCommitState: () => ({
    active_profile_id: activeProfile?.id || null,
    active_profile_key: localStorage.getItem(ACTIVE_PROFILE_KEY),
    cloud_version: cloudVersion,
  }),
};
window.addEventListener("online", () => {
  if (activeProfile && !profileScopeWriteBlocked) growthLoopRetryScheduler.scheduleNow();
});

async function maybePromptPasswordSetup(options = {}) {
  if (!session || passwordRecoveryActive) return false;
  const sessionKey = session.access_token || session.user.id;
  if (!options.force && passwordStatusCheckedForSession === sessionKey) return false;
  passwordStatusCheckedForSession = sessionKey;
  if (!options.force && sessionStorage.getItem(passwordPromptStorageKey()) === "1") return false;
  const hasPassword = await fetchHasPassword();
  if (hasPassword !== false) return false;
  renderPasswordEditor({ mode: "setup" });
  if (!dialog.open) dialog.showModal();
  showToast("建议为共享账号设置密码，也可以稍后处理。", 5000);
  return true;
}

async function onAuthChange(nextSession, event = "") {
  if (nextSession && localResetInProgress) return;
  const authSessionKey = nextSession?.access_token || null;
  if (authSessionKey === lastAuthSessionKey && event !== "PASSWORD_RECOVERY") return;
  lastAuthSessionKey = authSessionKey;
  if (event === "PASSWORD_RECOVERY") passwordRecoveryActive = true;
  const changeVersion = ++authChangeVersion;
  profileScopeResetInProgress = false;
  advanceProfileOperationGeneration();
  resetGrowthLoopRemoteRetry();
  const existingScopeBlock = profileScopeWriteBlocked || readProfileScopeBlock();
  session = nextSession;
  memberships = [];
  profiles = [];
  guardianConsentHouseholds = new Set();
  guardianConsentMetadataReady = false;
  workspaceMetadataLoading = Promise.resolve(false);
  remoteHydratePending = null;
  activeProfile = null;
  cloudVersion = null;
  lastSyncAt = null;
  cloudSyncBlocked = false;
  profileScopeWriteBlocked = existingScopeBlock;
  if (profileScopeWriteBlocked) localStorage.setItem(PROFILE_SCOPE_BLOCKED_KEY, "1");
  if (!session) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveQueued = null;
    try {
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    } catch (error) {
      console.warn("Unable to remove the active profile key after sign-out:", error);
      failClosedProfileScope();
      return;
    }
    passwordRecoveryActive = false;
    passwordStatusCheckedForSession = null;
    if (!existingScopeBlock) {
      profileScopeResetInProgress = true;
      await resetSignedOutProfileScope(changeVersion);
      if (changeVersion === authChangeVersion) profileScopeResetInProgress = false;
    }
  }
  if (changeVersion !== authChangeVersion) return;
  setAccountState();
  let passwordUiOpened = false;
  if (session) {
    workspaceLoading = loadWorkspace();
    try {
      const selected = await workspaceLoading;
      if (selected && changeVersion === authChangeVersion && session === nextSession && !localResetInProgress) {
        showToast("已连接云端学习空间");
      }
    } catch (error) {
      if (changeVersion === authChangeVersion && session === nextSession && !localResetInProgress) {
        showToast(formatCloudError(error, "登录成功，但读取学习空间失败，请稍后再试。"), 5000);
      }
    } finally {
      if (changeVersion === authChangeVersion) workspaceLoading = null;
    }
    if (changeVersion === authChangeVersion && session === nextSession && !localResetInProgress) {
      if (passwordRecoveryActive) {
        renderPasswordEditor({ mode: "recovery" });
        if (!dialog.open) dialog.showModal();
        passwordUiOpened = true;
      } else if (memberships.length > 0) {
        passwordUiOpened = await maybePromptPasswordSetup();
      } else {
        if (!dialog.open) dialog.showModal();
      }
    }
  }
  if (!passwordUiOpened && dialog.open && (changeVersion === authChangeVersion || !session)) renderPanel();
}

accountButton?.addEventListener("click", openDialog);
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});
dialog?.addEventListener("close", hideToast);

if (cloudEnabled) {
  // Register onAuthStateChange BEFORE getSession to avoid missing the
  // INITIAL_SESSION event when the client detects a magic-link session from URL.
  supabase.auth.onAuthStateChange((event, nextSession) => {
    queueMicrotask(() => onAuthChange(nextSession, event));
  });
  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();
  if (initialSession) {
    await onAuthChange(initialSession);
  } else {
    setAccountState();
  }
  await consumeAuthTokenHash();
} else {
  setAccountState();
}

// Service workers require a secure context. Browsers treat localhost as secure
// even over HTTP, so isSecureContext supports both local verification and HTTPS
// production without maintaining a hostname allowlist.
if ("serviceWorker" in navigator && window.isSecureContext) {
  const registerServiceWorker = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      showToast("离线缓存初始化失败，不影响在线使用");
    });
  };

  // Top-level Auth awaits may finish after the window load event. Register
  // immediately in that case instead of attaching a listener that can never run.
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker, { once: true });
}
