import { createClient } from "@supabase/supabase-js";
import { CLOUD_CONFIG } from "./config.js";
import { escapeHtml, stateHasData, mergeObjects, mergeState } from "./lib.js";

const PRODUCT_ID = CLOUD_CONFIG.productId;
const ACTIVE_PROFILE_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_active_profile`;
const supabaseUrl = CLOUD_CONFIG.supabaseUrl;
const publishableKey = CLOUD_CONFIG.supabasePublishableKey;
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
let cloudVersion = null;
let saveTimer = null;
let saveInFlight = false;
let saveQueued = false;
let toastTimer = null;

const accountButton = document.querySelector("#accountButton");
const dialog = document.querySelector("#cloudDialog");
const panel = document.querySelector("#cloudPanel");
const toast = document.querySelector("#syncToast");

function showToast(message, duration = 2800) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// escapeHtml imported from lib.js
function readRememberedProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

// stateHasData, mergeObjects, mergeState imported from lib.js

function setAccountState() {
  if (!accountButton) return;
  if (session && activeProfile) {
    accountButton.dataset.state = "online";
    accountButton.textContent = "☁";
    accountButton.title = `${activeProfile.display_name} · 云端已连接`;
  } else if (session) {
    accountButton.dataset.state = "online";
    accountButton.textContent = "👤";
    accountButton.title = "已登录，待选择学习者";
  } else {
    accountButton.dataset.state = "local";
    accountButton.textContent = "登录";
    accountButton.title = "点击登录，开启云端跨设备同步";
  }
}

function openDialog() {
  renderPanel();
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  if (dialog.open) dialog.close();
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
          <option value="1">一年级</option>
          <option value="2">二年级</option>
          <option value="3">三年级</option>
          <option value="4">四年级</option>
          <option value="5">五年级</option>
          <option value="6">六年级</option>
        </select>
      </label>
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">创建并同步</button>
        <button class="cloud-action secondary" type="button" data-close>稍后设置</button>
      </div>
    </form>
  `;
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
    closeDialog();
    showToast("家庭学习空间已建立，正在同步本机记录");
  };
}

function renderAccount() {
  const choices = profiles
    .map(
      (profile) => `
      <button class="learner-choice ${profile.id === activeProfile?.id ? "active" : ""}" type="button" data-profile="${profile.id}">
        <span>${profile.id === activeProfile?.id ? "✅" : "👦"}</span>
        <span><strong>${escapeHtml(profile.display_name)}</strong><small>${profile.grade_level || 1} 年级</small></span>
      </button>
    `
    )
    .join("");
  panel.innerHTML = `
    <h2>家庭学习空间</h2>
    <p>${escapeHtml(session.user.email || "已登录")} · 数据按家庭隔离</p>
    <div class="cloud-status">☁️ ${
      activeProfile ? `${escapeHtml(activeProfile.display_name)} 的记录已连接云端` : "请选择学习者"
    }</div>
    <div class="learner-list">${choices}</div>
    <form id="addLearnerForm">
      <label class="cloud-field">
        添加学习者
        <input name="learner" maxlength="30" required placeholder="例如：弟弟">
      </label>
      <label class="cloud-field">
        年级
        <select name="grade">
          ${[1, 2, 3, 4, 5, 6].map((grade) => `<option value="${grade}">${grade} 年级</option>`).join("")}
        </select>
      </label>
      <div class="cloud-actions">
        <button class="cloud-action" type="submit">添加</button>
        <button class="cloud-action secondary" type="button" data-sync>立即同步</button>
        <button class="cloud-action danger" type="button" data-signout>退出登录</button>
        <button class="cloud-action danger" type="button" data-clear-local>清除本机数据</button>
      </div>
    </form>
  `;
  panel.querySelectorAll("[data-profile]").forEach((button) => {
    button.onclick = async () => {
      await selectProfile(button.dataset.profile);
      renderAccount();
    };
  });
  panel.querySelector("[data-sync]").onclick = async () => {
    await saveCloudState(true);
  };
  panel.querySelector("[data-signout]").onclick = async () => {
    await supabase.auth.signOut();
    closeDialog();
  };
  panel.querySelector("[data-clear-local]").onclick = async () => {
    const confirmed = window.confirm("将清除此设备上的影伴学习记录并退出登录。云端数据不会删除。是否继续？");
    if (!confirmed) return;
    await supabase.auth.signOut();
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    window.learningDesk.clearLocalData();
  };
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
    .select("state, version")
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

if (cloudEnabled) {
  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();
  await onAuthChange(initialSession);
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    queueMicrotask(() => onAuthChange(nextSession));
  });
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
