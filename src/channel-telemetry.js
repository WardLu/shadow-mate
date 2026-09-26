const VIBECAFE_ORIGIN = "https://sm.shadow.wang";
const VIBECAFE_SCRIPT_URL = "https://vibecafe.ai/telemetry/v1.js";
const VIBECAFE_PRODUCT_ID = "cmui558e400000agml82y2kn1";

export function installVibeCafeTelemetry({
  document: targetDocument = globalThis.document,
  origin = globalThis.location?.origin,
  authKey = import.meta.env.VITE_VIBECAFE_AUTH_KEY,
} = {}) {
  if (!targetDocument || origin !== VIBECAFE_ORIGIN || !authKey) return false;
  if (targetDocument.querySelector(`script[data-vc-product-id="${VIBECAFE_PRODUCT_ID}"]`)) return true;

  const script = targetDocument.createElement("script");
  script.src = VIBECAFE_SCRIPT_URL;
  script.defer = true;
  script.crossOrigin = "anonymous";
  script.dataset.vcProductId = VIBECAFE_PRODUCT_ID;
  script.dataset.vcAuthKey = authKey;
  targetDocument.head.append(script);
  return true;
}
