import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "shadow-mate";
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function projectRef(supabaseUrl: string) {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

async function deleteAccount(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ code: "method_not_allowed" }, 405);
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = readSecret("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = readSecret("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

  if (!token || !supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ code: "account_deletion_not_configured" }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ code: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: products, error: registryError } = await admin
    .from("projects")
    .select("project_id");
  if (registryError) {
    return jsonResponse({ code: "account_deletion_not_configured" }, 503);
  }

  const registryIsShadowMateOnly =
    products?.length === 1 && products[0]?.project_id === PRODUCT_ID;
  const configuredRef = Deno.env.get("SHADOW_MATE_AUTH_PROJECT_REF");
  const isolated = Deno.env.get("SHADOW_MATE_AUTH_PROJECT_ISOLATED") === "true";
  const currentRef = projectRef(supabaseUrl);

  // Supabase Auth is project-wide. A shared project must never delete an
  // identity because that identity may also be used by another product.
  if (!registryIsShadowMateOnly || !isolated || !configuredRef || configuredRef !== currentRef) {
    return jsonResponse({
      code: "auth_identity_deletion_not_isolated",
      message: "Shadow Mate account deletion is disabled until this Supabase project is isolated.",
    }, 409);
  }

  const { error: revokeError } = await admin.auth.admin.signOut(userData.user.id, "global");
  if (revokeError) {
    return jsonResponse({ code: "account_session_revoke_failed" }, 502);
  }

  const { data: households, error: householdLookupError } = await userClient
    .from("learning_households")
    .select("id")
    .eq("project_id", PRODUCT_ID)
    .eq("owner_user_id", userData.user.id);
  if (householdLookupError) {
    return jsonResponse({ code: "account_data_delete_failed" }, 502);
  }

  for (const household of households || []) {
    const { error: dataError } = await userClient.rpc("learning_delete_household", {
      p_household_id: household.id,
    });
    if (dataError) {
      return jsonResponse({ code: "account_data_delete_failed" }, 502);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id, false);
  if (deleteError) {
    return jsonResponse({ code: "auth_identity_delete_failed" }, 502);
  }

  return jsonResponse({ deleted: true });
}

Deno.serve(deleteAccount);
