function classifyError(error = {}) {
  const status = Number(error.status || error.code);
  const message = String(error.message || error.error_description || "").toLowerCase();
  if (status === 409 || message.includes("conflict") || message.includes("idempotency")) {
    return { status: "conflict", error_code: message.includes("idempotency") ? "idempotency_conflict" : "cloud_conflict", error_message: error.message || null };
  }
  if (status === 401 || status === 403 || message.includes("forbidden") || message.includes("auth_required") || message.includes("scope_invalid")) {
    return { status: "rejected", error_code: "permission_denied", error_message: error.message || null };
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { status: "rejected", error_code: error.code || "request_rejected", error_message: error.message || null };
  }
  return { status: "retryable", error_code: status === 429 ? "rate_limited" : "network_or_server_error", error_message: error.message || null };
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) return classifyError(error);
  const normalized = Array.isArray(data) ? data[0] : data;
  return { status: "confirmed", data: normalized || null };
}

async function upsert(client, table, values) {
  const result = await client.from(table).upsert(values, { onConflict: "id" }).select().single();
  if (result.error) return classifyError(result.error);
  return { status: "confirmed", data: result.data };
}

function publicDefinition(values, fields) {
  return fields.reduce((result, field) => {
    if (values?.[field] !== undefined) result[field] = values[field];
    return result;
  }, {});
}

const POINT_ITEM_FIELDS = ["id", "household_id", "name", "description", "default_points", "item_kind", "category", "icon_key", "is_active"];
const PROFILE_POINT_ITEM_FIELDS = ["household_id", "profile_id", "point_item_id", "points_override", "enabled"];
const REWARD_FIELDS = ["id", "household_id", "name", "description", "cost_points", "reward_kind", "category", "icon_key", "is_active"];
const PROFILE_REWARD_FIELDS = ["household_id", "profile_id", "reward_id", "cost_override", "enabled"];

export function createGrowthLoopTransport({ client } = {}) {
  if (!client) throw new Error("growth_loop_cloud_client_required");
  return {
    async send(event) {
      const payload = event.payload || {};
      switch (event.type) {
        case "point_item_upsert":
          return upsert(client, "learning_point_items", publicDefinition(payload.point_item, POINT_ITEM_FIELDS));
        case "profile_point_item_upsert": {
          const result = await client.from("learning_profile_point_items").upsert(publicDefinition(payload.profile_point_item, PROFILE_POINT_ITEM_FIELDS), { onConflict: "profile_id,point_item_id" }).select().single();
          return result.error ? classifyError(result.error) : { status: "confirmed", data: result.data };
        }
        case "point_record":
          return rpc(client, "learning_record_points", {
            p_profile_id: payload.profile_id,
            p_point_item_id: payload.point_item_id,
            p_delta: payload.delta,
            p_request_id: event.request_id,
            p_entry_type: payload.entry_type || "manual",
            p_note: payload.note || null,
            p_occurred_on: payload.occurred_on || new Date().toISOString().slice(0, 10),
          });
        case "reward_upsert":
          return upsert(client, "learning_rewards", publicDefinition(payload.reward, REWARD_FIELDS));
        case "profile_reward_upsert": {
          const result = await client.from("learning_profile_rewards").upsert(publicDefinition(payload.profile_reward, PROFILE_REWARD_FIELDS), { onConflict: "profile_id,reward_id" }).select().single();
          return result.error ? classifyError(result.error) : { status: "confirmed", data: result.data };
        }
        case "reward_redeem":
          return rpc(client, "learning_redeem_reward", {
            p_profile_id: payload.profile_id,
            p_reward_id: payload.reward_id,
            p_request_id: event.request_id,
          });
        case "redemption_fulfill":
          return rpc(client, "learning_fulfill_redemption", { p_redemption_id: payload.redemption_id });
        case "redemption_cancel":
          return rpc(client, "learning_cancel_redemption", {
            p_redemption_id: payload.redemption_id,
            p_request_id: event.request_id,
            p_note: payload.note || null,
          });
        case "activity_event":
          return rpc(client, "learning_record_activity_event", { p_event: payload.event });
        default:
          return { status: "rejected", error_code: "event_type_invalid", error_message: event.type };
      }
    },
  };
}

function rowsOrEmpty(result) {
  return result?.error ? [] : result?.data || [];
}

export async function fetchGrowthLoopSnapshot(client, { householdId, profileId }) {
  const profileFilter = (query) => query.eq("profile_id", profileId);
  const [pointItems, profilePointItems, rewards, profileRewards, ledger, redemptions] = await Promise.all([
    client.from("learning_point_items").select("*").eq("household_id", householdId).eq("is_active", true),
    profileFilter(client.from("learning_profile_point_items").select("*")),
    client.from("learning_rewards").select("*").eq("household_id", householdId).eq("is_active", true),
    profileFilter(client.from("learning_profile_rewards").select("*")),
    profileFilter(client.from("learning_point_ledger").select("*")),
    profileFilter(client.from("learning_redemptions").select("*")),
  ]);
  const errors = [pointItems, profilePointItems, rewards, profileRewards, ledger, redemptions]
    .map((result) => result?.error)
    .filter(Boolean);
  return {
    snapshot: {
      schema_version: 1,
      scope: { household_id: householdId, profile_id: profileId },
      point_items: rowsOrEmpty(pointItems),
      profile_point_items: rowsOrEmpty(profilePointItems),
      rewards: rowsOrEmpty(rewards),
      profile_rewards: rowsOrEmpty(profileRewards),
      ledger: rowsOrEmpty(ledger).map((row) => ({ ...row, status: "confirmed" })),
      redemptions: rowsOrEmpty(redemptions),
    },
    errors,
  };
}
