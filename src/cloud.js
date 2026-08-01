import { createClient } from "@supabase/supabase-js";
import { CLOUD_CONFIG } from "./config.js";
import { escapeHtml, stateHasData, mergeObjects, mergeState, latestUpdatedAt, GRADE_OPTIONS, gradeLabel, gradeOptionsSelected } from "./lib.js";

const PRODUCT_ID = CLOUD_CONFIG.productId;
const ACTIVE_PROFILE_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_active_profile`;
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

let session = null;
let memberships = [];
let profiles = [];
let activeProfile = null;
let editingProfileId = null;
let editingHousehold = false;
let householdName = "";
let cloudVersion = null;
let saveTimer = null;
let saveInFlight = false;
let saveQueued = false;
let toastTimer = null;
let lastSyncAt = null;

const accountButton = document.querySelector("#accountButton");
const dialog = document.querySelector("#cloudDialog");
const panel = document.querySelector("#cloudPanel");
const toast = document.querySelector("#syncToast");

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

async function clearLocalAccountState() {
  await supabase.auth.signOut({ scope: "local" });
  if (AUTH_STORAGE_KEY) sessionStorage.clear();
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
  window.learningDesk.clearLocalData();
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
    accountButton.textContent = "☁";
    accountButton.title = `${activeProfile.display_name} · 云端已连接`;
    if (subEl) subEl.textContent = `👦 ${activeProfile.display_name} · ${gradeLabel(activeProfile.grade_level)}`;
  } else if (session) {
    accountButton.dataset.state = "online";
    accountButton.textContent = "👤";
    accountButton.title = "已登录，待选择学习者";
    if (subEl) subEl.textContent = "已登录 · 点击右上角选择孩子";
  } else {
    accountButton.dataset.state = "local";
    accountButton.textContent = "登录";
    accountButton.title = "点击登录，开启云端跨设备同步";
    if (subEl) subEl.textContent = "绿色挖掘机 · 每日成长打卡";
  }
}

function openDialog() {
  renderPanel();
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  if (dialog.open) dialog.close();
  hideToast();
}

function renderSignedOut() {
  panel.innerHTML = `
    <h2>☁️ 跨设备同步</h2>
    <p>平时可以继续离线使用。家长用邮箱登录后，学习记录会同步到云端，孩子不需要单独注册邮箱。登录后可以添加多个孩子并随时切换。</p>
    <form id="emailLoginForm">
      <label class="cloud-field">
        家长邮箱
        <input type="email" name="email" autocomplete="email" required placeholder="parent@example.com">
      </label>
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">发送登录链接</button>
        <button class="cloud-action secondary" type="button" data-close>继续本机使用</button>
        <button class="cloud-action danger" type="button" data-clear-local>清除本机数据</button>
      </div>
    </form>
    <p class="cloud-hint">💡 输入邮箱后，我们会发送一个登录链接到你的邮箱，在同一设备打开即可登录，无需密码。</p>
    ${
      cloudEnabled
        ? ""
        : '<div class="cloud-status">⚠️ 尚未配置云端环境，当前只能使用本机模式。</div>'
    }
  `;
  restoreToastLocation();

  panel.querySelector("[data-close]").onclick = closeDialog;
  panel.querySelector("[data-clear-local]").onclick = () => {
    const confirmed = window.confirm("将清除此设备上的影伴学习记录。此操作不可撤销，是否继续？");
    if (!confirmed) return;
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    window.learningDesk.clearLocalData();
  };
  panel.querySelector("#emailLoginForm").onsubmit = async (event) => {
    event.preventDefault();
    if (!cloudEnabled) {
      showToast("请先配置云端环境");
      return;
    }
    const email = new FormData(event.currentTarget).get("email").trim();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
        data: { product_name: "影伴 Shadow Mate" },
      },
    });
    if (error) {
      showToast(`发送失败：${error.message}`, 5000);
      return;
    }
    panel.innerHTML = `
      <h2>📨 请查收邮件</h2>
      <p>登录链接已发送到 <b>${escapeHtml(email)}</b>。在这台设备上打开邮件里的链接即可完成登录。</p>
      <div class="cloud-actions">
        <button class="cloud-action secondary" type="button" data-close>知道了</button>
      </div>
    `;
    panel.querySelector("[data-close]").onclick = closeDialog;
  };
}

function renderSetup() {
  panel.innerHTML = `
    <h2>建立家庭学习空间</h2>
    <p>学习者是家庭内的独立档案，不是登录账号。只保存显示名称和年级，不要求孩子提供邮箱或生日。</p>
    <form id="householdSetupForm">
      <label class="cloud-field">
        家庭空间名称
        <input name="household" maxlength="40" required placeholder="我的家庭">
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
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">创建并同步</button>
        <button class="cloud-action secondary" type="button" data-close>稍后设置</button>
      </div>
    </form>
  `;
  restoreToastLocation();
  panel.querySelector("[data-close]").onclick = closeDialog;
  panel.querySelector("#householdSetupForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
      showToast(`创建家庭失败：${householdError.message}`, 5000);
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
      showToast(`创建成员失败：${memberError.message}`, 5000);
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
      showToast(`创建学习者失败：${profileError.message}`, 5000);
      return;
    }
    await loadWorkspace(profileId, { migrateLocal: true });
    renderPanel();
    closeDialog();
    showToast("家庭学习空间已建立，正在同步本机记录");
  };
}

function renderAccount() {
  const choices = profiles
    .map((profile) => {
      if (editingProfileId === profile.id) {
        return `<div class="learner-choice active">
          <form class="learner-edit-form" data-edit-profile="${profile.id}">
            <input name="name" value="${escapeHtml(profile.display_name)}" maxlength="30" required class="peanut-input" placeholder="昵称">
            <select name="grade" class="peanut-input learner-edit-grade">${gradeOptionsSelected(profile.grade_level)}</select>
            <div class="cloud-actions">
              <button class="cloud-action" type="submit">保存</button>
              <button class="cloud-action secondary" type="button" data-cancel-edit>取消</button>
            </div>
          </form>
        </div>`;
      }
      return `<div class="learner-choice-row">
        <button class="learner-choice ${profile.id === activeProfile?.id ? "active" : ""}" type="button" data-profile="${profile.id}">
          <span>${profile.id === activeProfile?.id ? "✅" : "👦"}</span>
          <span><strong>${escapeHtml(profile.display_name)}</strong><small>${gradeLabel(profile.grade_level)}</small></span>
          <span class="learner-edit-btn" data-edit="${profile.id}" title="编辑">✏️</span>
        </button>
        <button class="cloud-action danger learner-delete" type="button" data-delete-profile="${profile.id}">删除学习者</button>
      </div>`;
    })
    .join("");
  const hhDisplay = editingHousehold
    ? `<form id="householdEditForm" class="cloud-field">家庭空间名称<input name="household" value="${escapeHtml(householdName)}" maxlength="40" required class="peanut-input household-edit-input"><div class="cloud-actions"><button class="cloud-action" type="submit">保存</button><button class="cloud-action secondary" type="button" data-cancel-hh>取消</button></div></form>`
    : `<p>${escapeHtml(session.user.email || "已登录")} · ${escapeHtml(householdName || "家庭")} · 数据按家庭隔离 <span class="learner-edit-btn" data-edit-household title="编辑家庭名称">✏️</span></p>`;
  panel.innerHTML = `
    <h2>家庭学习空间</h2>
    ${hhDisplay}
    <div class="cloud-status">☁️ ${
      activeProfile ? `${escapeHtml(activeProfile.display_name)} 的记录已连接云端` : "请选择学习者"
    }</div>
    <div class="cloud-sync-meta" data-last-sync>家庭空间最近同步：${formatSyncTime(lastSyncAt)}</div>
    <p class="cloud-sync-copy">家庭空间统一管理，学习记录按孩子分别同步。切换孩子后会加载对应的学习记录。</p>
    <div class="learner-list">${choices}</div>
    <form id="addLearnerForm">
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
        <button class="cloud-action danger" type="button" data-signout>退出登录</button>
        <button class="cloud-action danger" type="button" data-clear-local>清除本机数据</button>
        <button class="cloud-action danger" type="button" data-delete-household>删除全部家庭数据</button>
        ${CLOUD_CONFIG.authAccountDeletionEnabled ? '<button class="cloud-action danger" type="button" data-delete-account>注销账号并删除全部数据</button>' : ""}
      </div>
    </form>
  `;
  restoreToastLocation();
  panel.querySelectorAll("[data-profile]").forEach((button) => {
    button.onclick = async () => {
      await selectProfile(button.dataset.profile);
      renderAccount();
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
      const { error } = await supabase.from("learning_profiles").delete().eq("id", profile.id);
      if (error) {
        showToast(`删除失败：${error.message}`, 5000);
        return;
      }
      const deletingActive = activeProfile?.id === profile.id;
      profiles = profiles.filter((item) => item.id !== profile.id);
      if (deletingActive) {
        activeProfile = null;
        cloudVersion = null;
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
        window.learningDesk.replaceState({}, { persist: true });
      }
      await loadWorkspace();
      renderAccount();
      showToast("学习者及其学习记录已删除");
    };
  });
  panel.querySelector("[data-edit-household]")?.addEventListener("click", () => { editingHousehold = true; renderAccount(); });
  panel.querySelector("[data-cancel-edit]")?.addEventListener("click", () => { editingProfileId = null; renderAccount(); });
  panel.querySelector("[data-cancel-hh]")?.addEventListener("click", () => { editingHousehold = false; renderAccount(); });
  panel.querySelector("#householdEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("household").trim();
    const hhId = memberships[0]?.household_id;
    if (!hhId) return;
    const { error } = await supabase.from("learning_households").update({ name }).eq("id", hhId);
    if (error) { showToast(`修改失败：${error.message}`, 5000); return; }
    householdName = name; editingHousehold = false; renderAccount();
    showToast("家庭名称已更新");
  });
  panel.querySelectorAll("[data-edit-profile]").forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const pid = form.dataset.editProfile;
      const { error } = await supabase.from("learning_profiles").update({
        display_name: fd.get("name").trim(), grade_level: Number(fd.get("grade")),
      }).eq("id", pid);
      if (error) { showToast(`修改失败：${error.message}`, 5000); return; }
      const p = profiles.find((x) => x.id === pid);
      if (p) { p.display_name = fd.get("name").trim(); p.grade_level = Number(fd.get("grade")); }
      editingProfileId = null;
      if (activeProfile?.id === pid) setAccountState();
      renderAccount();
      showToast("孩子信息已更新");
    };
  });
  panel.querySelector("[data-sync]")?.addEventListener("click", async () => { await saveCloudState(true); });
  panel.querySelector("[data-export]")?.addEventListener("click", async () => { await exportWorkspace(); });
  panel.querySelector("[data-signout]")?.addEventListener("click", async () => { await supabase.auth.signOut(); closeDialog(); });
  panel.querySelector("[data-clear-local]")?.addEventListener("click", async () => {
    const confirmed = window.confirm("将清除此设备上的影伴学习记录并退出登录。云端数据不会删除。是否继续？");
    if (!confirmed) return;
    await clearLocalAccountState();
  });
  panel.querySelector("[data-delete-household]")?.addEventListener("click", async () => {
    const householdId = memberships[0]?.household_id;
    if (!householdId) return;
    const confirmed = window.confirm("将删除整个家庭空间、所有学习者和云端学习记录；此操作不可撤销。是否继续？");
    if (!confirmed) return;
    const { error } = await supabase.rpc("learning_delete_household", { p_household_id: householdId });
    if (error) {
      showToast(`删除家庭失败：${error.message}`, 5000);
      return;
    }
    await clearLocalAccountState();
  });
  panel.querySelector("[data-delete-account]")?.addEventListener("click", async () => {
    const confirmed = window.confirm("将注销当前登录账号，并删除 Shadow Mate 家庭数据。此操作不可恢复。是否继续？");
    if (!confirmed) return;
    const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
    if (error || data?.code || !data?.deleted) {
      showToast(`注销失败：${data?.message || error?.message || "服务端未完成注销"}`, 6000);
      return;
    }
    await clearLocalAccountState();
  });
  panel.querySelector("#addLearnerForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const householdId = memberships[0]?.household_id;
    if (!householdId) return;
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
      showToast(`添加失败：${error.message}`, 5000);
      return;
    }
    profiles.push(data);
    await selectProfile(data.id);
    renderAccount();
    showToast("已添加新的学习者");
  };
}

function renderPanel() {
  if (!session) renderSignedOut();
  else if (!memberships.length) renderSetup();
  else renderAccount();
}

async function fetchWorkspace() {
  lastSyncAt = null;
  const { data: memberRows, error: memberError } = await supabase
    .from("learning_household_members")
    .select("household_id, role")
    .eq("user_id", session.user.id);
  if (memberError) throw memberError;
  memberships = memberRows || [];
  if (!memberships.length) {
    profiles = [];
    activeProfile = null;
    return;
  }
  const householdIds = memberships.map((item) => item.household_id);
  const { data: profileRows, error: profileError } = await supabase
    .from("learning_profiles")
    .select("id, household_id, display_name, grade_level")
    .in("household_id", householdIds)
    .order("created_at");
  if (profileError) throw profileError;
  profiles = profileRows || [];
  if (profiles.length) {
    const { data: stateRows, error: stateMetaError } = await supabase
      .from("learning_profile_states")
      .select("profile_id, updated_at")
      .in("profile_id", profiles.map((profile) => profile.id));
    if (!stateMetaError) lastSyncAt = latestUpdatedAt(stateRows || []);
  }
  if (householdIds.length) {
    const { data: hhRows } = await supabase.from("learning_households").select("name").in("id", householdIds);
    householdName = hhRows?.[0]?.name || "";
  }
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
    showToast(`导出失败：${profileError.message}`, 5000);
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
      showToast(`导出失败：${stateError.message}`, 5000);
      return;
    }
    stateRows = data || [];
  }
  const statesByProfile = new Map(stateRows.map((row) => [row.profile_id, row]));
  const household = {
    id: householdIds[0],
    name: householdName || "家庭",
  };
  const payload = {
    schema_version: 1,
    product_id: PRODUCT_ID,
    exported_at: new Date().toISOString(),
    household,
    learners: profilesForExport.map((profile) => ({
      ...profile,
      state: statesByProfile.get(profile.id)?.state || {},
      state_version: statesByProfile.get(profile.id)?.version || null,
      state_updated_at: statesByProfile.get(profile.id)?.updated_at || null,
    })),
  };
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
    return;
  }
  const remembered = preferredProfileId || readRememberedProfileId();
  const profile = profiles.find((item) => item.id === remembered) || profiles[0] || null;
  if (profile) await selectProfile(profile.id, options);
}

async function selectProfile(profileId, { migrateLocal = false } = {}) {
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return;
  activeProfile = profile;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  const localState = window.learningDesk.getState();
  const { data, error } = await supabase
    .from("learning_profile_states")
    .select("state, version, updated_at")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (error) {
    showToast(`读取云端失败：${error.message}`, 5000);
    return;
  }
  if (!data) {
    cloudVersion = null;
    if (migrateLocal || stateHasData(localState)) {
      await saveCloudState(true);
    }
  } else {
    lastSyncAt = latestUpdatedAt([{ updated_at: data.updated_at }, { updated_at: lastSyncAt }]);
    cloudVersion = data.version;
    const merged = stateHasData(localState) ? mergeState(localState, data.state) : data.state;
    window.learningDesk.replaceState(merged, { persist: true });
    if (JSON.stringify(merged) !== JSON.stringify(data.state)) {
      await saveCloudState(true);
    }
  }
  setAccountState();
}

async function saveCloudState(manual = false) {
  if (!session || !activeProfile || saveInFlight) {
    if (saveInFlight) saveQueued = true;
    return;
  }
  saveInFlight = true;
  const currentState = window.learningDesk.getState();
  const { data, error } = await supabase.rpc("learning_save_state", {
    p_profile_id: activeProfile.id,
    p_state: currentState,
    p_expected_version: cloudVersion,
  });
  saveInFlight = false;
  if (error) {
    if (error.message.includes("learning_state_conflict")) {
      const { data: remote } = await supabase
        .from("learning_profile_states")
        .select("state, version")
        .eq("profile_id", activeProfile.id)
        .single();
      if (remote) {
        cloudVersion = remote.version;
        window.learningDesk.replaceState(mergeState(currentState, remote.state), { persist: true });
        saveQueued = true;
      }
    } else {
      showToast(`云端同步失败：${error.message}`, 5000);
    }
  } else {
    const row = Array.isArray(data) ? data[0] : data;
    cloudVersion = row?.version ?? cloudVersion;
    lastSyncAt = latestUpdatedAt([{ updated_at: row?.updated_at }, { updated_at: lastSyncAt }]);
    updateSyncStatus();
    if (manual) showToast("云端记录已更新");
  }
  if (saveQueued) {
    saveQueued = false;
    await saveCloudState(false);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCloudState(false), 500);
}

window.cloudSync = { schedule: scheduleSave };

async function onAuthChange(nextSession) {
  session = nextSession;
  memberships = [];
  profiles = [];
  activeProfile = null;
  cloudVersion = null;
  lastSyncAt = null;
  setAccountState();
  if (session) {
    try {
      await loadWorkspace();
      showToast("已连接云端学习空间");
    } catch (error) {
      showToast(`登录成功，但读取学习空间失败：${error.message}`, 5000);
    }
  }
  if (dialog.open) renderPanel();
}

accountButton?.addEventListener("click", openDialog);
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});
dialog?.addEventListener("close", hideToast);

if (cloudEnabled) {
  // Register onAuthStateChange BEFORE getSession to avoid missing the
  // INITIAL_SESSION event when the client detects a magic-link session from URL.
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    queueMicrotask(() => onAuthChange(nextSession));
  });
  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();
  if (initialSession) {
    await onAuthChange(initialSession);
  } else {
    setAccountState();
  }
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
