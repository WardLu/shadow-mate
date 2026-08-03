import { describe, expect, it, vi } from "vitest";
import { installRapidActionGuard, runLockedAction } from "../../src/action-lock.js";

describe("runLockedAction", () => {
  it("runs the same control only once until the pending action settles", async () => {
    const button = document.createElement("button");
    document.body.append(button);
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const action = vi.fn(() => pending);

    const first = runLockedAction(button, action);
    const second = await runLockedAction(button, action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ skipped: true });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    release();
    await first;
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });
});

describe("installRapidActionGuard", () => {
  it("blocks a rapid second click on the same control", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");
    root.append(button);
    document.body.append(root);
    const listener = vi.fn();
    button.addEventListener("click", listener);
    installRapidActionGuard(root, 1000);

    button.click();
    button.click();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("blocks a rapid second form submission", () => {
    const root = document.createElement("div");
    const form = document.createElement("form");
    root.append(form);
    document.body.append(root);
    const listener = vi.fn();
    form.addEventListener("submit", listener);
    installRapidActionGuard(root, 1000);

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
