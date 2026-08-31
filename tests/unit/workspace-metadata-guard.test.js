import { describe, expect, it } from "vitest";
import { isCurrentWorkspaceMetadata } from "../../src/workspace-metadata-guard.js";

describe("workspace metadata session guard", () => {
  it("rejects delayed user A consent metadata after user B becomes current", () => {
    const userASession = { access_token: "synthetic-a-token", user: { id: "user-a" } };
    const userBSession = { access_token: "synthetic-b-token", user: { id: "user-b" } };

    expect(isCurrentWorkspaceMetadata(userASession, userBSession)).toBe(false);
    expect(isCurrentWorkspaceMetadata(userBSession, userBSession)).toBe(true);
  });
});
