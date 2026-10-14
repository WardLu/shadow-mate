import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTaskRecord, appendTaskRecord, parseArgs } from "../../scripts/testing/task-timing.mjs";

test("createTaskRecord initializes valid default task record", () => {
  const record = createTaskRecord({ taskId: "mate-task-1" });
  assert.equal(record.taskId, "mate-task-1");
  assert.equal(record.project, "mate");
  assert.equal(record.cohort, "pilot");
  assert.equal(record.synthetic, false);
  assert.equal(record.humanActiveMs, null);
});

test("createTaskRecord validates taxomony and inputs", () => {
  assert.throws(() => createTaskRecord({ taskId: "" }), /invalid_task_id/);
  assert.throws(() => createTaskRecord({ taskId: "invalid task id" }), /invalid_task_id/);
  assert.throws(() => createTaskRecord({ taskId: "valid-1", cohort: "invalid" }), /invalid_task_cohort/);
  assert.throws(() => createTaskRecord({ taskId: "valid-1", completedAt: "invalid-date" }), /invalid_task_completed_at/);
  assert.throws(() => createTaskRecord({ taskId: "valid-1", humanActiveMs: -10 }), /invalid_task_metrics/);
});

test("appendTaskRecord creates dataset and appends record cleanly", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "mate-timing-"));
  const targetFile = path.join(tmpDir, "timing-ledger.json");

  try {
    const record1 = createTaskRecord({ taskId: "task-001", humanActiveMs: 5000 });
    const dataset1 = await appendTaskRecord(targetFile, record1);
    assert.equal(dataset1.tasks.length, 1);
    assert.equal(dataset1.tasks[0].taskId, "task-001");

    const record2 = createTaskRecord({ taskId: "task-002", automationWallMs: 12000 });
    const dataset2 = await appendTaskRecord(targetFile, record2);
    assert.equal(dataset2.tasks.length, 2);

    await assert.rejects(() => appendTaskRecord(targetFile, record1), /duplicate_task_id/);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("parseArgs parses CLI arguments cleanly", () => {
  const argv = [
    "--task-id", "pr-175",
    "--project", "mate",
    "--human-active-ms", "15000",
    "--automation-wall-ms", "45000",
    "--synthetic", "false",
    "--human-caught", "true"
  ];
  const parsed = parseArgs(argv);
  assert.equal(parsed.taskId, "pr-175");
  assert.equal(parsed.project, "mate");
  assert.equal(parsed.humanActiveMs, 15000);
  assert.equal(parsed.automationWallMs, 45000);
  assert.equal(parsed.synthetic, false);
  assert.equal(parsed.humanCaught, true);
});
