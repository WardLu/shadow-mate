import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://dutepjyocxcvecmsrtfp.supabase.co").replace(/\/$/, "");
const publishToken = process.env.PRIVACY_POLICY_PUBLISH_TOKEN;
const sourcePath = new URL("../privacy-policy.html", import.meta.url);
const objectPath = "shadow-mate/privacy-policy.html";

if (!publishToken) {
  throw new Error("缺少 PRIVACY_POLICY_PUBLISH_TOKEN；请先在 Supabase Edge Function secrets 中设置一次性发布令牌。");
}

const content = await readFile(sourcePath);
const sha256 = createHash("sha256").update(content).digest("hex");
const response = await fetch(`${supabaseUrl}/functions/v1/publish-privacy-policy`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-privacy-publish-token": publishToken,
  },
  body: JSON.stringify({
    content: content.toString("utf8"),
    sha256,
  }),
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`隐私页发布失败（HTTP ${response.status}）：${detail.slice(0, 500)}`);
}

const result = await response.json();
console.log(`隐私页已发布：${result.publicUrl || `${supabaseUrl}/storage/v1/object/public/legal/${objectPath}`}`);
console.log(`源文件 SHA-256：${result.sha256 || sha256}`);
