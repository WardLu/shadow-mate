function normalizePathList(paths) {
  return [...new Set((Array.isArray(paths) ? paths : []).filter((path) => typeof path === "string" && path.length > 0))].sort();
}

function normalizeCount(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

export function parseAheadBehind(value) {
  const tokens = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 2 || tokens.some((token) => !/^\d+$/.test(token))) {
    throw new Error(`Invalid rev-list count: ${String(value)}`);
  }
  return {
    ahead: Number(tokens[0]),
    behind: Number(tokens[1]),
  };
}

export function buildIntegrationReport({
  head,
  base,
  mergeBase = null,
  baseResolved = true,
  ahead = 0,
  behind = 0,
  featurePaths = [],
  basePaths = [],
}) {
  const normalizedFeaturePaths = normalizePathList(featurePaths);
  const normalizedBasePaths = normalizePathList(basePaths);
  const featurePathSet = new Set(normalizedFeaturePaths);
  const overlapPaths = normalizedBasePaths.filter((path) => featurePathSet.has(path));
  const normalizedAhead = normalizeCount(ahead, "ahead");
  const normalizedBehind = normalizeCount(behind, "behind");
  const hasMergeBase = typeof mergeBase === "string" && mergeBase.length > 0;
  const reasonCodes = [];

  if (!baseResolved) reasonCodes.push("BASE_REF_MISSING");
  else if (!hasMergeBase) reasonCodes.push("NO_COMMON_BASE");
  if (normalizedBehind > 0) reasonCodes.push("BASE_AHEAD_OF_HEAD");
  if (overlapPaths.length > 0) reasonCodes.push("OVERLAPPING_PATHS");

  let status = "up_to_date";
  if (!baseResolved) status = "base_missing";
  else if (!hasMergeBase) status = "no_common_base";
  else if (normalizedBehind > 0) status = "integration_required";
  else if (overlapPaths.length > 0) status = "overlap_detected";

  return {
    schemaVersion: 1,
    head: String(head ?? ""),
    base: String(base ?? ""),
    baseResolved: Boolean(baseResolved),
    mergeBase: hasMergeBase ? mergeBase : null,
    ahead: normalizedAhead,
    behind: normalizedBehind,
    featurePaths: normalizedFeaturePaths,
    basePaths: normalizedBasePaths,
    overlapPaths,
    needsIntegration: !baseResolved || !hasMergeBase || normalizedBehind > 0,
    status,
    reasonCodes,
  };
}

export function strictExitCode(report, { strict = false } = {}) {
  if (!strict) return 0;
  if (!report.baseResolved || !report.mergeBase) return 2;
  return report.needsIntegration ? 1 : 0;
}

export function formatIntegrationReport(report) {
  const lines = [
    "Shadow Mate integration check",
    `HEAD: ${report.head}`,
    `Base: ${report.base}`,
    `Merge base: ${report.mergeBase ?? "unresolved"}`,
    `Ahead/behind: ${report.ahead}/${report.behind}`,
    `Status: ${report.status}`,
  ];

  if (report.reasonCodes.length > 0) {
    lines.push(`Reasons: ${report.reasonCodes.join(", ")}`);
  }
  if (report.overlapPaths.length > 0) {
    lines.push("Overlapping paths:");
    lines.push(...report.overlapPaths.map((path) => `- ${path}`));
  }
  if (report.needsIntegration) {
    lines.push("Action: integrate the target base in an isolated worktree before acceptance or PR update.");
  } else {
    lines.push("Action: no base integration is required by this report.");
  }
  return lines.join("\n");
}
