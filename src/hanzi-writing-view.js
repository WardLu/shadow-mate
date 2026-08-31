import { escapeHtml } from "./lib.js";

function text(value) {
  return escapeHtml(value ?? "");
}

function rowsOf(worksheet) {
  return Array.isArray(worksheet?.rows) ? worksheet.rows : [];
}

function worksheetAttributes(worksheet) {
  return {
    assignmentId: text(worksheet?.assignmentId),
    dayKey: text(worksheet?.dayKey),
    packSetId: text(worksheet?.packRef?.setId),
    packVersion: text(worksheet?.packRef?.contentVersion),
  };
}

function renderCells(row) {
  return [
    `<div class="writing-cell writing-cell-trace"><span data-writing-glyph>${text(row?.glyph)}</span></div>`,
    `<div class="writing-cell writing-cell-empty" aria-hidden="true"></div>`,
    `<div class="writing-cell writing-cell-empty" aria-hidden="true"></div>`,
    `<div class="writing-cell writing-cell-empty" aria-hidden="true"></div>`,
    `<div class="writing-cell writing-cell-empty" aria-hidden="true"></div>`,
  ].join("");
}

function renderRow(row) {
  return `<article class="writing-row" data-writing-row data-writing-row-id="${text(row?.rowId)}" data-writing-item-id="${text(row?.itemId)}">
    <div class="writing-row-copy">
      <span class="writing-row-pinyin" data-writing-pinyin>${text(row?.pinyin)}</span>
      <span class="writing-row-example" data-writing-example-word>${text(row?.exampleWord)}</span>
    </div>
    <div class="writing-row-grid">${renderCells(row)}</div>
  </article>`;
}

function renderRows(worksheet) {
  return rowsOf(worksheet).map((row) => renderRow(row)).join("");
}

export function renderWritingWorksheetHtml(worksheet) {
  const attributes = worksheetAttributes(worksheet);
  return `<section class="writing-worksheet" data-writing-worksheet data-writing-assignment-id="${attributes.assignmentId}" data-writing-day-key="${attributes.dayKey}" data-writing-pack-id="${attributes.packSetId}" data-writing-pack-version="${attributes.packVersion}">
    <div class="writing-worksheet-meta">
      <span class="writing-worksheet-label">今日字帖</span>
      <span class="writing-worksheet-day">${attributes.dayKey}</span>
    </div>
    <div class="writing-rows">${renderRows(worksheet)}</div>
  </section>`;
}

export function renderWritingPrintSheetHtml(worksheet) {
  const attributes = worksheetAttributes(worksheet);
  return `<section class="writing-print-sheet" data-writing-print-sheet data-writing-assignment-id="${attributes.assignmentId}" data-writing-day-key="${attributes.dayKey}" data-writing-pack-id="${attributes.packSetId}" data-writing-pack-version="${attributes.packVersion}">
    <header class="writing-print-heading">
      <h1>今日字帖</h1>
      <div class="writing-print-meta">${attributes.dayKey} · ${attributes.packVersion}</div>
    </header>
    <div class="writing-print-rows">${renderRows(worksheet)}</div>
  </section>`;
}
