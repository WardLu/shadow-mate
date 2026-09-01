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
    concept: {
      label: 'label <script>alert("label")</script>',
      visual: {
        kind: "emoji",
        value: '<img src=x onerror="alert(2)">',
        alt: "alt & onerror=alert(3)",
      },
      englishLabel: "english <b>unsafe</b>",
    },
    exampleWords: ["word & <b>unsafe</b>", '<script>alert("word")</script>'],
    sentence: 'sentence & <img src=x onerror="alert(4)">',
    writing: {
      strokeCount: 4,
      structure: 'structure <script>alert("structure")</script>',
      hint: 'hint & onerror="alert(5)"',
    },
  }],
};

const worksheet = {
  assignmentId: "rotation-v1-visual-worksheet",
  dayKey: "2026-09-01",
  layoutVersion: "focus-rows-v1",
  packRef: {
    setId: "hanzi-writing-v2",
    contentVersion: "hanzi-v2-pilot-1",
  },
  rows: [
    {
      rowId: "row-1",
      itemId: "hz-011",
      glyph: "火",
      pinyin: "huǒ",
      exampleWord: "火山",
      concept: {
        label: "火山",
        visual: { kind: "emoji", value: "🌋", alt: "一座火山" },
        englishLabel: "volcano",
      },
      exampleWords: ["火山", "火光"],
      sentence: "火山有火。",
      writing: { strokeCount: 4, structure: "独体字", hint: "先看两点，再写中间。" },
    },
    {
      rowId: "row-2",
      itemId: "hz-010",
      glyph: "水",
      pinyin: "shuǐ",
      exampleWord: "水果",
      concept: {
        label: "水滴",
        visual: { kind: "emoji", value: "💧", alt: "一滴清清的水" },
        englishLabel: "water",
      },
      exampleWords: ["水果", "水花"],
      sentence: "小鱼在水里。",
      writing: { strokeCount: 4, structure: "独体字", hint: "中间的竖钩要挺直。" },
    },
    {
      rowId: "row-3",
      itemId: "hz-013",
      glyph: "山",
      pinyin: "shān",
      exampleWord: "大山",
      concept: {
        label: "高山",
        visual: { kind: "emoji", value: "⛰️", alt: "一座高高的山" },
        englishLabel: "mountain",
      },
      exampleWords: ["大山", "山羊"],
      sentence: "山上有云。",
      writing: { strokeCount: 3, structure: "独体字", hint: "竖画站在中间。" },
    },
    {
      rowId: "row-4",
      itemId: "hz-012",
      glyph: "木",
      pinyin: "mù",
      exampleWord: "木头",
      concept: {
        label: "大树",
        visual: { kind: "emoji", value: "🌳", alt: "一棵枝叶茂盛的大树" },
        englishLabel: "tree",
      },
      exampleWords: ["木头", "木马"],
      sentence: "小鸟站在木头上。",
      writing: { strokeCount: 4, structure: "独体字", hint: "撇捺向两边展开。" },
    },
  ],
};

