import { createHash } from "node:crypto";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const REPOSITORY_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const FORBIDDEN_KEY_PATTERN = /(?:authorization|callback[_-]?url|cookie|payload|raw|secret|signature|token|webhook)/i;
const ALLOWED_MANIFEST_KEYS = new Set([
  "schemaVersion",
  "status",
  "reason",
  "project",
  "repository",
  "releaseId",
  "commitSha",
  "packageVersion",
  "pullRequestNumber",
  "mergedAt",
  "baseRef",
  "labels",
  "handoff",
  "createdResources",
]);

const emptyResources = () => ({ issues: 0, tasks: 0 });

const skipped = (reason) => ({
  status: "skipped",
  reason,
  createdResources: emptyResources(),
});

function assertString(value, name, pattern = null) {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  if (pattern && !pattern.test(value)) throw new Error(`${name} has an invalid format`);
  return value;
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return [...new Set(labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((label) => typeof label === "string" && label.length > 0))]
    .sort();
}

export function classifyReleaseEvent({ eventName, payload }) {
  if (eventName !== "pull_request") return skipped("unsupported_event");
  if (!payload || payload.action !== "closed") return skipped("action_not_closed");

  const pullRequest = payload.pull_request;
  if (!pullRequest || pullRequest.merged !== true) return skipped("pull_request_not_merged");

  const mergeCommitSha = assertString(pullRequest.merge_commit_sha, "pull_request.merge_commit_sha", SHA_PATTERN);
  if (!Number.isInteger(pullRequest.number) || pullRequest.number < 1) {
    throw new Error("pull_request.number must be a positive integer");
  }

  return {
    status: "accepted",
    reason: "merged_pull_request",
    createdResources: emptyResources(),
    commitSha: mergeCommitSha,
    pullRequestNumber: pullRequest.number,
    mergedAt: pullRequest.merged_at ?? null,
    baseRef: pullRequest.base?.ref ?? null,
    labels: normalizeLabels(pullRequest.labels),
  };
}

export function stableReleaseId({ repository, pullRequestNumber, commitSha }) {
  assertString(repository, "repository", REPOSITORY_PATTERN);
  assertString(commitSha, "commitSha", SHA_PATTERN);
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
    throw new Error("pullRequestNumber must be a positive integer");
  }

  return createHash("sha256")
    .update(`${repository}:${pullRequestNumber}:${commitSha}`)
    .digest("hex");
}

function collectForbiddenFields(value, path = "", findings = []) {
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY_PATTERN.test(key)) findings.push(`${childPath}: forbidden sensitive field`);
    collectForbiddenFields(child, childPath, findings);
  }
  return findings;
}

export function validateReleaseManifest(manifest) {
  const findings = collectForbiddenFields(manifest);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be an object", ...findings];
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_MANIFEST_KEYS.has(key)) findings.push(`${key}: unexpected manifest field`);
  }
  if (manifest.schemaVersion !== 1) findings.push("schemaVersion must be 1");
  if (!['accepted', 'skipped'].includes(manifest.status)) findings.push("status must be accepted or skipped");
  if (!manifest.reason) findings.push("reason is required");
  if (!manifest.createdResources || manifest.createdResources.issues !== 0 || manifest.createdResources.tasks !== 0) {
    findings.push("createdResources must contain zero issues and tasks");
  }

  if (manifest.status === "accepted") {
    if (manifest.project !== "shadow-mate") findings.push("project must be shadow-mate");
    if (!REPOSITORY_PATTERN.test(manifest.repository || "")) findings.push("repository has an invalid format");
    if (!SHA256_PATTERN.test(manifest.releaseId || "")) findings.push("releaseId must be a SHA-256 hex string");
    if (!SHA_PATTERN.test(manifest.commitSha || "")) findings.push("commitSha must be a Git SHA");
    if (!VERSION_PATTERN.test(manifest.packageVersion || "")) findings.push("packageVersion must be semver");
    if (!Number.isInteger(manifest.pullRequestNumber) || manifest.pullRequestNumber < 1) {
      findings.push("pullRequestNumber must be a positive integer");
    }
    if (!manifest.handoff || manifest.handoff.target !== "shadow-portal") {
      findings.push("handoff.target must be shadow-portal");
    }
    if (manifest.handoff?.mode !== "proposal-only") findings.push("handoff.mode must be proposal-only");
    if (manifest.handoff?.migrationDecision !== "control-plane-review-required") {
      findings.push("handoff.migrationDecision must require control-plane review");
    }
    if (manifest.handoff?.productionAction !== "not_started") {
      findings.push("handoff.productionAction must be not_started");
    }
  }

  return [...new Set(findings)];
}

export function createReleaseManifest({ eventName, payload, repository, packageVersion }) {
  const classification = classifyReleaseEvent({ eventName, payload });
  if (classification.status === "skipped") {
    return {
      schemaVersion: 1,
      status: classification.status,
      reason: classification.reason,
      createdResources: classification.createdResources,
    };
  }

  assertString(repository, "repository", REPOSITORY_PATTERN);
  assertString(packageVersion, "packageVersion", VERSION_PATTERN);
  const manifest = {
    schemaVersion: 1,
    status: classification.status,
    reason: classification.reason,
    project: "shadow-mate",
    repository,
    releaseId: stableReleaseId({
      repository,
      pullRequestNumber: classification.pullRequestNumber,
      commitSha: classification.commitSha,
    }),
    commitSha: classification.commitSha,
    packageVersion,
    pullRequestNumber: classification.pullRequestNumber,
    mergedAt: classification.mergedAt,
    baseRef: classification.baseRef,
    labels: classification.labels,
    handoff: {
      target: "shadow-portal",
      mode: "proposal-only",
      migrationDecision: "control-plane-review-required",
      productionAction: "not_started",
    },
    createdResources: classification.createdResources,
  };

  const findings = validateReleaseManifest(manifest);
  if (findings.length) throw new Error(`Release manifest is invalid:\n- ${findings.join("\n- ")}`);
  return manifest;
}
