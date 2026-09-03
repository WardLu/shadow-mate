import { escapeHtml } from "./lib.js";
import { renderWritingPrintSheetHtml } from "./hanzi-writing-view.js";

const PRINT_ROOT_ID = "writingPrintRoot";
const PRINT_FONT_FAMILY = "ShadowMateWriting";
const PRINT_FONT_PROBE = " ";
const PRINT_READY_TIMEOUT_MS = 10000;
const PRINT_FONT_WAIT_TIMEOUT_MS = PRINT_READY_TIMEOUT_MS;
const PRINT_FONT_PATH = "/brand_assets/shadow-mate-writing-hand.ttf";

function rowsOf(worksheet) {
  return Array.isArray(worksheet?.rows) ? worksheet.rows : [];
}

function sameOriginStylesheetHrefs(sourceDocument, sourceLocation) {
  const sourceOrigin = new URL(sourceLocation.href).origin;
  return [...sourceDocument.querySelectorAll('link[rel="stylesheet"][href]')]
    .map((link) => {
      try {
        const href = new URL(link.href, sourceLocation.href);
        return href.origin === sourceOrigin ? href.href : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writingFontUrl(sourceLocation) {
  return new URL(PRINT_FONT_PATH, sourceLocation.href).href;
}

export function printDocumentMarkup(worksheet, sourceDocument, sourceLocation) {
  const stylesheets = sameOriginStylesheetHrefs(sourceDocument, sourceLocation)
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("");
  const sheet = renderWritingPrintSheetHtml(worksheet);

  return `<!doctype html>
<html lang="zh-CN" hidden>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>打印字帖</title>
    ${stylesheets}
  </head>
  <body>
    <div id="${PRINT_ROOT_ID}" class="writing-print-root">${sheet}</div>
  </body>
</html>`;
}

function withTimeout(promise, message, timeoutMs = PRINT_READY_TIMEOUT_MS, timerWindow = window) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = timerWindow.setTimeout(() => {
      const error = new Error(message);
      error.code = "print_ready_timeout";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => timerWindow.clearTimeout(timer));
}

async function waitForDocumentLoad(printWindow) {
  const printDocument = printWindow.document;
  if (printDocument.readyState !== "complete") {
    await withTimeout(new Promise((resolve) => {
      printWindow.addEventListener("load", resolve, { once: true });
    }), "打印样式加载超时，请检查网络后重试。", PRINT_READY_TIMEOUT_MS, printWindow);
  }
  await new Promise((resolve) => printWindow.setTimeout(resolve, 0));
}

export async function waitForStylesheets(printWindow) {
  const stylesheets = [...printWindow.document.querySelectorAll('link[rel="stylesheet"]')];
  await withTimeout(Promise.all(stylesheets.map((stylesheet) => new Promise((resolve, reject) => {
    const cleanup = () => {
      stylesheet.removeEventListener("load", onLoad);
      stylesheet.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      const error = new Error("打印样式加载失败，请检查网络后重试。");
      error.code = "print_stylesheet_error";
      reject(error);
    };

    stylesheet.addEventListener("load", onLoad, { once: true });
    stylesheet.addEventListener("error", onError, { once: true });
    if (stylesheet.sheet) onLoad();
  }))), "打印样式加载超时，请检查网络后重试。", PRINT_READY_TIMEOUT_MS, printWindow);
}

async function waitForPrintFont(printWindow, fontUrl) {
  const fonts = printWindow.document.fonts;
  if (!fonts?.add || !printWindow.FontFace) return;

  const fontSpec = `400 72px "${PRINT_FONT_FAMILY}"`;
  if (fonts.check(fontSpec, PRINT_FONT_PROBE)) return;
  // FontFaceSet.load(text) can remain pending when a custom font does not
  // contain every worksheet character. Load the font resource directly,
  // then let the browser fall back per glyph when a character is absent.
  try {
    const fontResponse = await withTimeout(
      printWindow.fetch(fontUrl),
      "字帖字体加载超时，将使用系统字体继续打印。",
      PRINT_FONT_WAIT_TIMEOUT_MS,
      printWindow,
    );
    if (!fontResponse.ok) throw new Error(`Font request failed with HTTP ${fontResponse.status}`);
    const fontData = await withTimeout(
      fontResponse.arrayBuffer(),
      "字帖字体加载超时，将使用系统字体继续打印。",
      PRINT_FONT_WAIT_TIMEOUT_MS,
      printWindow,
    );
    const fontFace = new printWindow.FontFace(PRINT_FONT_FAMILY, fontData, {
      display: "swap",
      style: "normal",
      weight: "400",
    });
    await withTimeout(
      fontFace.load(),
      "字帖字体加载超时，将使用系统字体继续打印。",
      PRINT_FONT_WAIT_TIMEOUT_MS,
      printWindow,
    );
    fonts.add(fontFace);
  } catch (error) {
    console.warn("Writing print font unavailable; using the system fallback:", error);
  }
}

async function preparePrintWindow(printWindow, worksheet, sourceDocument, sourceLocation) {
  const printDocument = printWindow.document;
  printDocument.open();
  printDocument.write(printDocumentMarkup(worksheet, sourceDocument, sourceLocation));
  printDocument.close();

  await waitForDocumentLoad(printWindow);
  await waitForStylesheets(printWindow);
  await waitForPrintFont(printWindow, writingFontUrl(sourceLocation));
  if (printWindow.closed) {
    const error = new Error("打印窗口已关闭，请重试。");
    error.code = "print_window_closed";
    throw error;
  }

  printDocument.documentElement.hidden = false;
  void printDocument.documentElement.offsetHeight;

  printWindow.addEventListener("afterprint", () => {
    if (!printWindow.closed) printWindow.close();
  }, { once: true });
  printWindow.focus();
  printWindow.print();
}

export function openWritingPrintWindow(worksheet) {
  const printWindow = window.open("about:blank", "_blank");
  if (!printWindow) {
    const error = new Error("打印窗口被浏览器拦截，请允许弹出窗口后重试。");
    error.code = "print_popup_blocked";
    return Promise.reject(error);
  }

  return preparePrintWindow(printWindow, worksheet, document, window.location)
    .catch((error) => {
      if (!printWindow.closed) printWindow.close();
      throw error;
    });
}
