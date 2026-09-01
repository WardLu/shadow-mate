import { describe, expect, it } from "vitest";
import { resolveCloudConfig } from "../../src/config.js";

const localKey = "sb_publishable_local_test_key";

describe("cloud environment safety", () => {
  it("defaults a local origin to loopback without silently enabling cloud access", () => {
    const config = resolveCloudConfig({ hostname: "127.0.0.1", env: {} });

    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.supabasePublishableKey).toBe("");
    expect(config.connectionBlocked).toBe(false);
    expect(config.authRedirectOrigin).toBeNull();
  });

  it("allows an explicitly configured local Supabase key", () => {
    const config = resolveCloudConfig({
      hostname: "localhost",
      env: {
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_PUBLISHABLE_KEY: localKey,
      },
    });

    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.supabasePublishableKey).toBe(localKey);
    expect(config.connectionBlocked).toBe(false);
    expect(config.authRedirectOrigin).toBeNull();
  });

  it("blocks an explicitly configured remote target on a local origin", () => {
    const config = resolveCloudConfig({
      hostname: "127.0.0.1",
      env: {
        VITE_SUPABASE_URL: "https://dutepjyocxcvecmsrtfp.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_remote_test_key",
      },
    });

    expect(config.supabaseUrl).toBe("");
    expect(config.supabasePublishableKey).toBe("");
    expect(config.connectionBlocked).toBe(true);
    expect(config.connectionError).toBe("remote_supabase_blocked");
    expect(config.authRedirectOrigin).toBeNull();
  });

  it("blocks remote Supabase on a preview origin by default", () => {
    const config = resolveCloudConfig({
      hostname: "shadow-mate-preview.vercel.app",
      env: { VITE_SUPABASE_URL: "https://staging.example.test" },
    });

    expect(config.connectionBlocked).toBe(true);
    expect(config.supabaseUrl).toBe("");
  });

  it("requires an explicit override before a non-production origin can use remote Supabase", () => {
    const config = resolveCloudConfig({
      hostname: "127.0.0.1",
      env: {
        VITE_SUPABASE_URL: "https://dutepjyocxcvecmsrtfp.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_remote_test_key",
        VITE_SHADOW_ALLOW_PRODUCTION_SUPABASE: "1",
      },
    });

    expect(config.supabaseUrl).toBe("https://dutepjyocxcvecmsrtfp.supabase.co");
    expect(config.supabasePublishableKey).toBe("sb_publishable_remote_test_key");
    expect(config.connectionBlocked).toBe(false);
    expect(config.authRedirectOrigin).toBe("https://sm.shadow.wang");
  });

  it("allows production defaults only on the production hostname", () => {
    const config = resolveCloudConfig({ hostname: "sm.shadow.wang", env: {} });

    expect(config.supabaseUrl).toBe("https://dutepjyocxcvecmsrtfp.supabase.co");
    expect(config.supabasePublishableKey).toMatch(/^sb_publishable_/);
    expect(config.connectionBlocked).toBe(false);
    expect(config.authRedirectOrigin).toBe("https://sm.shadow.wang");
  });
});
