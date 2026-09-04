import { describe, expect, it } from "vitest";
import { patchWasmInitialMemory } from "../../scripts/patch-sherpa-wasm-memory.mjs";

describe("sherpa-onnx mobile WASM memory patch", () => {
  it("replaces the unique shared-memory minimum while preserving the binary length", () => {
    const source = Uint8Array.from([0, 97, 3, 0x80, 0x40, 0x80, 0x80, 0x02, 98]);
    const patched = patchWasmInitialMemory(source, { fromPages: 8192, toPages: 4096, maximumPages: 32768 });

    expect([...patched]).toEqual([0, 97, 3, 0x80, 0x20, 0x80, 0x80, 0x02, 98]);
    expect(patched).toHaveLength(source.length);
    expect([...source]).toEqual([0, 97, 3, 0x80, 0x40, 0x80, 0x80, 0x02, 98]);
  });

  it("fails closed when the expected memory declaration is missing or ambiguous", () => {
    expect(() => patchWasmInitialMemory(Uint8Array.from([0, 1, 2]))).toThrow(/exactly once/i);
    const duplicated = Uint8Array.from([
      3, 0x80, 0x40, 0x80, 0x80, 0x02,
      3, 0x80, 0x40, 0x80, 0x80, 0x02,
    ]);
    expect(() => patchWasmInitialMemory(duplicated)).toThrow(/exactly once/i);
  });
});
