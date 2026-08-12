import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recovery = readFileSync(resolve(process.cwd(), "supabase/templates/recovery.html"), "utf8");
const confirmation = readFileSync(resolve(process.cwd(), "supabase/templates/confirmation.html"), "utf8");
const magicLink = readFileSync(resolve(process.cwd(), "supabase/templates/magic_link.html"), "utf8");
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

const templates = [confirmation, magicLink, recovery];

describe("multi-product password recovery email", () => {
  it("maps every supported production product from RedirectTo", () => {
    expect(recovery).toContain("https://sm.shadow.wang");
    expect(recovery).toContain("https://sc.shadow.wang");
    expect(recovery).toContain("https://sbc.shadow.wang");
    expect(recovery).toContain("https://ss.shadow.wang");
    expect(recovery).toContain("影伴 Shadow Mate");
    expect(recovery).toContain("影匣 Shadow Card");
    expect(recovery).toContain("影裁 Shadow Size");
  });

  it("uses Supabase's official recovery link and a neutral fallback", () => {
    expect(recovery).toContain("{{ .ConfirmationURL }}");
    expect(recovery).toContain("Shadow Nexus");
    expect(recovery).not.toContain("password_reset_tokens");
  });

  it("registers the local recovery template", () => {
    expect(config).toContain("[auth.email.template.recovery]");
    expect(config).toContain('content_path = "./supabase/templates/recovery.html"');
  });

  it("uses the Editorial Utility shell for every Supabase Auth email", () => {
    for (const template of templates) {
      expect(template).toContain('meta name="color-scheme" content="light dark"');
      expect(template).toContain("prefers-color-scheme: dark");
      expect(template).toContain("[data-ogsc]");
      expect(template).toContain("Shadow Nexus");
      expect(template).toContain("https://shadow.wang/zh");
      expect(template).toContain("shadow_mate.svg");
      expect(template).toContain("shadow_card_logo.png");
      expect(template).toContain("shadow_size.png");
      expect(template).toContain("shadow_portal_logo.png");
      expect(template).toContain("https://shadow.wang/zh/products/shadow-mate");
      expect(template).toContain("https://shadow.wang/zh/products/shadow-card");
      expect(template).toContain("https://shadow.wang/zh/products/shadow-size");
      expect(template).not.toContain("🔐");
    }
  });

  it("preserves Supabase's auth variables for each email flow", () => {
    expect(confirmation).toContain("{{ .Token }}");
    expect(confirmation).toContain("{{ .TokenHash }}");
    expect(magicLink).toContain("{{ .Token }}");
    expect(magicLink).toContain("{{ .TokenHash }}");
    expect(recovery).toContain("{{ .ConfirmationURL }}");
  });

  it("registers all three local email templates", () => {
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
    expect(config).toContain("[auth.email.template.magic_link]");
    expect(config).toContain('content_path = "./supabase/templates/magic_link.html"');
  });

  it("uses the project name in every Auth email subject, including local development", () => {
    const subjects = config
      .split("\n")
      .filter((line) => line.startsWith("subject ="));

    expect(subjects).toHaveLength(3);

    for (const subject of subjects) {
      expect(subject).toContain("http://127.0.0.1:5173");
      expect(subject).toContain("http://localhost:5173");
      expect(subject).toContain("影伴 Shadow Mate");
      expect(subject).toContain("影匣 Shadow Card");
      expect(subject).toContain("影裁 Shadow Size");
      expect(subject).toContain("Quick flomo");
      expect(subject).toContain("Shadow Nexus");
    }
  });

  it("keeps footer links on the same environment as the Auth redirect", () => {
    for (const template of templates) {
      expect(template).toContain('href="http://localhost:3000/zh/products/shadow-mate"');
      expect(template).toContain('href="http://localhost:3000/zh"');
      expect(template).toContain('href="https://shadow-portal.vercel.app/zh/products/shadow-mate"');
      expect(template).toContain('href="https://shadow-portal.vercel.app/zh"');
      expect(template).toContain('href="https://shadow.wang/zh/products/shadow-mate"');
      expect(template).toContain('href="https://shadow.wang/zh"');
    }
  });
});
