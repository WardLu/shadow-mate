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
    layoutVersion: text(worksheet?.layoutVersion),
  };
}

function renderHighlightedText(value, glyph) {
  const source = String(value ?? "");
  const target = String(glyph ?? "");
  if (!target) return text(source);

  const fragments = [];
  let cursor = 0;
  while (cursor < source.length) {
    const matchStart = source.indexOf(target, cursor);
    if (matchStart < 0) {
      fragments.push(text(source.slice(cursor)));
      break;
    }
    if (matchStart > cursor) fragments.push(text(source.slice(cursor, matchStart)));
    fragments.push(`<mark class="hanzi-target-highlight" data-hanzi-target-glyph>${text(target)}</mark>`);
    cursor = matchStart + target.length;
  }
  return fragments.join("");
}

function renderVisual(row) {
  const visual = row?.concept?.visual || {};
  const alt = visual.alt ?? "";
  return `<div class="hanzi-visual" data-hanzi-visual data-hanzi-visual-kind="${text(visual.kind)}" data-hanzi-visual-alt="${text(alt)}" role="img" aria-label="${text(alt)}">
    <span class="hanzi-visual-value">${text(visual.value)}</span>
    <span class="hanzi-concept-label" data-hanzi-concept-label>${text(row?.concept?.label)}</span>
    <span class="hanzi-english-label" data-hanzi-english-label>${text(row?.concept?.englishLabel)}</span>
    <span class="hanzi-visual-alt">${text(alt)}</span>
  </div>`;
}

function renderExampleWords(row) {
  const words = Array.isArray(row?.exampleWords) && row.exampleWords.length > 0
    ? row.exampleWords
    : [row?.exampleWord];

  return words.map((word, index) => `<span class="hanzi-example-word" data-hanzi-example-word data-writing-example-word data-hanzi-example-word-index="${index}">${renderHighlightedText(word, row?.glyph)}</span>`).join("");
}

function renderSpeechButtons(row) {
  const glyph = row?.glyph ?? "";
  const englishLabel = row?.concept?.englishLabel ?? "";
  return `<div class="hanzi-speech-actions">
    <button type="button" data-hanzi-speak data-speech-text="${text(glyph)}" data-speech-locale="zh-CN" aria-label="${text(`播放“${glyph}”的中文发音`)}">中文发音</button>
    <button type="button" data-hanzi-speak data-speech-text="${text(englishLabel)}" data-speech-locale="en-US" aria-label="${text(`播放“${englishLabel}”的英文发音`)}">English pronunciation</button>
  </div>`;
}

function renderCells(row) {
  return [
    `<div class="writing-cell writing-cell-model model"><span data-writing-glyph>${text(row?.glyph)}</span></div>`,
    `<div class="writing-cell writing-cell-trace trace"><span data-writing-glyph>${text(row?.glyph)}</span></div>`,
    `<div class="writing-cell writing-cell-empty empty" aria-hidden="true"></div>`,
    `<div class="writing-cell writing-cell-empty empty" aria-hidden="true"></div>`,
    `<div class="writing-cell writing-cell-empty empty" aria-hidden="true"></div>`,
  ].join("");
}

function renderRow(row, { includeSpeech = false, print = false } = {}) {
  return `<article class="writing-row hanzi-learning-card${print ? " hanzi-learning-card-print" : ""}" data-hanzi-learning-card data-writing-row data-writing-row-id="${text(row?.rowId)}" data-writing-item-id="${text(row?.itemId)}">
    <div class="hanzi-learning-visual">${renderVisual(row)}</div>
    <div class="hanzi-learning-word">
      <span class="hanzi-section-label">认识词语</span>
      <div class="hanzi-example-words" data-hanzi-example-words>${renderExampleWords(row)}</div>
    </div>
    <div class="hanzi-learning-target">
      <span class="hanzi-target-glyph" data-hanzi-target-glyph data-hanzi-glyph>${text(row?.glyph)}</span>
      <span class="hanzi-target-pinyin" data-hanzi-pinyin data-writing-pinyin>${text(row?.pinyin)}</span>
      ${includeSpeech ? renderSpeechButtons(row) : ""}
    </div>
    <p class="hanzi-sentence" data-hanzi-sentence>${text(row?.sentence)}</p>
    <div class="hanzi-writing-meta" data-hanzi-writing-meta>
      <span data-hanzi-stroke-count>${text(row?.writing?.strokeCount)} 画</span>
      <span data-hanzi-structure>${text(row?.writing?.structure)}</span>
    </div>
    <p class="hanzi-writing-hint" data-hanzi-writing-hint>${text(row?.writing?.hint)}</p>
    <div class="writing-row-grid" data-writing-grid>${renderCells(row)}</div>
  </article>`;
}

function renderRows(worksheet, options) {
  return rowsOf(worksheet).map((row) => renderRow(row, options)).join("");
}

export function renderWritingWorksheetHtml(worksheet) {
  const attributes = worksheetAttributes(worksheet);
  return `<section class="writing-worksheet" data-writing-worksheet data-writing-assignment-id="${attributes.assignmentId}" data-writing-day-key="${attributes.dayKey}" data-writing-pack-id="${attributes.packSetId}" data-writing-pack-version="${attributes.packVersion}" data-writing-layout-version="${attributes.layoutVersion}">
    <div class="writing-worksheet-meta">
      <span class="writing-worksheet-label">今日图字学习 · 写字</span>
      <span class="writing-worksheet-day">${attributes.dayKey}</span>
    </div>
    <div class="writing-rows hanzi-learning-grid">${renderRows(worksheet, { includeSpeech: true })}</div>
  </section>`;
}

export function renderWritingPrintSheetHtml(worksheet) {
  const attributes = worksheetAttributes(worksheet);
  return `<section class="writing-print-sheet" data-writing-print-sheet data-writing-assignment-id="${attributes.assignmentId}" data-writing-day-key="${attributes.dayKey}" data-writing-pack-id="${attributes.packSetId}" data-writing-pack-version="${attributes.packVersion}" data-writing-layout-version="${attributes.layoutVersion}">
    <header class="writing-print-heading">
      <h1>今日图字学习字帖</h1>
      <div class="writing-print-meta">${attributes.dayKey} · ${attributes.packVersion}</div>
    </header>
    <div class="writing-print-rows">${renderRows(worksheet, { print: true })}</div>
  </section>`;
}
