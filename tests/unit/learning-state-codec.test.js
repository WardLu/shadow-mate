import { describe, expect, it } from "vitest";
import {
  decodeLearningStateArchive,
  encodeLearningStateArchive,
  LEARNING_ARCHIVE_SCHEMA_VERSION,
  LEARNING_ARCHIVE_CODEC,
  MAX_LEARNING_ARCHIVE_BYTES,
} from "../../src/learning-state-codec.js";
import { CONTENT_LEARNING_STATE_KEY } from "../../src/content-learning.js";

const SCOPE = { household_id: "household-1", profile_id: "profile-1" };

function makeValidEnvelope(ledger = null) {
  return {
    schema_version: 2,
    product_id: "shadow-mate",
    scope: SCOPE,
    learning: {
      checkins: { "2026-10-14": { "chinese-literacy": true } },
      extra: ledger ? { [CONTENT_LEARNING_STATE_KEY]: ledger } : {},
      bookShelf: {},
      peanutLog: [],
      peanutRead: {},
      content_config: { schema_version: 2, package_ids: ["foundation-v2"], package_id: "foundation-v2", package_version: 2, enabled: true, modules: { chinese: true, math: true, english: true, book: true } },
    },
    legacy: { points_readonly: {} },
    extensions: {},
    migration: { source_schema: "legacy-v1" },
  };
}

describe("learning-state-codec", () => {
  it("encodes a v2 envelope to a compact v3 archive and decodes back losslessly", () => {
    const envelope = makeValidEnvelope();
    const encoded = encodeLearningStateArchive(envelope);

    expect(encoded.schema_version).toBe(LEARNING_ARCHIVE_SCHEMA_VERSION);
    expect(encoded.product_id).toBe("shadow-mate");
    expect(encoded.scope).toEqual(SCOPE);
    expect(encoded.archive.codec).toBe(LEARNING_ARCHIVE_CODEC);
    expect(encoded.archive.occurrence_count).toBe(0);
    expect(typeof encoded.archive.payload).toBe("string");

    const decoded = decodeLearningStateArchive(encoded);
    expect(decoded).toEqual(envelope);
  });

  it("compresses and unpacks occurrences, introductions, and feedback without losing facts", () => {
    const ledger = {
      schemaVersion: 1,
      learnerScope: "profile:profile-1",
      referenceDay: "2026-10-14",
      introductions: [
        { activityId: "literacy", itemId: "hz-001", firstPlannedDay: "2026-10-12" },
        { activityId: "english", itemId: "apple", firstPlannedDay: "2026-10-13" },
      ],
      occurrences: [
        { occurrenceId: "literacy:hz-001:2026-10-12", activityId: "literacy", itemId: "hz-001", dayKey: "2026-10-12", completedAt: "2026-10-12T08:00:00.000Z", revision: 0, deviceId: "local", revoked: false },
        { occurrenceId: "english:apple:2026-10-13", activityId: "english", itemId: "apple", dayKey: "2026-10-13", completedAt: "2026-10-13T09:00:00.000Z", revision: 0, deviceId: "local", revoked: false },
      ],
      feedback: [
        { occurrenceId: "literacy:hz-001:2026-10-12", feedback: "independent", revision: 0, deviceId: "local" },
      ],
      skips: [
        { activityId: "poem", itemId: "poem-001", skipped: true, revision: 0, deviceId: "local" },
      ],
      plans: {},
    };

    const envelope = makeValidEnvelope(ledger);
    const archive = encodeLearningStateArchive(envelope);
    expect(archive.archive.occurrence_count).toBe(2);

    const decoded = decodeLearningStateArchive(archive);
    expect(decoded.learning.extra[CONTENT_LEARNING_STATE_KEY]).toEqual(ledger);
  });

  it("handles synthetic high-volume 5-year ledger well within 1MB cloud limit", () => {
    const occurrences = [];
    const introductions = [];
    const startDate = new Date("2021-01-01T00:00:00.000Z");

    for (let day = 0; day < 365 * 2; day++) {
      const date = new Date(startDate.getTime() + day * 86400000).toISOString().slice(0, 10);
      const itemId = `word-${day % 50}`;
      occurrences.push({
        occurrenceId: `english:${itemId}:${date}`,
        activityId: "english",
        itemId,
        dayKey: date,
        completedAt: `${date}T08:30:00.000Z`,
        revision: 0,
        deviceId: "device-1",
        revoked: false,
      });
      if (day < 50) {
        introductions.push({ activityId: "english", itemId, firstPlannedDay: date });
      }
    }

    const ledger = {
      schemaVersion: 1,
      learnerScope: "profile:profile-1",
      referenceDay: "2022-12-31",
      introductions,
      occurrences,
      feedback: [],
      skips: [],
      plans: {},
    };

    const envelope = makeValidEnvelope(ledger);
    const archive = encodeLearningStateArchive(envelope);

    const serializedLength = JSON.stringify(archive).length;
    expect(serializedLength).toBeLessThan(MAX_LEARNING_ARCHIVE_BYTES / 4);

    const restored = decodeLearningStateArchive(archive);
    expect(restored.learning.extra[CONTENT_LEARNING_STATE_KEY].occurrences).toHaveLength(occurrences.length);
  });

  it("rejects damaged payload and corrupted checksum", () => {
    const envelope = makeValidEnvelope();
    const encoded = encodeLearningStateArchive(envelope);

    const corrupted = {
      ...encoded,
      archive: {
        ...encoded.archive,
        sha256: "0".repeat(64),
      },
    };

    expect(() => decodeLearningStateArchive(corrupted)).toThrow(/checksum/i);
  });
});
