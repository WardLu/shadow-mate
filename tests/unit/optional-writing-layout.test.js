import { describe, expect, it } from "vitest";
import { createOptionalWritingLayout, renderWritingPrintSheetHtml, renderWritingWorksheetHtml } from "../../src/hanzi-writing-view.js";

describe("optional four-row writing layout", () => {
  it("prints four blank rows without inventing an assignment or item identity", () => {
    const layout = createOptionalWritingLayout({ dayKey: "2026-10-14" });
    expect(layout.rows).toHaveLength(4);
    expect(layout).not.toHaveProperty("assignmentId");
    expect(layout.rows.every(row => row.kind === "blank" && !row.itemId)).toBe(true);
    const node = document.createElement("div");
    node.innerHTML = renderWritingPrintSheetHtml(layout);
    expect(node.querySelectorAll("[data-writing-row]")).toHaveLength(4);
    expect(node.querySelectorAll("[data-writing-item-id]")).toHaveLength(0);
    expect(node.querySelector(".writing-print-meta-bar").textContent).toContain("0 字 · 4 行");
  });

  it("keeps real content distinct from filler slots", () => {
    const row = { itemId: "hz-001", glyph: "一", pinyin: "yī", exampleWord: "一个" };
    const layout = createOptionalWritingLayout({ rows: [row], dayKey: "2026-10-14" });
    const node = document.createElement("div");
    node.innerHTML = renderWritingWorksheetHtml(layout);
    expect(node.querySelectorAll("[data-writing-row]")).toHaveLength(4);
    expect(node.querySelectorAll("[data-writing-blank]")).toHaveLength(3);
    expect(node.querySelectorAll('[data-writing-item-id="hz-001"]')).toHaveLength(1);
    expect(layout.rows[0]).toMatchObject(row);
    expect(row).not.toHaveProperty("kind");
  });
});
