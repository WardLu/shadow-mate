import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const identifier = (value) => typeof value === "string" && /^[a-z0-9-]+$/.test(value);
const measured = (value) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const nullableBoolean = (value) => value === null || typeof value === "boolean";
const isTimestamp = (value) => typeof value === "string" && !isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);

export function createTaskRecord(input = {}) {
  const {
    taskId,
    project = "mate",
    kind = "logic",
    risk = "low",
    cohort = "pilot",
    synthetic = false,
    completedAt = new Date().toISOString(),
    humanActiveMs = null,
    automationWallMs = null,
    automationCostUsd = null,
    humanCaught = null,
    rework7d = null,
  } = input;

  if (typeof taskId !== "string" || !taskId.trim() || !identifier(taskId)) {
    throw new Error("invalid_task_id");
  }
  if (!identifier(project) || !identifier(kind) || !identifier(risk)) {
    throw new Error("invalid_task_taxonomy");
  }
  if (!["baseline", "pilot"].includes(cohort)) {
    throw new Error("invalid_task_cohort");
  }
  if (typeof synthetic !== "boolean") {
    throw new Error("invalid_task_synthetic");
  }
  if (!isTimestamp(completedAt)) {
    throw new Error("invalid_task_completed_at");
  }
  if (![humanActiveMs, automationWallMs, automationCostUsd].every(measured)) {
    throw new Error("invalid_task_metrics");
  }
  if (![humanCaught, rework7d].every(nullableBoolean)) {
    throw new Error("invalid_task_verdicts");
  }

  return {
    taskId,
    project,
    kind,
    risk,
    cohort,
    synthetic,
    completedAt,
    humanActiveMs,
    automationWallMs,
    automationCostUsd,
    humanCaught,
    rework7d,
  };
}

export async function appendTaskRecord(filePath, record) {
  const absolutePath = path.resolve(filePath);
  let dataset;
  try {
    const raw = await readFile(absolutePath, "utf8");
    dataset = JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      dataset = {
        schemaVersion: 1,
        asOf: new Date().toISOString(),
        minimumPerCohort: 10,
        tasks: [],
      };
    } else {
      throw error;
    }
  }

  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.tasks)) {
    throw new Error("invalid_dataset_format");
  }

  if (dataset.tasks.some((task) => task.taskId === record.taskId)) {
    throw new Error("duplicate_task_id");
  }

  dataset.tasks.push(record);
  await writeFile(absolutePath, JSON.stringify(dataset, null, 2) + "\n", "utf8");
  return dataset;
}

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") return { help: true };
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      i++;
    } else {
      options[key] = true;
    }
  }

  const parseNumber = (val) => (val === undefined || val === "null" ? null : Number(val));
  const parseBool = (val) => (val === undefined || val === "null" ? null : val === "true");

  return {
    taskId: options.taskId,
    project: options.project,
    kind: options.kind,
    risk: options.risk,
    cohort: options.cohort,
    synthetic: options.synthetic !== undefined ? options.synthetic === "true" || options.synthetic === true : undefined,
    completedAt: options.completedAt,
    humanActiveMs: parseNumber(options.humanActiveMs),
    automationWallMs: parseNumber(options.automationWallMs),
    automationCostUsd: parseNumber(options.automationCostUsd),
    humanCaught: parseBool(options.humanCaught),
    rework7d: parseBool(options.rework7d),
    appendTo: options.appendTo,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help || !parsed.taskId) {
      console.log("Usage: node scripts/testing/task-timing.mjs --task-id <id> [options]");
      console.log("Options:");
      console.log("  --project <name>            (default: mate)");
      console.log("  --kind <kind>               (default: logic)");
      console.log("  --risk <risk>               (default: low)");
      console.log("  --cohort <baseline|pilot>   (default: pilot)");
      console.log("  --synthetic <true|false>    (default: false)");
      console.log("  --completed-at <ISO>        (default: now)");
      console.log("  --human-active-ms <ms>");
      console.log("  --automation-wall-ms <ms>");
      console.log("  --automation-cost-usd <usd>");
      console.log("  --human-caught <true|false>");
      console.log("  --rework-7d <true|false>");
      console.log("  --append-to <file>");
      process.exitCode = parsed.help ? 0 : 2;
    } else {
      const record = createTaskRecord(parsed);
      if (parsed.appendTo) {
        await appendTaskRecord(parsed.appendTo, record);
        console.log(`Task ${record.taskId} recorded into ${parsed.appendTo}`);
      } else {
        console.log(JSON.stringify(record, null, 2));
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
