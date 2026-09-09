import { describe, it, expect } from "vitest";
import { HANZI } from "../../src/content/literacy.js";
import { LITERACY_SPEECH_ENTRIES, literacySpeechId } from "../../src/content/literacy-speech.js";
import { getActiveHanziWritingPack } from "../../src/content/hanzi-writing/manifest.js";
import { renderWritingWorksheetHtml } from "../../src/hanzi-writing-view.js";
import { cleanSpeechText } from "../../src/speech-text-utils.js";

describe("literacy published speech coverage", () => {
  it("resolves every literacy card to its actual spoken text", () => {
    const entries = new Map(LITERACY_SPEECH_ENTRIES.map(e => [e.contentId, e.text]));
    for (const item of HANZI) {
      const text = `${item[0]}，${item[2]}`;
      expect(entries.get(literacySpeechId(text))).toBe(cleanSpeechText(text));
    }
  });

  it("covers every rendered image, word, sentence and hint in the active curriculum", () => {
    const entries = new Map(LITERACY_SPEECH_ENTRIES.map(e => [e.contentId, e.text]));
    const items = getActiveHanziWritingPack().items;
    document.body.innerHTML = renderWritingWorksheetHtml({ rows: items.map(item => ({ ...item, itemId: item.id })) });
    const taps = document.querySelectorAll('[data-speech-tap]:not([data-hanzi-meaning-row])');
    expect(taps.length).toBe(items.length * 5);
    for (const tap of taps) {
      const text = cleanSpeechText(tap.dataset.speechText);
      expect(entries.get(literacySpeechId(text)), text).toBe(text);
    }
  });
});
