import { describe, expect, it } from "vitest";
import { buildTestDatabaseUrl } from "../../scripts/test-shared-db.mjs";

const localDatabaseUrl = [
  "postgresql://",
  "postgres",
  ":",
  "postgres",
  "@127.0.0.1:54322/postgres",
].join("");

describe("shared database pgTAP connection", () => {
  it("keeps the raw local URL and disables SSL for Supabase CLI", () => {
    expect(buildTestDatabaseUrl(localDatabaseUrl)).toBe(
      `${localDatabaseUrl}?sslmode=disable`,
    );
  });

  it("overrides an existing SSL mode without encoding the whole URL", () => {
    const localDatabaseUrlWithOptions = `${localDatabaseUrl}?sslmode=require&connect_timeout=10`;

    expect(
      buildTestDatabaseUrl(localDatabaseUrlWithOptions),
    ).toBe(`${localDatabaseUrl}?sslmode=disable&connect_timeout=10`);
  });
});
