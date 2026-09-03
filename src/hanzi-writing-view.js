import { escapeHtml } from "./lib.js";

const STROKE_ORDER_BY_GLYPH = Object.freeze({
  一: "横", 二: "横、横", 三: "横、横、横", 十: "横、竖", 人: "撇、捺", 口: "竖、横折、横", 手: "撇、横、横、竖钩",
  日: "竖、横折、横、横", 月: "撇、横折钩、横、横", 水: "竖钩、横撇、撇、捺", 火: "点、撇、撇、捺", 木: "横、竖、撇、捺",
  山: "竖、竖折、竖", 石: "横、撇、竖、横折、横", 田: "竖、横折、横、竖、横", 土: "横、竖、横", 上: "竖、横、横",
  下: "横、竖、点", 大: "横、撇、捺", 小: "竖钩、撇、点", 中: "竖、横折、横、竖", 天: "横、横、撇、捺",
  王: "横、横、竖、横", 马: "横折、竖折折钩、横", 牛: "撇、横、横、竖", 羊: "点、撇、横、横、横、竖",
  鸟: "撇、横折钩、点、竖折折钩、横", 虫: "竖、横折、横、竖、提、点", 云: "横、横、撇折、点", 雨: "横、竖、横折钩、竖、点、点、点、点",
  风: "撇、横折弯钩、撇、点", 花: "横、竖、撇、点、撇、竖、撇"
});
const STROKE_SYMBOL_BY_NAME = Object.freeze({
  点: "丶", 横: "一", 竖: "丨", 撇: "丿", 捺: "㇏", 提: "㇀", 折: "㇕", 钩: "亅",
  横折: "㇕", 横折钩: "㇆", 横撇: "㇇", 横折弯钩: "㇈", 竖折: "㇄", 竖折折钩: "㇉",
  竖钩: "亅", 竖提: "㇙", 撇折: "㇜", 竖弯钩: "㇟",
});

function text(value) {
  return escapeHtml(value ?? "");
}

function rowsOf(worksheet) {
  return Array.isArray(worksheet?.rows) ? worksheet.rows : [];
}

function strokeOrderFor(row) {
  return row?.writing?.strokeOrder || STROKE_ORDER_BY_GLYPH[row?.glyph] || "按笔画顺序书写";
}

function strokeOrderSymbolsFor(row) {
  const strokeOrder = strokeOrderFor(row);
  if (strokeOrder === "按笔画顺序书写") return "—";
  return strokeOrder.split("、").map((stroke) => STROKE_SYMBOL_BY_NAME[stroke] || stroke).join(" ");
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
  const englishSpeechText = row?.concept?.characterEnglishLabel || row?.concept?.englishLabel || "";
  const characterMeaning = row?.concept?.characterMeaning || row?.concept?.visual?.alt || row?.concept?.label || "";
  return `<div class="hanzi-speech-actions">
    <button type="button" data-hanzi-speak data-speech-text="${text(glyph)}" data-speech-locale="zh-CN" aria-label="${text(`播放“${glyph}”的中文发音`)}">中文发音</button>
    <button type="button" data-hanzi-speak data-speech-text="${text(englishSpeechText)}" data-speech-locale="en-US" aria-label="${text(`播放“${englishSpeechText}”的英文发音`)}">英文发音</button>
    <button type="button" data-hanzi-meaning-speak data-speech-text="${text(characterMeaning)}" data-speech-locale="zh-CN" aria-label="${text(`朗读“${characterMeaning}”的字意`)}">朗读字意</button>
  </div>`;
}

