import { escapeHtml } from "./lib.js";
import { summarizeContentLearning } from "./content-learning-summary.js";
import { icon } from "./icons.js";

const CATEGORIES = [
  ["literacy", "识字", "literacy", "book"],
  ["poem", "古诗", "poems", "bookMarked"],
  ["writing", "写字", "writing", "pencil"],
  ["english", "英语", "english", "languages"],
  ["book", "绘本", "books", "library"],
  ["math", "数学", null, "calculator"],
];

const MATH_MODULES = [
  { id: "number-sense", title: "生活数感", desc: "实物点数、多少对比、规律排序与空间方位", iconKey: "grid" },
  { id: "mental", title: "口算练习", desc: "基础加减运算、心算与速算闯关", iconKey: "calculator" },
  { id: "sequence", title: "数字填写", desc: "数字顺序、前后相邻数与连线填空", iconKey: "pencil" },
  { id: "sudoku", title: "趣味数独", desc: "4×4 简易数独与逻辑思维推理", iconKey: "brain" },
];

const titleOf = item => item.title || item.glyph || item.word || item.t || "";
const descriptionOf = (activity, item) => activity === "poem" ? `${item.author || "佚名"} · ${item.theme || "亲子欣赏"}` :
  activity === "english" ? `${item.phonetic || ""} · ${item.meaning || ""}` :
  activity === "book" ? `${item.a || item.author || ""} · ${item.theme || "绘本"}` :
  `${item.pinyin || ""} · ${item.exampleWord || item.word || ""}`;

