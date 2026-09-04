import hanziWritingV2Pilot from "./v2-pilot-1.json" with { type: "json" };

export const HANZI_WRITING_V2_PILOT = hanziWritingV2Pilot;

export function getActiveHanziWritingPack() {
  return HANZI_WRITING_V2_PILOT;
}

export { validateHanziWritingPack } from "./validate-pack.js";
