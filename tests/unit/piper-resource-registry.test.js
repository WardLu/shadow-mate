import { describe, expect, it } from "vitest";
import {
  getPiperResourcePackage,
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
});