function printDate(dayKey) {
  const match = String(dayKey ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : text(dayKey);
}

function printStructure(value) {
  return String(value ?? "").replace(/结构$/, "").replace(/字$/, "");
}

function renderPrintRiceGrid() {
  return `<i class="writing-print-rice-line horizontal" aria-hidden="true"></i>
    <i class="writing-print-rice-line vertical" aria-hidden="true"></i>
    <i class="writing-print-rice-line diagonal" aria-hidden="true"></i>
    <i class="writing-print-rice-line diagonal diagonal-reverse" aria-hidden="true"></i>`;
}

function renderPrintCell(glyph, kind) {
  const content = glyph
    ? `<span data-writing-glyph>${text(glyph)}</span>`
    : "";
  return `<div class="writing-cell writing-print-cell writing-cell-${text(kind)} ${text(kind)}"${glyph ? "" : " aria-hidden=\"true\""}>${renderPrintRiceGrid()}${content}</div>`;
}

function renderPrintPhraseRow(row) {
  const phrase = Array.isArray(row?.exampleWords) && row.exampleWords.length > 0
    ? row.exampleWords[0]
    : row?.exampleWord;
  const phraseChars = [...String(phrase ?? "")].slice(0, 4);
  const cells = phraseChars.map((glyph) => renderPrintCell(glyph, "trace"));
  while (cells.length < 4) cells.push(renderPrintCell("", "empty"));
  return `<div class="writing-print-phrase-row"><span class="writing-print-phrase-name">${text(phrase)}</span><div class="writing-print-phrase-cells">${cells.join("")}</div></div>`;
}

function renderPrintCard(row, index) {
  const phrase = Array.isArray(row?.exampleWords) && row.exampleWords.length > 0
    ? row.exampleWords[0]
    : row?.exampleWord;
  return `<article class="writing-print-card hanzi-learning-card" data-hanzi-learning-card data-writing-row data-writing-row-id="${text(row?.rowId)}" data-writing-item-id="${text(row?.itemId)}">
    <div class="writing-print-card-head">
      <span class="writing-print-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="hanzi-target-glyph writing-print-target" data-hanzi-glyph>${text(row?.glyph)}</span>
      <span class="hanzi-target-pinyin writing-print-pinyin" data-writing-pinyin>${text(row?.pinyin)}</span><span class="writing-print-stroke-count">· ${text(row?.writing?.strokeCount)}画</span>
      <span class="writing-print-phrase">${text(phrase)}</span>
    </div>
    <div class="writing-print-context">
      ${renderVisual(row)}
      <div class="hanzi-example-words" data-hanzi-example-words>${renderExampleWords(row)}</div>
    </div>
    <div class="writing-print-body" data-writing-grid>
      <div class="writing-print-model-side">
        <span class="writing-print-model-label">示范</span>
        <div class="writing-cell writing-print-cell writing-cell-model model">${renderPrintRiceGrid()}<span data-writing-glyph>${text(row?.glyph)}</span></div>
        <p class="writing-print-info"><strong>结构</strong> ${text(printStructure(row?.writing?.structure))}</p>
        <p class="writing-print-info"><strong>笔顺</strong> ${text(strokeOrderSymbolsFor(row))}</p>
      </div>
      <div class="writing-print-practice">
        <div class="writing-print-practice-row"><span class="writing-print-practice-label trace">描红</span><div class="writing-print-cells">${renderPrintCell(row?.glyph, "trace")}${renderPrintCell(row?.glyph, "trace")}${renderPrintCell(row?.glyph, "trace")}${renderPrintCell(row?.glyph, "trace")}</div></div>
        <div class="writing-print-practice-row"><span class="writing-print-practice-label">临写</span><div class="writing-print-cells">${renderPrintCell("", "empty")}${renderPrintCell("", "empty")}${renderPrintCell("", "empty")}${renderPrintCell("", "empty")}</div></div>
        <p class="hanzi-sentence writing-print-sentence"><strong>造句：</strong><span data-hanzi-sentence>${text(row?.sentence)}</span></p>
        <p class="hanzi-writing-hint writing-print-hint" data-hanzi-writing-hint>${text(row?.writing?.hint)}</p>
      </div>
    </div>
    <div class="hanzi-writing-meta writing-print-card-meta"><span data-hanzi-stroke-count>${text(row?.writing?.strokeCount)} 画</span><span data-hanzi-structure>${text(row?.writing?.structure)}</span></div>
  </article>`;
}

function renderRow(row, { includeSpeech = false, print = false } = {}) {
  return `<article class="writing-row hanzi-learning-card${print ? " hanzi-learning-card-print" : ""}" data-hanzi-learning-card data-writing-row data-writing-row-id="${text(row?.rowId)}" data-writing-item-id="${text(row?.itemId)}">
    <div class="hanzi-learning-visual">${renderVisual(row)}</div>
    <div class="hanzi-learning-word">
      <span class="hanzi-section-label">认识词语</span>
      <div class="hanzi-example-words" data-hanzi-example-words>${renderExampleWords(row)}</div>
    </div>
    <div class="hanzi-learning-target">
      <span class="hanzi-target-glyph" data-hanzi-target-glyph data-hanzi-glyph data-writing-glyph>${text(row?.glyph)}</span>
      <span class="hanzi-target-pinyin" data-hanzi-pinyin data-writing-pinyin>${text(row?.pinyin)}</span>
      ${includeSpeech ? renderSpeechButtons(row) : ""}
    </div>
    <div class="hanzi-meaning" data-hanzi-meaning><span class="hanzi-meaning-label">字意：</span><span class="hanzi-meaning-text" data-hanzi-meaning-text>${text(row?.concept?.characterMeaning || row?.concept?.visual?.alt || row?.concept?.label)}</span></div>
    <p class="hanzi-sentence" data-hanzi-sentence>例句：${text(row?.sentence)}</p>
    <div class="hanzi-writing-meta" data-hanzi-writing-meta>
      <span data-hanzi-stroke-count>${text(row?.writing?.strokeCount)} 画</span>
      <span data-hanzi-structure>${text(row?.writing?.structure)}</span>
      <span data-hanzi-stroke-order>笔顺：${text(strokeOrderSymbolsFor(row))}</span>
    </div>
    <p class="hanzi-writing-hint" data-hanzi-writing-hint>${text(row?.writing?.hint)}</p>
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
  const rows = rowsOf(worksheet);
  return `<section class="writing-print-sheet" data-writing-print-sheet data-writing-assignment-id="${attributes.assignmentId}" data-writing-day-key="${attributes.dayKey}" data-writing-pack-id="${attributes.packSetId}" data-writing-pack-version="${attributes.packVersion}" data-writing-layout-version="${attributes.layoutVersion}">
    <div class="writing-print-paper">
      <header class="writing-print-header">
        <div class="writing-print-eyebrow"><svg class="writing-print-brand-logo" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Shadow Mate"><rect width="120" height="120" fill="#F3F9F4"/><rect x="6" y="6" width="108" height="108" rx="31" fill="#2AA650"/><path d="M19 64C22 39 39 23 60 23C81 23 98 39 101 64" fill="none" stroke="#DDF3E2" stroke-width="2" stroke-dasharray="4 4" opacity=".85"/><path d="M25 80C25 63 36 52 50 52C64 52 75 63 75 80V88H25V80Z" fill="#F3FBF4" stroke="#176B30" stroke-width="3"/><circle cx="50" cy="41" r="13" fill="#F3FBF4" stroke="#176B30" stroke-width="3"/><path d="M51 84C51 63 64 49 80 49C96 49 103 63 103 84V88H51V84Z" fill="#FFF0BD" stroke="#176B30" stroke-width="3"/><circle cx="80" cy="37" r="16" fill="#FFF0BD" stroke="#176B30" stroke-width="3"/><circle cx="65" cy="57" r="5" fill="#FFC83D" stroke="#176B30" stroke-width="3"/><path d="M20 96H48M72 96H100" stroke="#176B30" stroke-width="3" stroke-linecap="round" opacity=".9"/></svg><span>SHADOW MATE</span><span class="writing-print-divider">·</span><span>写字打卡练习</span></div>
        <div class="writing-print-badge"><strong>01</strong><span>今日练习单</span></div>
        <h1>今日写字字帖</h1>
        <p class="writing-print-subtitle"><strong>每天 15 分钟，认真写好一个字</strong>　先观察 · 再描红 · 后临写　|　把每一笔写在格子里</p>
        <div class="writing-print-meta-bar">
          <div><span>日期</span><strong>${printDate(attributes.dayKey)}</strong></div>
          <div><span>姓名</span><span class="writing-print-line"></span></div>
          <div><span>用时</span><span class="writing-print-line short"></span><span>分</span></div>
          <div><span>今日练习</span><strong>${rows.length} 字</strong><span class="writing-print-stars">☆ ☆ ☆</span></div>
        </div>
      </header>
      <section class="writing-print-lesson-strip" aria-label="练习说明和本页生字">
        <div class="writing-print-lesson-box"><strong>写字课堂</strong><div class="writing-print-lesson-steps"><span data-step="01">坐姿端正，纸张放平</span><span data-step="02">先看结构，再按笔顺</span><span data-step="03">描红慢一点，写准一点</span><span data-step="04">临写后比一比，改一改</span></div></div>
        <div class="writing-print-chars-box"><strong>本页生字</strong><div>${rows.map((row) => `<span>${text(row?.glyph)}</span>`).join("")}</div></div>
      </section>
      <div class="writing-print-section-head"><h2><span>01</span>笔画结构 · 描红与临写</h2><div><span class="model">● 楷书示范</span><span class="trace">● 描红 4 格</span><span class="practice">○ 临写 4 格</span></div></div>
      <div class="writing-print-rows">${rows.map(renderPrintCard).join("")}</div>
      <div class="writing-print-bottom-head"><h2><span>02</span>组词与造句小练习</h2><small>空白格用于独立书写 · 把词语写完整</small></div>
      <section class="writing-print-bottom-grid">
        <div class="writing-print-module writing-print-phrases"><h3>词语练一练 <small>从今天的生字中选一组</small></h3><div>${rows.map(renderPrintPhraseRow).join("")}</div></div>
        <div class="writing-print-module writing-print-sentence"><h3>造句练习</h3><p>选一个词语写一句话：</p><div class="writing-print-ruled-line"></div><div class="writing-print-ruled-line"></div><div class="writing-print-self-check"><span>今日自评</span><span>☆ ☆ ☆ ☆ ☆</span></div></div>
      </section>
      <footer class="writing-print-footer"><span>练习提示：黑色为楷书示范，粉色为浅色描红，空白格用于临写。</span><span><strong>今日完成</strong> <em>♥</em>　Shadow Mate · 写字打卡</span></footer>
    </div>
  </section>`;
}
