import hanziWritingV2Pilot from "./v2-pilot-1.json" with { type: "json" };
import hanziWritingV2Expanded from "./v2-expanded-1.json" with { type: "json" };

export const HANZI_WRITING_V2_PILOT = hanziWritingV2Pilot;
export const HANZI_WRITING_V2_EXPANDED = hanziWritingV2Expanded;
export const HANZI_WRITING_PACK_REGISTRY = Object.freeze({
  [hanziWritingV2Pilot.contentVersion]: hanziWritingV2Pilot,
  [hanziWritingV2Expanded.contentVersion]: hanziWritingV2Expanded,
});

export function getActiveHanziWritingPack(packageId) {
  if (packageId === undefined || packageId === "bridging-v1") return HANZI_WRITING_V2_EXPANDED;
  if (packageId !== "foundation-v2") throw new Error(`unknown-learning-package:${packageId}`);
  return {
    ...HANZI_WRITING_V2_EXPANDED,
    items: HANZI_WRITING_V2_EXPANDED.items.filter((item) => !item.agePackages || item.agePackages.includes(packageId)),
  };
}

export function getHanziWritingPack(contentVersion) {
  return HANZI_WRITING_PACK_REGISTRY[contentVersion] || null;
}

export { validateHanziWritingPack } from "./validate-pack.js";
