import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recovery = readFileSync(resolve(process.cwd(), "supabase/templates/recovery.html"), "utf8");
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

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
});
