import { createClient } from "@supabase/supabase-js";

const OBJECT_PATH = "shadow-mate/privacy-policy.html";
const MAX_CONTENT_BYTES = 64 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Headers": "content-type, x-privacy-publish-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function readSecret(name: string, fallbackName: string) {
  const raw = Deno.env.get(name) || Deno.env.get(fallbackName);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default || Object.values(parsed)[0] || null;
  } catch {
    return raw;
  }
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sameSecret(left: string, right: string) {
  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)]);
  if (leftDigest.length !== rightDigest.length) return false;
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest.charCodeAt(index) ^ rightDigest.charCodeAt(index);
  }
  return difference === 0;
}

async function publishPrivacyPolicy(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ code: "method_not_allowed" }, 405);
  }

  const configuredToken = Deno.env.get("PRIVACY_POLICY_PUBLISH_TOKEN");
  const suppliedToken = request.headers.get("x-privacy-publish-token");
  if (!configuredToken || !suppliedToken || !(await sameSecret(configuredToken, suppliedToken))) {
    return jsonResponse({ code: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = readSecret("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) {
    return jsonResponse({ code: "publish_not_configured" }, 503);
  }

  let payload: { content?: unknown; sha256?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ code: "invalid_json" }, 400);
  }

  if (typeof payload.content !== "string" || typeof payload.sha256 !== "string") {
    return jsonResponse({ code: "invalid_payload" }, 400);
  }

  const contentBytes = new TextEncoder().encode(payload.content);
  if (contentBytes.byteLength === 0 || contentBytes.byteLength > MAX_CONTENT_BYTES) {
    return jsonResponse({ code: "invalid_content_size" }, 413);
  }

  const sha256 = await digest(payload.content);
  if (sha256 !== payload.sha256) {
    return jsonResponse({ code: "content_hash_mismatch" }, 400);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.storage.from("legal").upload(
    OBJECT_PATH,
    new Blob([contentBytes], { type: "text/html; charset=utf-8" }),
    { cacheControl: "0", contentType: "text/html; charset=utf-8", upsert: true },
  );
  if (error) {
    return jsonResponse({ code: "storage_upload_failed" }, 502);
  }

  return jsonResponse({
    objectPath: OBJECT_PATH,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/legal/${OBJECT_PATH}`,
    sha256,
  });
}

Deno.serve(publishPrivacyPolicy);
