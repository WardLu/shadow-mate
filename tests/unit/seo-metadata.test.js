import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("public SEO and GEO contract", () => {
  test("connects the branded visible heading and application entity to Shadow Nexus", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

    expect(html).toContain("<h1>影伴 Shadow Mate</h1>");
    expect(html).toContain('<div class="sub">家庭成长工作台 · 陪伴有方法，成长有动力</div>');
    expect(match).not.toBeNull();

    const schema = JSON.parse(match[1]);
    const application = schema["@graph"].find((item) => item["@type"] === "WebApplication");
    expect(application["@id"]).toBe("https://sm.shadow.wang/#application");
    expect(application.softwareVersion).toBe("1.4.0");
    expect(application.publisher).toEqual({
      "@type": "Organization",
      "@id": "https://shadow.wang/#organization",
      name: "Shadow Nexus",
      url: "https://shadow.wang/",
    });
  });
});
