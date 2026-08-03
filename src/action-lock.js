const runningActions = new WeakSet();

export async function runLockedAction(trigger, action, { busyText = "处理中…" } = {}) {
  if (!trigger || runningActions.has(trigger)) return { skipped: true };

  runningActions.add(trigger);
  const previousDisabled = Boolean(trigger.disabled);
  const previousText = trigger.textContent;
  trigger.disabled = true;
  trigger.setAttribute("aria-busy", "true");
  if (busyText) trigger.textContent = busyText;

  try {
    return await action();
  } finally {
    runningActions.delete(trigger);
    if (trigger.isConnected) {
      trigger.disabled = previousDisabled;
      trigger.removeAttribute("aria-busy");
      if (busyText) trigger.textContent = previousText;
    }
  }
}

export function installRapidActionGuard(root = document, cooldownMs = 500) {
  const lastTriggeredAt = new WeakMap();
  const viewOnlySelector = [
    ".navbtn",
    "[data-mod]",
    "[data-go]",
    "[data-lvl]",
    ".cal-chip",
    "[data-print]",
    "[data-speak]",
    "[data-auth-mode]",
    "[data-toggle-password]",
    "[data-toggle-login-password]",
  ].join(",");

  const shouldBlock = (target) => {
    const now = Date.now();
    const previous = lastTriggeredAt.get(target) || 0;
    if (now - previous < cooldownMs) return true;
    lastTriggeredAt.set(target, now);
    return false;
  };

  root.addEventListener("click", (event) => {
    const control = event.target.closest?.("button, [role='button'], input[type='submit'], input[type='button']");
    if (!control || !root.contains(control) || control.matches(viewOnlySelector) || !shouldBlock(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  root.addEventListener("submit", (event) => {
    if (!shouldBlock(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
