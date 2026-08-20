// Pure functions extracted from cloud.js for unit testing.
// These do not depend on DOM, Supabase, or any external state.

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function errorText(error) {
  return String(error?.message || error?.error_description || error || "").trim();
}

export function formatAuthError(error, fallback = "验证失败，请稍后再试。") {
  const message = errorText(error);
  const code = String(error?.code || "");
  const retryMatch = message.match(/only request this after\s+(\d+)\s+seconds?/i);

  if (retryMatch) return `请求过于频繁，请等待 ${retryMatch[1]} 秒后再试。`;
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(`${code} ${message}`)) {
    return "验证码发送过于频繁，请稍后再试。";
  }
  if (/expired/i.test(message)) return "验证码已过期，请重新发送验证码。";
  if (/invalid.*(?:token|otp)|(?:token|otp).*(?:invalid|not valid)/i.test(message)) {
    return "验证码无效，请检查后重新输入。";
  }
  if (/invalid.*email|email.*invalid/i.test(message)) return "请输入有效的邮箱地址。";
  if (/invalid login credentials|invalid credentials|email or password/i.test(message)) {
    return "邮箱或密码不正确；如果尚未设置密码，请改用邮箱验证码登录。";
  }
  if (/password.*(?:short|length)|weak_password/i.test(`${code} ${message}`)) {
    return "密码至少需要 6 位。";
  }
  if (/same password|different from the old password/i.test(message)) {
    return "新密码不能与当前密码相同。";
  }
  if (/network|failed to fetch|timeout/i.test(message)) {
    return "网络连接失败，请检查网络后再试。";
  }
  return fallback;
}

export function passwordStrength(password = "") {
  const value = String(password);
  const checks = {
    length: value.length >= 6,
    long: value.length >= 12,
    letter: /[a-zA-Z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^a-zA-Z0-9\s]/.test(value),
  };
  const variety = [checks.letter, checks.number, checks.symbol].filter(Boolean).length;
  const score = !checks.length ? 0 : Math.min(4, 1 + variety + (checks.long ? 1 : 0));
  const label = score <= 1 ? "弱" : score <= 3 ? "中" : "强";
  return { score, label, checks, valid: checks.length };
}

export function formatCloudError(error, fallback = "云端操作失败，请稍后再试。") {
  const message = errorText(error);

  if (/learning_state_conflict/i.test(message)) {
    return "云端记录已被其他设备更新，请刷新后再试。";
  }
  if (/network|failed to fetch|timeout/i.test(message)) {
    return "网络连接失败，请检查网络后再试。";
  }
  if (/row-level security|permission denied|not authorized|forbidden/i.test(message)) {
    return "当前账号没有执行此操作的权限。";
  }
  return fallback;
}

export function stateHasData(state) {
  return Boolean(
    Object.keys(state?.checkins || {}).length ||
      Object.keys(state?.points || {}).length ||
      Object.keys(state?.bookShelf || {}).length ||
      Object.keys(state?.peanutRead || {}).length ||
      (state?.peanutLog || []).length
  );
}

export function mergeObjects(local = {}, remote = {}) {
  const result = structuredClone(remote);
  for (const [key, value] of Object.entries(local)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(value, result[key]);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}

export function mergeState(local, remote) {
  const merged = mergeObjects(local, remote);
  const logMap = new Map();
  for (const item of [...(remote?.peanutLog || []), ...(local?.peanutLog || [])]) {
    const key = `${item.date || ""}|${item.title || ""}|${item.rating || ""}`;
    logMap.set(key, item);
  }
  merged.peanutLog = [...logMap.values()].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  );
  return merged;
}

export function latestUpdatedAt(rows = []) {
  let latestTime = 0;
  let latestValue = null;
  for (const row of rows) {
    const value = row?.updated_at;
    const time = Date.parse(value || "");
    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time;
      latestValue = value;
    }
  }
  return latestValue;
}

export const GRADE_LABELS = {
  0: "学前", 1: "一年级", 2: "二年级", 3: "三年级",
  4: "四年级", 5: "五年级", 6: "六年级", 7: "七年级",
  8: "八年级", 9: "九年级", 10: "十年级", 11: "十一年级", 12: "十二年级",
};

export const GRADE_OPTIONS = Object.entries(GRADE_LABELS)
  .map(([v, label]) => `<option value="${v}">${label}</option>`)
  .join("");

export function gradeLabel(level) {
  return GRADE_LABELS[level] || "一年级";
}

export function gradeOptionsSelected(selected) {
  return Object.entries(GRADE_LABELS)
    .map(([v, label]) => `<option value="${v}"${Number(v) === selected ? " selected" : ""}>${label}</option>`)
    .join("");
}

export function buildMissingSequence({ start = 1, length = 20, missingIndex = 9 } = {}) {
  const safeLength = Math.max(2, Math.floor(Number(length) || 20));
  const safeStart = Math.max(1, Math.floor(Number(start) || 1));
  const safeMissingIndex = Math.min(
    safeLength - 1,
    Math.max(1, Math.floor(Number(missingIndex) || 1))
  );
  const answer = safeStart + safeMissingIndex;
  const values = Array.from({ length: safeLength }, (_, index) => {
    if (index === safeMissingIndex) return null;
    return safeStart + index;
  });
  return { answer, values };
}

export function selectDailyWritingGroups(groups, date = new Date()) {
  const groupsPerSheet = 4;
  const sheetSize = Math.min(groupsPerSheet, groups.length);
  if (sheetSize === 0) return [];

  // Use the local calendar date, but calculate with UTC to avoid DST-length days.
  const calendarDay = Math.floor(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ) / 86_400_000);
  const start = ((calendarDay * sheetSize) % groups.length + groups.length) % groups.length;

  return Array.from(
    { length: sheetSize },
    (_, index) => groups[(start + index) % groups.length],
  );
}
