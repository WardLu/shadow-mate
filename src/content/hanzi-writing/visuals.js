// Original local illustrations. Curriculum values select a fixed registry entry;
// external SVG, URLs and unregistered markup never reach the renderer.
const HANZI_WRITING_DIAGRAMS = Object.freeze({
  table: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1.3em" height="1.3em" aria-hidden="true" focusable="false"><g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21 22 12h33L42 21Z" fill="#e8c99d"/><path d="M9 21h33v6H9Zm33 0 13-9v6L42 27Z" fill="#c99a61"/><path d="M13 27v26h5V27Zm24 0v26h5V27Zm14-6v26h4V18" fill="#c99a61"/></g></svg>',
  "fishing-net": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1.3em" height="1.3em" aria-hidden="true" focusable="false"><path d="M8 9h48L49 48Q32 59 15 48Z" fill="#e8f4f1" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M9 15h46M10 23h44M12 31h40M13 39h38M15 47h34M16 10l5 41M24 10l3 44M32 10v45M40 10l-3 44M48 10l-5 41" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6"/><path d="M22 34q8-11 17 0-9 11-17 0Zm17 0 8-7v14Z" fill="#edb464" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="27" cy="32" r="1.5" fill="currentColor"/><path d="M8 9V5m48 4V5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
});

export function isHanziWritingDiagram(value) {
  return typeof value === "string" && Object.hasOwn(HANZI_WRITING_DIAGRAMS, value);
}

export function renderHanziWritingDiagram(value) {
  return isHanziWritingDiagram(value) ? HANZI_WRITING_DIAGRAMS[value] : "";
}
