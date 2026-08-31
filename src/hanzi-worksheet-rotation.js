const ROTATION_SEED = "stable-local-seed";
const WORKSHEET_LAYOUT_VERSION = "focus-rows-v1";
const MAX_RETAINED_DAYS = 90;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const ROTATION_ALGORITHM_VERSION = "rotation-v1";

function stableHash(value) {
  let hash = 0x811c9dc5;

  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function compareItems(left, right) {
  return left.hash - right.hash ||
    left.order - right.order ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}

function isValidPackRef(packRef) {
  return isRecord(packRef) &&
    typeof packRef.setId === "string" && packRef.setId.length > 0 &&
    typeof packRef.contentVersion === "string" && packRef.contentVersion.length > 0;
}

function clonePackRef(packRef) {
  return isValidPackRef(packRef)
    ? { setId: packRef.setId, contentVersion: packRef.contentVersion }
    : undefined;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isValidDayKey(dayKey) {
  if (typeof dayKey !== "string" || !DAY_KEY_PATTERN.test(dayKey)) return false;
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function getRecentDayKeys(assignments, dayKey, limit) {
  return Object.keys(assignments)
    .filter((candidateDayKey) => isValidDayKey(candidateDayKey) && candidateDayKey < dayKey)
    .sort((left, right) => compareStrings(right, left))
    .slice(0, limit);
}

function getItemIdsForDays(assignments, dayKeys) {
  const itemIds = new Set();

  dayKeys.forEach((dayKey) => {
    const assignment = assignments[dayKey];
    Object.values(assignment?.candidates || {}).forEach((worksheet) => {
      worksheet.rows.forEach((row) => itemIds.add(row.itemId));
    });
  });

  return itemIds;
}

function getLastAppearanceDays(assignments) {
  const lastAppearanceDays = new Map();

  Object.keys(assignments).sort(compareStrings).forEach((dayKey) => {
    Object.values(assignments[dayKey]?.candidates || {}).forEach((worksheet) => {
      worksheet.rows.forEach((row) => lastAppearanceDays.set(row.itemId, dayKey));
    });
  });

  return lastAppearanceDays;
}

function compareFallbackItems(left, right, lastAppearanceDays) {
  const leftDay = lastAppearanceDays.get(left.id) || "";
  const rightDay = lastAppearanceDays.get(right.id) || "";

  return compareStrings(leftDay, rightDay) ||
    left.order - right.order ||
    left.hash - right.hash ||
    compareStrings(left.id, right.id);
}

function normalizeWorksheet(worksheet, expectedDayKey) {
  if (!isRecord(worksheet) ||
    typeof worksheet.assignmentId !== "string" ||
    !isValidDayKey(worksheet.dayKey) ||
    (expectedDayKey !== undefined && worksheet.dayKey !== expectedDayKey) ||
    worksheet.layoutVersion !== WORKSHEET_LAYOUT_VERSION ||
    !isValidPackRef(worksheet.packRef) ||
    !Array.isArray(worksheet.rows)) {
    return undefined;
  }

  const rows = worksheet.rows.map((row) => {
    if (!isRecord(row) ||
      typeof row.rowId !== "string" ||
      typeof row.itemId !== "string" ||
      typeof row.glyph !== "string" ||
      typeof row.pinyin !== "string" ||
      typeof row.exampleWord !== "string") {
      return undefined;
    }
    return {
      rowId: row.rowId,
      itemId: row.itemId,
      glyph: row.glyph,
      pinyin: row.pinyin,
      exampleWord: row.exampleWord,
    };
  });

  if (rows.some((row) => row === undefined)) return undefined;

  return {
    assignmentId: worksheet.assignmentId,
    dayKey: worksheet.dayKey,
    layoutVersion: worksheet.layoutVersion,
    packRef: clonePackRef(worksheet.packRef),
    rows,
  };
}

function normalizeAssignment(assignment, expectedDayKey) {
  if (!isRecord(assignment) || !isRecord(assignment.candidates)) return undefined;

  const candidates = {};
  Object.keys(assignment.candidates).sort(compareStrings).forEach((candidateId) => {
    const worksheet = normalizeWorksheet(assignment.candidates[candidateId], expectedDayKey);
    if (worksheet && worksheet.assignmentId === candidateId) candidates[candidateId] = worksheet;
  });
  const candidateIds = Object.keys(candidates).sort(compareStrings);
  if (candidateIds.length === 0) return undefined;

  const completions = {};
  if (isRecord(assignment.completions)) {
    Object.keys(assignment.completions).sort(compareStrings).forEach((assignmentId) => {
      const completion = assignment.completions[assignmentId];
      if (isRecord(completion) && typeof completion.completedAt === "string") {
        completions[assignmentId] = { completedAt: completion.completedAt };
      }
    });
  }

  return {
    canonicalAssignmentId: typeof assignment.canonicalAssignmentId === "string" &&
      candidates[assignment.canonicalAssignmentId]
      ? assignment.canonicalAssignmentId
      : candidateIds[0],
    candidates,
    completions,
  };
}

function pruneAssignments(assignments, referenceDayKey) {
  const dayKeys = Object.keys(assignments)
    .filter((dayKey) => isValidDayKey(dayKey))
    .sort((left, right) => compareStrings(right, left));
  const retainedDayKeys = referenceDayKey
    ? dayKeys.filter((dayKey) => dayKey <= referenceDayKey).slice(0, MAX_RETAINED_DAYS)
    : dayKeys.slice(0, MAX_RETAINED_DAYS);
  const retained = {};

  retainedDayKeys.sort(compareStrings).forEach((dayKey) => {
    retained[dayKey] = assignments[dayKey];
  });

  return retained;
}

function createEmptyState(learnerScope, packRef) {
  return {
    schemaVersion: 1,
    learnerScope,
    algorithmVersion: ROTATION_ALGORITHM_VERSION,
    activePack: clonePackRef(packRef),
    assignments: {},
    lastIssuedDayKey: null,
  };
}

function samePackRef(left, right) {
  return isValidPackRef(left) && isValidPackRef(right) &&
    left.setId === right.setId && left.contentVersion === right.contentVersion;
}

function chooseStableValue(left, right) {
  if (left === undefined) return cloneValue(right);
  if (right === undefined) return cloneValue(left);
  return cloneValue(JSON.stringify(left) <= JSON.stringify(right) ? left : right);
}

function mergeAssignments(localAssignment, remoteAssignment) {
  const candidateIds = new Set([
    ...Object.keys(localAssignment?.candidates || {}),
    ...Object.keys(remoteAssignment?.candidates || {}),
  ]);
  const candidates = {};

  [...candidateIds].sort(compareStrings).forEach((candidateId) => {
    const candidate = chooseStableValue(
      localAssignment?.candidates?.[candidateId],
      remoteAssignment?.candidates?.[candidateId]
    );
    if (candidate) candidates[candidateId] = candidate;
  });

  const completionIds = new Set([
    ...Object.keys(localAssignment?.completions || {}),
    ...Object.keys(remoteAssignment?.completions || {}),
  ]);
  const completions = {};
  [...completionIds].sort(compareStrings).forEach((assignmentId) => {
    const completion = chooseStableValue(
      localAssignment?.completions?.[assignmentId],
      remoteAssignment?.completions?.[assignmentId]
    );
    if (completion) completions[assignmentId] = completion;
  });

  const sortedCandidateIds = Object.keys(candidates).sort(compareStrings);
  if (sortedCandidateIds.length === 0) return undefined;

  return {
    canonicalAssignmentId: sortedCandidateIds[0],
    candidates,
    completions,
  };
}

function assertMergeCompatibility(localState, remoteState) {
  if (!isRecord(localState) || !isRecord(remoteState)) {
    throw new Error("rotation states must be objects");
  }
  if (localState.schemaVersion !== 1 || remoteState.schemaVersion !== 1) {
    throw new Error("rotation states have incompatible schemaVersion");
  }
  if (localState.algorithmVersion !== ROTATION_ALGORITHM_VERSION ||
    remoteState.algorithmVersion !== ROTATION_ALGORITHM_VERSION) {
    throw new Error("rotation states have incompatible algorithmVersion");
  }
  if (typeof localState.learnerScope !== "string" ||
    localState.learnerScope !== remoteState.learnerScope) {
    throw new Error("rotation states have incompatible learnerScope");
  }
  if (!samePackRef(localState.activePack, remoteState.activePack)) {
    throw new Error("rotation states have incompatible pack ref");
  }
}

function getPackRef(pack) {
  return {
    setId: pack.setId,
    contentVersion: pack.contentVersion,
  };
}

function getAssignmentId({ packRef, learnerScope, dayKey, rows }) {
  const identity = [
    ROTATION_ALGORITHM_VERSION,
    packRef.setId,
    packRef.contentVersion,
    learnerScope,
    dayKey,
    ...rows.map((row) => row.itemId),
  ].join("|");

  return `${ROTATION_ALGORITHM_VERSION}-${stableHash(identity).toString(16).padStart(8, "0")}`;
}

function toDate(now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(date.getTime())) throw new TypeError("now must be a valid date");
  return date;
}

export function getDayKey(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(toDate(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeRotationState(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const learnerScope = options.learnerScope || source.learnerScope || "anonymous";
  const packRef = options.packRef !== undefined ? options.packRef : source.activePack;
  const state = createEmptyState(learnerScope, packRef);

  if ((source.schemaVersion !== undefined && source.schemaVersion !== 1) ||
    (source.algorithmVersion !== undefined && source.algorithmVersion !== ROTATION_ALGORITHM_VERSION)) {
    return state;
  }

  if (isRecord(source.assignments)) {
    Object.keys(source.assignments).sort(compareStrings).forEach((dayKey) => {
      if (!isValidDayKey(dayKey)) return;
      const assignment = normalizeAssignment(source.assignments[dayKey], dayKey);
      if (assignment) state.assignments[dayKey] = assignment;
    });
  }
  state.assignments = pruneAssignments(state.assignments, options.referenceDayKey);
  const issuedDayKeys = Object.keys(state.assignments).sort(compareStrings);
  state.lastIssuedDayKey = issuedDayKeys.length > 0
    ? (isValidDayKey(source.lastIssuedDayKey) && state.assignments[source.lastIssuedDayKey]
      ? source.lastIssuedDayKey
      : issuedDayKeys[issuedDayKeys.length - 1])
    : null;

  return state;
}

export function resolveDailyWorksheet({
  rotationState,
  pack,
  learnerScope,
  now,
  timeZone,
}) {
  const dayKey = getDayKey(now, timeZone);
  const packRef = getPackRef(pack);
  if (isRecord(rotationState) && rotationState.learnerScope && rotationState.learnerScope !== learnerScope) {
    throw new Error("rotation state learnerScope does not match the requested learnerScope");
  }
  if (isRecord(rotationState) && rotationState.algorithmVersion &&
    rotationState.algorithmVersion !== ROTATION_ALGORITHM_VERSION) {
    throw new Error("rotation state algorithmVersion is not supported");
  }

  const statePackRef = isValidPackRef(rotationState?.activePack) ? rotationState.activePack : packRef;
  const state = normalizeRotationState(rotationState, {
    learnerScope,
    packRef: statePackRef,
    referenceDayKey: dayKey,
  });
  const existingAssignment = state.assignments[dayKey];
  if (existingAssignment) {
    const worksheet = existingAssignment.candidates[existingAssignment.canonicalAssignmentId];
    if (worksheet) {
      return {
        worksheet: cloneValue(worksheet),
        rotationState: {
          ...state,
          lastIssuedDayKey: dayKey,
        },
      };
    }
  }

  const recentDayKeys = getRecentDayKeys(state.assignments, dayKey, pack.worksheetPolicy.recentDayWindow);
  const recentItemIds = getItemIdsForDays(state.assignments, recentDayKeys);
  const lastAppearanceDays = getLastAppearanceDays(state.assignments);
  const activeItems = pack.items.filter((item) => item.status === "active");
  const makeSelectionItem = (item) => ({
    ...item,
    hash: stableHash(`${ROTATION_SEED}${learnerScope}${dayKey}${item.id}`),
  });
  const availableItems = activeItems
    .filter((item) => !recentItemIds.has(item.id))
    .map(makeSelectionItem)
    .sort(compareItems);
  const selectedItems = availableItems.slice(0, pack.worksheetPolicy.rowsPerDay);
  if (selectedItems.length < pack.worksheetPolicy.rowsPerDay) {
    const selectedIds = new Set(selectedItems.map((item) => item.id));
    activeItems
      .filter((item) => !selectedIds.has(item.id))
      .map(makeSelectionItem)
      .sort((left, right) => compareFallbackItems(left, right, lastAppearanceDays))
      .some((item) => {
        selectedItems.push(item);
        return selectedItems.length === pack.worksheetPolicy.rowsPerDay;
      });
  }
  const rows = selectedItems.map((item, index) => ({
    rowId: `row-${index + 1}`,
    itemId: item.id,
    glyph: item.glyph,
    pinyin: item.pinyin,
    exampleWord: item.exampleWord,
  }));
  const worksheet = {
    assignmentId: getAssignmentId({ packRef, learnerScope, dayKey, rows }),
    dayKey,
    layoutVersion: WORKSHEET_LAYOUT_VERSION,
    packRef: clonePackRef(packRef),
    rows,
  };
  const snapshot = cloneValue(worksheet);

  const assignments = pruneAssignments({
    ...state.assignments,
    [dayKey]: {
      canonicalAssignmentId: snapshot.assignmentId,
      candidates: { [snapshot.assignmentId]: snapshot },
      completions: {},
    },
  }, dayKey);

  return {
    worksheet: cloneValue(snapshot),
    rotationState: {
      ...state,
      activePack: clonePackRef(packRef),
      assignments,
      lastIssuedDayKey: dayKey,
    },
  };
}

export function recordWorksheetCompletion({ rotationState, worksheet, completedAt }) {
  const state = normalizeRotationState(rotationState, {
    learnerScope: rotationState?.learnerScope,
    packRef: rotationState?.activePack,
  });
  const dayKey = worksheet?.dayKey;
  const assignmentId = worksheet?.assignmentId;
  const assignment = state.assignments[dayKey];

  if (typeof completedAt !== "string" || completedAt.length === 0 ||
    !assignment || !assignment.candidates[assignmentId]) {
    return state;
  }
  if (assignment.completions[assignmentId]) return state;

  return {
    ...state,
    assignments: {
      ...state.assignments,
      [dayKey]: {
        ...assignment,
        completions: {
          ...assignment.completions,
          [assignmentId]: { completedAt },
        },
      },
    },
  };
}

export function mergeRotationState(localState, remoteState) {
  assertMergeCompatibility(localState, remoteState);
  const local = normalizeRotationState(localState, {
    learnerScope: localState.learnerScope,
    packRef: localState.activePack,
  });
  const remote = normalizeRotationState(remoteState, {
    learnerScope: remoteState.learnerScope,
    packRef: remoteState.activePack,
  });
  const assignments = {};
  const dayKeys = new Set([
    ...Object.keys(local.assignments),
    ...Object.keys(remote.assignments),
  ]);

  [...dayKeys].sort(compareStrings).forEach((dayKey) => {
    const assignment = mergeAssignments(local.assignments[dayKey], remote.assignments[dayKey]);
    if (assignment) assignments[dayKey] = assignment;
  });

  const retainedAssignments = pruneAssignments(assignments);
  const issuedDayKeys = Object.keys(retainedAssignments).sort(compareStrings);

  return {
    schemaVersion: 1,
    learnerScope: local.learnerScope,
    algorithmVersion: ROTATION_ALGORITHM_VERSION,
    activePack: clonePackRef(local.activePack),
    assignments: retainedAssignments,
    lastIssuedDayKey: issuedDayKeys.length > 0 ? issuedDayKeys[issuedDayKeys.length - 1] : null,
  };
}
