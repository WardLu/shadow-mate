import { describe, expect, it } from "vitest";
import {
  renderWritingPrintSheetHtml,
  renderWritingWorksheetHtml,
} from "../../src/hanzi-writing-view.js";

const hostileWorksheet = {
  assignmentId: 'assignment"><script>alert("assignment")</script>',
  dayKey: '2026-09-01" data-day="forged',
  packRef: {
    setId: "hanzi-writing-v2",
    contentVersion: "hanzi-v2-pilot-1",
  },
  rows: [{
    rowId: 'row-1" onmouseover="alert(1)',
    itemId: "item-<script>",
    glyph: "<img src=x onerror=alert(1)>",
    pinyin: 'pinyin"><script>alert("pinyin")</script>',
    exampleWord: "word & <b>unsafe</b>",
  }],
};

function parse(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("Hanzi writing snapshot renderers", () => {
  it("escapes hostile snapshot fields as text and data attributes", () => {
    for (const html of [
      renderWritingWorksheetHtml(hostileWorksheet),
      renderWritingPrintSheetHtml(hostileWorksheet),
    ]) {
      const container = parse(html);
      const section = container.firstElementChild;
      const row = section.querySelector("[data-writing-row]");

      expect(container.querySelector("script, img, b")).toBeNull();
      expect(section.dataset.writingAssignmentId).toBe(hostileWorksheet.assignmentId);
      expect(section.dataset.writingDayKey).toBe(hostileWorksheet.dayKey);
      expect(row.dataset.writingRowId).toBe(hostileWorksheet.rows[0].rowId);
      expect(row.dataset.writingItemId).toBe(hostileWorksheet.rows[0].itemId);
      expect(row.querySelector("[data-writing-glyph]").textContent).toBe(hostileWorksheet.rows[0].glyph);
      expect(row.querySelector("[data-writing-pinyin]").textContent).toBe(hostileWorksheet.rows[0].pinyin);
      expect(row.querySelector("[data-writing-example-word]").textContent).toBe(hostileWorksheet.rows[0].exampleWord);
    }
  });
});
