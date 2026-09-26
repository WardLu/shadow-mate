import { describe, expect, it } from "vitest";
import { installVibeCafeTelemetry } from "../../src/channel-telemetry.js";

describe("VibeCafé pageview loader", () => {
  it("does not load on local or preview origins, or without a configured key", () => {
    const targetDocument = document.implementation.createHTMLDocument();
    expect(installVibeCafeTelemetry({
      document: targetDocument,
      origin: "http://localhost:5173",
      authKey: "synthetic-key",
    })).toBe(false);
    expect(installVibeCafeTelemetry({
      document: targetDocument,
      origin: "https://sm.shadow.wang",
      authKey: "",
    })).toBe(false);
    expect(targetDocument.querySelector("script[src*='vibecafe.ai']")).toBeNull();
  });

  it("adds one CORS-enabled production script with only the platform identifiers", () => {
    const targetDocument = document.implementation.createHTMLDocument();
    const options = {
      document: targetDocument,
      origin: "https://sm.shadow.wang",
      authKey: "synthetic-key",
    };

    expect(installVibeCafeTelemetry(options)).toBe(true);
    expect(installVibeCafeTelemetry(options)).toBe(true);
    const scripts = targetDocument.querySelectorAll("script[data-vc-product-id]");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://vibecafe.ai/telemetry/v1.js");
    expect(scripts[0].crossOrigin).toBe("anonymous");
    expect(scripts[0].dataset.vcAuthKey).toBe("synthetic-key");
    expect(scripts[0].dataset.vcProductId).toBe("cmui558e400000agml82y2kn1");
  });
});
