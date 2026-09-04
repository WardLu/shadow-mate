import { describe, expect, it } from "vitest";
import {
  getPiperResourcePackage,
  isActivePiperCdnVoicePackage,
  validatePiperResourcePackages,
} from "../../src/piper-resource-registry.js";

const RUNTIME_FILES = [
  ["/piper-tts-web.js", 46656168, "c35588fad691ed023215f0194e0fb0e816b9a9766d3d2669dd49d4ea2fffd712"],
  ["/onnx/ort-wasm-simd-threaded.wasm", 11246032, "207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea"],
  ["/piper/piper_phonemize.wasm", 629166, "2189e43490744c95445e251c38a47063f2ca266bcc30bbb18f692c47ff2bfd23"],
  ["/piper/piper_phonemize.data", 18077249, "a9879123581336fc36ae3706ae81c9e67becc388b80b8a4943cef2a78542e6aa"],
];

function bundledRuntimeFixture() {
  return structuredClone(getPiperResourcePackage("piper-browser-runtime"));
}

describe("bundled Piper runtime registry", () => {
  it("accepts the audited runtime and retains all bundled file fingerprints", () => {
    const runtime = bundledRuntimeFixture();

    expect(() => validatePiperResourcePackages([runtime])).not.toThrow();
    expect(runtime.files.map(({ url, bytes, sha256 }) => [url, bytes, sha256])).toEqual(RUNTIME_FILES);
  });

  it("rejects a bundled app-shell runtime without audit when release approval is false", () => {
    const runtime = bundledRuntimeFixture();
    runtime.releaseApproved = false;
    delete runtime.audit;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/audit/i);
  });

  it("accepts the approved Chinese CDN package with its exact resource fingerprints", () => {
    const chinese = structuredClone(getPiperResourcePackage("zh_CN-chaowen-medium"));

    expect(() => validatePiperResourcePackages([chinese])).not.toThrow();
    expect(isActivePiperCdnVoicePackage(chinese)).toBe(true);
    expect(chinese).toMatchObject({
      id: "zh_CN-chaowen-medium",
      locale: "zh-CN",
      version: "1",
      baseUrl: "https://voice.shadow.wang/piper/zh_CN-chaowen-medium",
      totalBytes: 63224911,
      releaseApproved: true,
      licenseStatus: "approved",
      provenance: { status: "verified" },
      distribution: { status: "approved", channel: "public-cdn" },
    });
    expect(chinese.files.map(({ suffix, bytes, sha256 }) => [suffix, bytes, sha256])).toEqual([
      [".onnx", 63221984, "820d64ac16048fbcf38dd0823d37fab5f5e0c2bd71b01ca5a50f553fac19e746"],
      [".onnx.json", 2927, "a6bb2caafa0645642f13cbf7e2f6fbbb16fded66e51109fc26d622f6472fa16f"],
    ]);
  });

  it("rejects a bundled runtime component without a fixed source commit", () => {
    const runtime = bundledRuntimeFixture();
    delete runtime.audit?.components?.[0]?.commit;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/commit/i);
  });

  it("rejects a bundled runtime component without a commit-pinned source reference", () => {
    const runtime = bundledRuntimeFixture();
    if (runtime.audit?.components?.[0]) {
      runtime.audit.components[0].source = "https://github.com/Poket-Jony/piper-tts-web";
    }

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/reference/i);
  });

  it("rejects a bundled runtime component without concrete redistribution terms", () => {
    const runtime = bundledRuntimeFixture();
    delete runtime.audit?.components?.[0]?.redistributionTerms;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/redistribution/i);
  });

  it("rejects an audit that omits or adds a required component", () => {
    const missing = bundledRuntimeFixture();
    missing.audit.components = missing.audit.components.slice(0, 1);
    expect(() => validatePiperResourcePackages([missing])).toThrow(/component set/i);

    const extra = bundledRuntimeFixture();
    extra.audit.components.push({ ...extra.audit.components[0], name: "unreviewed-runtime" });
    expect(() => validatePiperResourcePackages([extra])).toThrow(/component set/i);
  });

  it("rejects mutable versions and arbitrary commits instead of accepting their shape", () => {
    const latest = bundledRuntimeFixture();
    latest.audit.components[0].version = "latest";
    expect(() => validatePiperResourcePackages([latest])).toThrow(/version/i);

    const wrongCommit = bundledRuntimeFixture();
    wrongCommit.audit.components[0].commit = "a".repeat(40);
    expect(() => validatePiperResourcePackages([wrongCommit])).toThrow(/commit/i);
  });

  it("rejects unexpected source and license URLs even when they contain a commit", () => {
    const runtime = bundledRuntimeFixture();
    const component = runtime.audit.components[0];
    component.source = `https://example.test/${component.commit}`;
    component.licenseUrl = `https://example.test/${component.commit}/LICENSE`;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/reference/i);
  });

  it("rejects an unapproved license, missing local license text, and trivial terms", () => {
    const unapproved = bundledRuntimeFixture();
    unapproved.audit.components[0].license = { status: "pending", name: "MIT" };
    expect(() => validatePiperResourcePackages([unapproved])).toThrow(/license/i);

    const missingText = bundledRuntimeFixture();
    missingText.audit.components[0].licenseTextPaths = [];
    expect(() => validatePiperResourcePackages([missingText])).toThrow(/license text/i);

    const trivialTerms = bundledRuntimeFixture();
    trivialTerms.audit.components[0].redistributionTerms = "x";
    expect(() => validatePiperResourcePackages([trivialTerms])).toThrow(/redistribution/i);
  });
});
