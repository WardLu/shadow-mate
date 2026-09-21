import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("public SEO and GEO contract", () => {
  test("connects the branded visible heading and application entity to Shadow Lab", async () => {
    const html = await readFile(resolve(process.cwd(), "index.html"), "utf8");
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

    expect(html).toContain("<h1>影伴 Shadow Mate</h1>");
    expect(html).toContain('<div class="sub">家庭成长工作台 · 陪伴有方法，成长有动力</div>');
    expect(match).not.toBeNull();

    const schema = JSON.parse(match[1]);
    const application = schema["@graph"].find((item) => item["@type"] === "WebApplication");
    expect(application["@id"]).toBe("https://sm.shadow.wang/#application");
    expect(application.softwareVersion).toBe("1.5.4");
    expect(application.datePublished).toBe("2026-08-01T08:00:00+08:00");
    expect(application.dateModified).toBeTruthy();
    expect(application.publisher).toEqual({
      "@type": "Organization",
      "@id": "https://shadow.wang/#organization",
      name: "Shadow Lab",
      url: "https://shadow.wang/",
    });

    // Baidu mobile adaptation & cache-control
    expect(html).toContain('<meta name="applicable-device" content="pc,mobile">');
    expect(html).toContain('<meta http-equiv="Cache-Control" content="no-transform">');
    expect(html).toContain('<meta property="article:published_time"');
    expect(html).toContain('<meta property="article:modified_time"');

    // FAQPage schema coverage
    const faqPage = schema["@graph"].find((item) => item["@type"] === "FAQPage");
    expect(faqPage).toBeDefined();
    expect(faqPage.mainEntity.length).toBeGreaterThanOrEqual(4);
    const questions = faqPage.mainEntity.map((q) => q.name);
    expect(questions.some((q) => q.includes("字帖"))).toBe(true);
    expect(questions.some((q) => q.includes("隐私"))).toBe(true);
  });

  test("provides llms.txt and llms-full.txt in public directory for GEO engines", async () => {
    const llms = await readFile(resolve(process.cwd(), "public/llms.txt"), "utf8");
    const llmsFull = await readFile(resolve(process.cwd(), "public/llms-full.txt"), "utf8");

    expect(llms).toContain("https://sm.shadow.wang/");
    expect(llms).toContain("Shadow Lab");
    expect(llmsFull).toContain("田字格");
    expect(llmsFull).toContain("Local-First");
  });
});
