import { describe, expect, it, vi } from "vitest";
import { createContentLibrary } from "../../src/content-library-view.js";

describe("shared content library", () => {
  it("searches and opens a detail without displaying completion controls on every row", () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
    const play = vi.fn();
    const action = vi.fn(() => true);
    const view = createContentLibrary({
      getCatalog: () => ({ english: [{ id: "apple", word: "apple", meaning: "苹果", theme: "水果", phonetic: "/apple/" }, { id: "cat", word: "cat", meaning: "猫", theme: "动物", phonetic: "/cat/" }] }),
      getLearning: () => null, getDay: () => "2026-10-14", getScope: () => "anonymous",
      onAction: action, onPlay: play, onStop: vi.fn(), onMath: vi.fn(),
    });
    view.open("english");
    const dialog = document.querySelector("dialog.content-library");
    expect(dialog.querySelectorAll("[data-library-item]")).toHaveLength(2);
    expect(dialog.querySelectorAll('[data-library-action="complete"]')).toHaveLength(0);
    const search = dialog.querySelector("[data-library-search]");
    search.value = "苹果";
    search.dispatchEvent(new Event("input"));
    expect(dialog.querySelectorAll("[data-library-item]")).toHaveLength(1);
    dialog.querySelector("[data-library-item]").click();
    dialog.querySelector("[data-library-play]").click();
    expect(play).toHaveBeenCalledWith("english", expect.objectContaining({ id: "apple" }), expect.any(HTMLElement));
    dialog.querySelector('[data-library-action="complete"]').click();
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ activityId: "english", itemId: "apple", action: "complete" }));
    dialog.querySelector("[data-library-back]").click();
    expect(dialog.querySelector("[data-library-search]").value).toBe("苹果");
    view.close(); dialog.remove();
  });
});
