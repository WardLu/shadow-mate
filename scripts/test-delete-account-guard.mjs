const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required");
}

const email = `delete-guard-${Date.now()}@example.test`;
const password = "ShadowMate-delete-guard-2026!";
const publicHeaders = {
  apikey: publishableKey,
  "content-type": "application/json",
};

const signupResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
  method: "POST",
  headers: publicHeaders,
  body: JSON.stringify({ email, password }),
});
if (!signupResponse.ok) {
  throw new Error(`Local test user signup failed: ${signupResponse.status}`);
}

let session = await signupResponse.json();
if (!session.access_token) {
  const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: publicHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Local test user sign-in failed: ${tokenResponse.status}`);
  }
  session = await tokenResponse.json();
}

if (!session.access_token || !session.user?.id) {
  throw new Error("Local test user session is incomplete");
}

const userHeaders = {
  ...publicHeaders,
  Authorization: `Bearer ${session.access_token}`,
};

// `supabase functions serve` can report a healthy OPTIONS response before the
// Edge Function bundle has finished compiling. Warm it up with an invalid token
// first so the guarded deletion request is never retried after a transient 502.
for (let attempt = 1; attempt <= 30; attempt += 1) {
  const warmupResponse = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: "POST",
    headers: { ...publicHeaders, Authorization: "Bearer invalid-warmup-token" },
    body: "{}",
  });

  if (![502, 503, 504].includes(warmupResponse.status)) {
    break;
  }

  if (attempt === 30) {
    throw new Error(`Account deletion function did not become ready: ${warmupResponse.status}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const householdResponse = await fetch(`${supabaseUrl}/rest/v1/learning_households`, {
  method: "POST",
  headers: { ...userHeaders, Prefer: "return=representation" },
  body: JSON.stringify({
    name: "Deletion guard family",
    owner_user_id: session.user.id,
    project_id: "shadow-mate",
  }),
});
if (!householdResponse.ok) {
  throw new Error(`Local test household creation failed: ${householdResponse.status}`);
}
const [household] = await householdResponse.json();
if (!household?.id) {
  throw new Error("Local test household creation returned no row");
}

const deletionResponse = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
  method: "POST",
  headers: userHeaders,
  body: "{}",
});
const payload = await deletionResponse.json();

if (deletionResponse.status !== 409 || payload.code !== "auth_identity_deletion_not_isolated") {
  throw new Error(`Account deletion guard failed: ${deletionResponse.status} ${JSON.stringify(payload)}`);
}

const loginResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: publicHeaders,
  body: JSON.stringify({ email, password }),
});
if (!loginResponse.ok) {
  throw new Error(`Account identity was removed after guard response: ${loginResponse.status}`);
}

const remainingHouseholdResponse = await fetch(
  `${supabaseUrl}/rest/v1/learning_households?select=id&id=eq.${household.id}`,
  { headers: { ...publicHeaders, Authorization: `Bearer ${(await loginResponse.json()).access_token}` } },
);
if (!remainingHouseholdResponse.ok || (await remainingHouseholdResponse.json()).length !== 1) {
  throw new Error("Shadow Mate household was removed after guard response");
}

console.log("Account deletion isolation guard passed.");
