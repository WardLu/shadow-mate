import { describe, expect, it } from "vitest";
import { getPiperResourcePackage } from "../../src/piper-resource-registry.js";
import { assertApprovedCdnPackage, assertCors } from "../../scripts/piper-resource-smoke.mjs";

const VALID_CORS_HEADERS = {
  "access-control-allow-origin": "https://preview-sm.shadow.wang",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
};

function response(headers) {
  return new Response(null, { headers });
}

describe("Piper CDN CORS gate", () => {
  it("requires approved license, provenance, and distribution metadata for every active CDN package", () => {
    const approved = getPiperResourcePackage("en_US-ljspeech-medium");
    expect(() => assertApprovedCdnPackage(approved)).not.toThrow();
    expect(() => assertApprovedCdnPackage({ ...approved, licenseStatus: "pending" })).toThrow(/license/i);
    expect(() => assertApprovedCdnPackage({ ...approved, provenance: { status: "partial" } })).toThrow(/provenance/i);
    expect(() => assertApprovedCdnPackage({ ...approved, distribution: { status: "blocked" } })).toThrow(/distribution/i);
    expect(() => assertApprovedCdnPackage(getPiperResourcePackage("zh_CN-chaowen-medium"))).not.toThrow();
  });

  it("accepts an expected Preview origin with all required methods and exposed headers", () => {
    expect(() => assertCors(response(VALID_CORS_HEADERS), "GET", "https://voice.example.test/model.onnx")).not.toThrow();
  });

  it("rejects unrelated allowed origins even when methods are present", () => {
    expect(() => assertCors(response({ ...VALID_CORS_HEADERS, "access-control-allow-origin": "https://unrelated.example.test" }), "GET", "https://voice.example.test/model.onnx")).toThrow(/Access-Control-Allow-Origin/);
  });

  it("rejects CORS responses that omit a required method", () => {
    expect(() => assertCors(response({ ...VALID_CORS_HEADERS, "access-control-allow-methods": "GET, HEAD" }), "GET", "https://voice.example.test/model.onnx")).toThrow(/Access-Control-Allow-Methods/);
  });

  it("rejects CORS responses that omit required exposed headers", () => {
    expect(() => assertCors(response({ ...VALID_CORS_HEADERS, "access-control-expose-headers": "Content-Length" }), "GET", "https://voice.example.test/model.onnx")).toThrow(/Access-Control-Expose-Headers/);
  });
});
