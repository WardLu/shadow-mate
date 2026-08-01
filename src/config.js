const env = import.meta.env ?? {};

export const CLOUD_CONFIG = Object.freeze({
  productId: "shadow-mate",
  supabaseUrl: env.VITE_SUPABASE_URL || "https://dutepjyocxcvecmsrtfp.supabase.co",
  supabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_XmaIi9ud-k704g0aB9ZKcw_8KluvUWw",
  authAccountDeletionEnabled: env.VITE_SUPABASE_AUTH_ACCOUNT_DELETION === "1"
});