/** A single modal; state changes are owned by the caller, never by this view. */
export function createContentLibrary({ getCatalog, getLearning, getDay, getScope, onAction, onPlay,
  onStop, onMath, renderVisual = () => "" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "content-library";
  dialog.setAttribute("aria-label", "内容库");
  document.body.appendChild(dialog);
  let activity = "literacy", query = "", status = "all", theme = "", limit = 30, selectedId = null;
  let openedScope, trigger;

  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener("close", () => { onStop(); if (trigger?.isConnected) trigger.focus(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });

  function renderCard(item, stat, isSkipped) {
    const isLearned = !!stat;
    const countText = stat ? `学过 ${stat.count} 次` : "未学习";
    const statusPill = isSkipped
      ? `<span class="lib-card-status-pill skipped">已跳过</span>`
      : isLearned
      ? `<span class="lib-card-status-pill learned">最近 ${stat.latestDay}</span>`
      : `<span class="lib-card-status-pill unlearned">新内容</span>`;

    if (activity === "literacy" || activity === "writing") {
      return `
        <button class="content-library-item content-library-card lib-card-glyph" type="button" data-library-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(titleOf(item))}，${escapeHtml(descriptionOf(activity, item))}">
          <div class="lib-glyph-box">${escapeHtml(item.glyph || item.word)}</div>
          <div class="lib-card-info">
            <div class="lib-card-title">${escapeHtml(titleOf(item))}</div>
            <div class="lib-card-sub">${escapeHtml(descriptionOf(activity, item))}</div>
            <div class="lib-card-footer">
              <span class="lib-card-count">${countText}</span>
              ${statusPill}
            </div>
          </div>
        </button>
      `;
    }

    if (activity === "english") {
      return `
        <button class="content-library-item content-library-card lib-card-english" type="button" data-library-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.word)}，${escapeHtml(item.meaning || "")}">
          <div class="lib-english-visual-box">${renderVisual(item)}</div>
          <div class="lib-card-info">
            <div class="lib-card-title">${escapeHtml(item.word)}</div>
            <div class="lib-card-sub">${escapeHtml(item.phonetic || "")} · ${escapeHtml(item.meaning || "")}</div>
            <div class="lib-card-footer">
              <span class="lib-card-theme">${escapeHtml(item.theme || "单词")}</span>
              ${statusPill}
            </div>
          </div>
        </button>
      `;
    }

    if (activity === "poem") {
      const linesPreview = (item.lines || []).slice(0, 2).map(escapeHtml).join("，");
      return `
        <button class="content-library-item content-library-card lib-card-poem" type="button" data-library-item="${escapeHtml(item.id)}" aria-label="《${escapeHtml(item.title)}》，${escapeHtml(item.author || "")}">
          <div class="lib-poem-header">
            <span class="lib-poem-tag">${icon("bookMarked")} 古诗</span>
            ${statusPill}
          </div>
          <div class="lib-card-title">《${escapeHtml(item.title)}》</div>
          <div class="lib-card-sub">${escapeHtml(item.author || "")} · ${escapeHtml(item.theme || "欣赏")}</div>
          <div class="lib-poem-preview">${linesPreview}</div>
          <div class="lib-card-footer">
            <span class="lib-card-count">${stat ? `学过 ${stat.count} 次` : "未学习"}</span>
            <span class="lib-card-action">听读 →</span>
          </div>
        </button>
      `;
    }

    if (activity === "book") {
      return `
        <button class="content-library-item content-library-card lib-card-book" type="button" data-library-item="${escapeHtml(item.id)}" aria-label="《${escapeHtml(item.t || item.title)}》，${escapeHtml(item.a || item.author || "")}">
          <div class="lib-book-icon">${icon("book")}</div>
          <div class="lib-card-info">
            <div class="lib-card-title">《${escapeHtml(item.t || item.title)}》</div>
            <div class="lib-card-sub">${escapeHtml(item.a || item.author || "")}</div>
            <div class="lib-card-desc">${escapeHtml(item.prompt || "推荐实体绘本共读")}</div>
            <div class="lib-card-footer">
              <span class="lib-card-theme">${escapeHtml(item.r || item.theme || "绘本")}</span>
              ${statusPill}
            </div>
          </div>
        </button>
      `;
    }

    return `
      <button class="content-library-item content-library-card" type="button" data-library-item="${escapeHtml(item.id)}">
        <div class="lib-card-title">${escapeHtml(titleOf(item))}</div>
        <div class="lib-card-sub">${escapeHtml(descriptionOf(activity, item))}</div>
      </button>
    `;
  }

  function render() {
    if (getScope() !== openedScope) { close(); return; }
    const learning = getLearning();
    const catalog = getCatalog();
    const summary = summarizeContentLearning(learning, { referenceDay: getDay(), catalog });
    const definition = CATEGORIES.find(([id]) => id === activity);
    const items = definition[2] ? catalog[definition[2]] || [] : [];
    const stats = new Map((summary.activities[activity]?.items || []).map(item => [item.itemId, item]));
    const skipped = new Set((learning?.skips || []).filter(item => item.activityId === activity && item.skipped).map(item => item.itemId));
    const scroll = dialog.querySelector(".content-library-body")?.scrollTop || 0;
    const searchFocused = dialog.querySelector("[data-library-search]") === document.activeElement;
    const themes = [...new Set(items.map(item => item.theme).filter(Boolean))];
    const matches = items.filter(item => {
      const text = [titleOf(item), item.word, item.meaning, item.theme, item.exampleWord, item.t, item.a].filter(Boolean).join(" ").toLowerCase();
      return text.includes(query.toLowerCase()) && (!theme || item.theme === theme) &&
        (status === "all" || status === "recent" && stats.has(item.id) || status === "learned" && stats.has(item.id) || status === "new" && !stats.has(item.id) || status === "skipped" && skipped.has(item.id));
    });
    if (status === "recent") matches.sort((a, b) => (stats.get(b.id)?.latestDay || "").localeCompare(stats.get(a.id)?.latestDay || ""));
    const selected = items.find(item => item.id === selectedId);

    dialog.innerHTML = `
      <header class="content-library-header">
        <div class="content-library-title-group">
          <h2>${selected ? escapeHtml(titleOf(selected)) : "学习内容库"}</h2>
          <span class="content-library-badge">${definition ? definition[1] : ""}</span>
        </div>
        <button class="btn-subtle content-library-close-btn" type="button" data-library-close aria-label="关闭内容库">${icon("close")}</button>
      </header>
      <nav class="content-library-tabs" role="tablist" aria-label="内容分类">
        ${CATEGORIES.map(([id, label, , iconKey]) => `
          <button type="button" role="tab" class="content-library-tab ${activity === id ? "active" : ""}" data-library-category="${id}" aria-selected="${activity === id}" aria-pressed="${activity === id}">
            ${icon(iconKey)} <span>${label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="content-library-body">
        ${selected ? detail(selected, stats.get(selected.id), skipped.has(selected.id), learning) : activity === "math" ? mathContent() : `
          <div class="content-library-hero">
            <div class="content-library-hero-text">
              <p class="hero-desc">按孩子的兴趣自由探索，点读学习不替换今天的每日推荐，自主学习不计入每日打卡。</p>
              <div class="content-library-stat-pills">
                <span class="hero-pill">当前目录 <b>${items.length}</b> 项</span>
                <span class="hero-pill accent">已学习 <b>${summary.activities[activity]?.learnedCatalogCount || 0}</b> 项</span>
              </div>
            </div>
          </div>
          <div class="content-library-filters">
            <div class="filter-search-box">
              <span class="search-icon">${icon("compass")}</span>
              <input type="search" data-library-search aria-label="搜索内容库" placeholder="搜索字、词、拼音或主题..." value="${escapeHtml(query)}">
            </div>
            <div class="filter-dropdowns">
              <label class="filter-label">
                <span>主题</span>
                <select data-library-theme>
                  <option value="">全部主题</option>
                  ${themes.map(value => `<option value="${escapeHtml(value)}" ${value === theme ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
                </select>
              </label>
              <label class="filter-label">
                <span>进度</span>
                <select data-library-status>
                  ${[["all","全部状态"],["learned","已学过"],["new","未学过"],["skipped","已跳过"],["recent","最近学习"]].map(([value,label]) => `<option value="${value}" ${status === value ? "selected" : ""}>${label}</option>`).join("")}
                </select>
              </label>
            </div>
          </div>
          <div class="content-library-list content-library-grid">
            ${matches.slice(0, limit).map(item => renderCard(item, stats.get(item.id), skipped.has(item.id))).join("") || '<div class="content-library-empty"><p class="desc">没有找到匹配的内容，试试换个关键词或重置筛选。</p></div>'}
          </div>
          ${matches.length > limit ? '<div class="content-library-more-wrapper"><button class="checkin secondary" type="button" data-library-more>加载更多内容（还有 ' + (matches.length - limit) + ' 项）</button></div>' : ""}
        `}
      </div>
    `;

    dialog.querySelector("[data-library-close]").onclick = close;
    dialog.querySelectorAll("[data-library-category]").forEach(button => {
      button.onclick = () => {
        onStop(); activity = button.dataset.libraryCategory; selectedId = null; query = ""; theme = ""; status = "all"; limit = 30; render();
      };
    });
    dialog.querySelectorAll("[data-library-item]").forEach(button => {
      button.onclick = () => { selectedId = button.dataset.libraryItem; render(); dialog.querySelector("[data-library-back]").focus(); };
    });
    const search = dialog.querySelector("[data-library-search]");
    if (search) {
      search.oninput = () => { query = search.value; limit = 30; render(); };
      if (searchFocused) search.focus();
    }
    const themeInput = dialog.querySelector("[data-library-theme]");
    if (themeInput) themeInput.onchange = () => { theme = themeInput.value; limit = 30; render(); };
    const statusInput = dialog.querySelector("[data-library-status]");
    if (statusInput) statusInput.onchange = () => { status = statusInput.value; limit = 30; render(); };
    const more = dialog.querySelector("[data-library-more]");
    if (more) more.onclick = () => { limit += 30; render(); };
    const back = dialog.querySelector("[data-library-back]");
    if (back) back.onclick = () => { onStop(); selectedId = null; render(); };
    const play = dialog.querySelector("[data-library-play]");
    if (play) play.onclick = () => onPlay(activity, selected, play);
    dialog.querySelectorAll("[data-library-action]").forEach(button => {
      button.onclick = () => {
        if (getScope() !== openedScope) { close(); return; }
        const success = onAction({ activityId: activity, itemId: selected.id, action: button.dataset.libraryAction, occurrenceId: button.dataset.occurrence });
        if (success !== false) render();
      };
    });
    dialog.querySelectorAll("[data-library-math]").forEach(button => {
      button.onclick = () => { close(); onMath(button.dataset.libraryMath); };
    });
    dialog.querySelector(".content-library-body").scrollTop = scroll;
  }

  function detail(item, stat, skipped, learning) {
    const today = (learning?.occurrences || []).find(entry => entry.activityId === activity && entry.itemId === item.id && entry.dayKey === getDay());
    return `
      <div class="content-library-detail-nav">
        <button class="btn-subtle" type="button" data-library-back>${icon("chevronDown", { className: "rotate-90" })} 返回目录</button>
      </div>
      <article class="content-library-detail card">
        <div class="detail-header-block">
          ${activity === "english" ? `<div class="detail-visual-box">${renderVisual(item)}</div>` : ""}
          ${activity === "literacy" || activity === "writing" ? `<div class="detail-glyph-box">${escapeHtml(item.glyph || item.word)}</div>` : ""}
          <div class="detail-title-group">
            <h3>${escapeHtml(titleOf(item))}</h3>
            <p class="detail-sub">${escapeHtml(descriptionOf(activity, item) || "")}</p>
          </div>
        </div>
        ${activity === "poem" ? `<div class="poem-lines">${(item.lines || []).map(line => `<p class="poem-line-text">${escapeHtml(line)}</p>`).join("")}</div>` : ""}
        <div class="detail-prompt-box">
          <span class="prompt-icon">${icon("hint")}</span>
          <p class="desc">${escapeHtml(item.prompt || "按孩子兴趣选择，不要求一次学会。在生活中自然巩固。")}</p>
        </div>
        <div class="detail-action-bar">
          <button class="checkin" type="button" data-library-play>${icon("volume")} 听一听点读</button>
        </div>
        <div class="detail-stat-section">
          <h4>${icon("chart")} 学习足迹</h4>
          <p class="stat-stage">${stat ? `已学过 <b>${stat.count}</b> 次 · ${stat.stage === "first" ? "初次接触" : "多次重温"}` : "还没有学习记录"}</p>
          ${stat ? `
            <p class="desc">首次：${stat.firstDay} · 最近：${stat.latestDay}</p>
            <p class="desc">最近一次家长观察：<b>${stat.feedback === "independent" ? "可独立完成" : stat.feedback === "needs-help" ? "仍需提示" : "未填写"}</b></p>
          ` : ""}
        </div>
        <div class="detail-controls-section">
          ${skipped ? `
            <button class="checkin secondary" type="button" data-library-action="restore">${icon("refresh")} 恢复推荐</button>
          ` : today?.revoked ? `
            <p class="desc">今天这次学习记录已撤回，下次可继续学习。</p>
          ` : today ? `
            <div class="today-learned-box">
              <p class="desc"><strong>${icon("checkCircle")} 今天已学习本次内容</strong>（不重复累计）</p>
              <div class="row">
                <button class="btn-subtle" type="button" data-library-action="independent" data-occurrence="${escapeHtml(today.occurrenceId)}">可独立完成</button>
                <button class="btn-subtle" type="button" data-library-action="needs-help" data-occurrence="${escapeHtml(today.occurrenceId)}">仍需提示</button>
                <button class="btn-subtle danger" type="button" data-library-action="revoke" data-occurrence="${escapeHtml(today.occurrenceId)}">撤回误录</button>
              </div>
            </div>
          ` : `
            <button class="checkin" type="button" data-library-action="complete">${icon("checkCircle")} 标记本次学习完成</button>
          `}
          ${!skipped ? `
            <div class="detail-secondary-actions">
              <button class="btn-subtle" type="button" data-library-action="skip">${icon("trash")} 暂时跳过此内容</button>
            </div>
          ` : ""}
        </div>
        <details class="detail-history-fold">
          <summary>查看详细学习历史</summary>
          <div class="history-list">
            ${(stat?.history || []).slice().reverse().map(entry => `
              <div class="history-item">
                <span class="history-date">${entry.dayKey}</span>
                <span class="history-tag">${entry.feedback === "independent" ? "可独立完成" : entry.feedback === "needs-help" ? "仍需提示" : "自主体验"}</span>
              </div>
            `).join("") || '<p class="desc">暂无有效记录。</p>'}
          </div>
        </details>
      </article>
    `;
  }

  function mathContent() {
    return `
      <div class="lib-math-banner">
        <strong>${icon("calculator")} 数学思维实践中心</strong>
        <p class="desc">题目按孩子当前所处阶段动态生成。点击任意卡片即可进入专属练习：</p>
      </div>
      <div class="content-library-list lib-math-grid">
        ${MATH_MODULES.map(m => `
          <button class="content-library-item lib-math-card" type="button" data-library-math="${m.id}">
            <div class="lib-math-card-top">
              <span class="lib-math-card-icon">${icon(m.iconKey)}</span>
              <span class="lib-math-card-badge">练习</span>
            </div>
            <div class="lib-math-card-title">${escapeHtml(m.title)}</div>
            <div class="lib-math-card-desc">${escapeHtml(m.desc)}</div>
            <div class="lib-math-card-footer">
              <span>开始练习</span>
              <span class="lib-math-arrow">→</span>
            </div>
          </button>
        `).join("")}
      </div>
    `;
  }

  return {
    open(category = "literacy", itemId = null) {
      openedScope = getScope(); trigger = document.activeElement; activity = category; selectedId = itemId;
      query = ""; theme = ""; status = "all"; limit = 30; render();
      if (!dialog.open) dialog.showModal(); dialog.querySelector("[data-library-close]").focus();
    },
    close,
    refresh: () => { if (dialog.open) render(); }
  };
}
