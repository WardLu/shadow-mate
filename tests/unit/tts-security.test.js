import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function parseCsp(value) {
  return Object.fromEntries(
    value
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources])
  );
}

describe("offline Piper speech security contract", () => {
  test("allows WASM initialization and blob-backed local model reads", async () => {
    const vercel = JSON.parse(await readFile(resolve(root, "vercel.json"), "utf8"));
    const header = vercel.headers
      .flatMap((rule) => rule.headers || [])
      .find((item) => item.key.toLowerCase() === "content-security-policy");
    const csp = parseCsp(header.value);

    expect(csp["script-src"]).toContain("'wasm-unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["connect-src"]).toContain("blob:");
  });

  test("declares the standard mobile web app capability", async () => {
    const html = await readFile(resolve(root, "index.html"), "utf8");

    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">');
  });
});
