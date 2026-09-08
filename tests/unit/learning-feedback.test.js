import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_PRAISE_WORDS,
  praise,
  flyStars,
  shake,
} from "../../src/learning-feedback.js";

describe("learning-feedback components", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  describe("praise()", () => {
    it("renders a default praise text when no text is provided", () => {
      const res = praise();
      const el = document.querySelector(".big-praise");
      expect(el).not.toBeNull();
      expect(DEFAULT_PRAISE_WORDS).toContain(el.textContent);
      expect(res.element).toBe(el);
    });

    it("renders explicit custom praise text", () => {
      praise("念得真好！");
      const el = document.querySelector(".big-praise");
      expect(el).not.toBeNull();
      expect(el.textContent).toBe("念得真好！");
    });

    it("automatically cleans up after timeout", () => {
      praise("太棒了！", { durationMs: 1100 });
      expect(document.querySelector(".big-praise")).not.toBeNull();

      vi.advanceTimersByTime(1100);
      expect(document.querySelector(".big-praise")).toBeNull();
    });

    it("supports manual destroy before timeout", () => {
      const { destroy } = praise("太棒了！");
      expect(document.querySelector(".big-praise")).not.toBeNull();
      destroy();
      expect(document.querySelector(".big-praise")).toBeNull();
    });
  });

  describe("flyStars()", () => {
    it("creates requested number of star elements with motion custom properties", () => {
      const { elements } = flyStars(6);
      const stars = document.querySelectorAll(".fxstar");
      expect(stars).toHaveLength(6);
      expect(elements).toHaveLength(6);

      const first = stars[0];
      expect(first.style.getPropertyValue("--dx")).toBeTruthy();
      expect(first.style.getPropertyValue("--dy")).toBeTruthy();
      expect(first.innerHTML).toContain("<svg");
    });

    it("automatically cleans up all star elements after timeout", () => {
      flyStars(8, { durationMs: 1100 });
      expect(document.querySelectorAll(".fxstar")).toHaveLength(8);

      vi.advanceTimersByTime(1100);
      expect(document.querySelectorAll(".fxstar")).toHaveLength(0);
    });

    it("supports manual destroy before timeout", () => {
      const { destroy } = flyStars(5);
      expect(document.querySelectorAll(".fxstar")).toHaveLength(5);
      destroy();
      expect(document.querySelectorAll(".fxstar")).toHaveLength(0);
    });
  });

  describe("shake()", () => {
    it("adds card-shake class and removes it after duration", () => {
      const target = document.createElement("div");
      document.body.appendChild(target);

      shake(target, { durationMs: 400 });
      expect(target.classList.contains("card-shake")).toBe(true);

      vi.advanceTimersByTime(400);
      expect(target.classList.contains("card-shake")).toBe(false);
    });

    it("handles null or missing element safely", () => {
      expect(() => shake(null)).not.toThrow();
    });
  });
});