function parse(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("Hanzi writing snapshot renderers", () => {
  it("renders one rich learning card per snapshot row and keeps screen and print metadata aligned", () => {
    const screen = parse(renderWritingWorksheetHtml(worksheet));
    const print = parse(renderWritingPrintSheetHtml(worksheet));

    expect(screen.querySelectorAll("[data-hanzi-learning-card]")).toHaveLength(4);
    expect(print.querySelectorAll("[data-hanzi-learning-card]")).toHaveLength(4);
    expect(screen.querySelectorAll("[data-writing-row]")).toHaveLength(4);
    expect(print.querySelectorAll("[data-writing-row]")).toHaveLength(4);

    const firstCard = screen.querySelector("[data-hanzi-learning-card]");
    expect(firstCard.querySelector("[data-hanzi-visual]").textContent).toContain("🌋");
    expect(firstCard.querySelector("[data-hanzi-visual]").getAttribute("aria-label")).toBe("一座火山");
    expect(firstCard.querySelector("[data-hanzi-english-label]").textContent).toBe("volcano");
    expect(firstCard.querySelectorAll("[data-hanzi-example-word]")).toHaveLength(2);
    expect(firstCard.querySelectorAll("[data-hanzi-target-glyph]")).not.toHaveLength(0);
    expect(firstCard.querySelector("[data-hanzi-sentence]").textContent).toBe("火山有火。");
    expect(firstCard.querySelector("[data-hanzi-stroke-count]").textContent).toContain("4");
    expect(firstCard.querySelector("[data-hanzi-structure]").textContent).toBe("独体字");
    expect(firstCard.querySelector("[data-hanzi-writing-hint]").textContent).toBe("先看两点，再写中间。");
    expect(firstCard.querySelectorAll(".writing-cell")).toHaveLength(5);
    expect(firstCard.querySelectorAll(".writing-cell.model")).toHaveLength(1);
    expect(firstCard.querySelectorAll(".writing-cell.trace")).toHaveLength(1);
    expect(firstCard.querySelectorAll(".writing-cell.empty")).toHaveLength(3);

    const speechButtons = firstCard.querySelectorAll("[data-hanzi-speak]");
    expect(speechButtons).toHaveLength(2);
    expect([...speechButtons].map((button) => button.dataset.speechLocale)).toEqual(["zh-CN", "en-US"]);
    expect([...speechButtons].map((button) => button.dataset.speechText)).toEqual(["火", "volcano"]);

    const readWorksheetMetadata = (root) => ({
      assignmentId: root.dataset.writingAssignmentId,
      dayKey: root.dataset.writingDayKey,
      packId: root.dataset.writingPackId,
      packVersion: root.dataset.writingPackVersion,
      layoutVersion: root.dataset.writingLayoutVersion,
    });
    expect(readWorksheetMetadata(print.querySelector("[data-writing-print-sheet]"))).toEqual(
      readWorksheetMetadata(screen.querySelector("[data-writing-worksheet]"))
    );
    expect(print.querySelectorAll("[data-writing-row]").length).toBe(
      screen.querySelectorAll("[data-writing-row]").length
    );
    expect(print.querySelectorAll("[data-hanzi-visual]")).toHaveLength(4);
    expect(print.querySelectorAll("[data-hanzi-sentence]")).toHaveLength(4);
    expect(print.querySelectorAll("[data-hanzi-writing-hint]")).toHaveLength(4);
    expect(print.querySelectorAll("[data-hanzi-speak], button")).toHaveLength(0);
  });

  it("escapes hostile snapshot fields as text and data attributes", () => {
    for (const html of [
      renderWritingWorksheetHtml(hostileWorksheet),
      renderWritingPrintSheetHtml(hostileWorksheet),
    ]) {
      const container = parse(html);
      const section = container.firstElementChild;
      const row = section.querySelector("[data-writing-row]");

    expect(container.querySelector("script, img, b")).toBeNull();
      expect(container.querySelector("[onerror], [onmouseover]")).toBeNull();
      expect(section.dataset.writingAssignmentId).toBe(hostileWorksheet.assignmentId);
      expect(section.dataset.writingDayKey).toBe(hostileWorksheet.dayKey);
      expect(row.dataset.writingRowId).toBe(hostileWorksheet.rows[0].rowId);
      expect(row.dataset.writingItemId).toBe(hostileWorksheet.rows[0].itemId);
      expect(row.querySelector("[data-writing-glyph]").textContent).toBe(hostileWorksheet.rows[0].glyph);
      expect(row.querySelector("[data-writing-pinyin]").textContent).toBe(hostileWorksheet.rows[0].pinyin);
      expect(row.querySelector("[data-writing-example-word]").textContent).toBe(hostileWorksheet.rows[0].exampleWord);
      expect(row.querySelector("[data-hanzi-visual]").getAttribute("aria-label")).toBe(hostileWorksheet.rows[0].concept.visual.alt);
      expect(row.querySelector("[data-hanzi-sentence]").textContent).toBe(hostileWorksheet.rows[0].sentence);
      expect(row.querySelector("[data-hanzi-writing-hint]").textContent).toBe(hostileWorksheet.rows[0].writing.hint);
    }
  });
});
