import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};
const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_EMAIL_LENGTH = 320;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

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

function requestKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function isRateLimited(request: Request) {
  const now = Date.now();
  const key = requestKey(request);
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_MINUTE;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function checkAuthEmail(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ code: "method_not_allowed" }, 405);
  }
  if (isRateLimited(request)) {
    return jsonResponse({ code: "rate_limited" }, 429);
  }

  let payload: { email?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ code: "invalid_request" }, 400);
  }

  if (typeof payload.email !== "string" || payload.email.length > MAX_EMAIL_LENGTH) {
    return jsonResponse({ code: "invalid_email" }, 400);
  }

  const email = normalizeEmail(payload.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse({ code: "invalid_email" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = readSecret("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) {
    return jsonResponse({ code: "auth_lookup_unavailable" }, 503);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      return jsonResponse({ code: "auth_lookup_unavailable" }, 503);
    }

    const users = data.users || [];
    const registered = users.some((user) => normalizeEmail(user.email || "") === email);
    if (registered) return jsonResponse({ registered: true });
    if (users.length < 1000) return jsonResponse({ registered: false });
  }
}

Deno.serve(checkAuthEmail);
