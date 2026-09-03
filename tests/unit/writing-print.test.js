import { describe, expect, it } from "vitest";
import { waitForStylesheets } from "../../src/writing-print.js";

function printWindowFor(document) {
  return {
    document,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  };
}

function pendingStylesheet(document, href = "https://example.test/print.css") {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = href;
  let loaded = false;
  Object.defineProperty(stylesheet, "sheet", {
    configurable: true,
    get: () => (loaded ? {} : null),
  });
  return {
    stylesheet,
    load() {
      loaded = true;
      stylesheet.dispatchEvent(new Event("load"));
    },
    fail() {
      stylesheet.dispatchEvent(new Event("error"));
    },
  };
}

describe("writing print resource preparation", () => {
  it("waits for every stylesheet before allowing printing", async () => {
    const printDocument = document.implementation.createHTMLDocument("打印字帖");
    const delayed = pendingStylesheet(printDocument);
    printDocument.head.appendChild(delayed.stylesheet);
    let settled = false;

    const pending = waitForStylesheets(printWindowFor(printDocument)).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    delayed.load();
    await pending;
    expect(settled).toBe(true);
  });

  it("fails closed when a stylesheet cannot load", async () => {
    const printDocument = document.implementation.createHTMLDocument("打印字帖");
    const failed = pendingStylesheet(printDocument);
    printDocument.head.appendChild(failed.stylesheet);

    const pending = waitForStylesheets(printWindowFor(printDocument));
    failed.fail();
    await expect(pending).rejects.toMatchObject({
      code: "print_stylesheet_error",
      message: "打印样式加载失败，请检查网络后重试。",
    });
  });
});
