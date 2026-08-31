const ROTATION_SEED = "stable-local-seed";
const WORKSHEET_LAYOUT_VERSION = "focus-rows-v1";
const WORKSHEET_ROWS_PER_DAY = 4;
const MAX_RETAINED_DAYS = 90;
const MAX_PAYLOAD_BYTES = 200 * 1024;
const MAX_ID_LENGTH = 256;
const MAX_SNAPSHOT_TEXT_LENGTH = 1024;
const MAX_COMPLETION_LENGTH = 256;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/;

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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoundedString(value, maxLength = MAX_ID_LENGTH) {
  return isNonEmptyString(value) && value.length <= maxLength;
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidCompletionTimestamp(value) {
  if (!isBoundedString(value, MAX_COMPLETION_LENGTH)) return false;

  const match = value.match(ISO_TIMESTAMP_PATTERN);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 ||
    hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  return day >= 1 && day <= daysInMonth(year, month) && Number.isFinite(Date.parse(value));
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}

function isValidPackRef(packRef) {
  return isRecord(packRef) &&
    isBoundedString(packRef.setId) &&
    isBoundedString(packRef.contentVersion);
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

  return year >= 1 && year <= 9999 &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth(year, month);
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

function getLastAppearanceDays(assignments, beforeDayKey) {
  const lastAppearanceDays = new Map();

  Object.keys(assignments)
    .filter((dayKey) => isValidDayKey(dayKey) && (!beforeDayKey || dayKey < beforeDayKey))
    .sort(compareStrings)
    .forEach((dayKey) => {
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

function truncateSnapshotText(value) {
  return Array.from(value).slice(0, MAX_SNAPSHOT_TEXT_LENGTH).join("");
}

function getPackItems(pack, worksheetPackRef) {
  if (pack === undefined) return undefined;
  if (!isRecord(pack) || !samePackRef(getPackRef(pack), worksheetPackRef)) return null;
  if (!Array.isArray(pack.items)) return new Map();

  return new Map(
    pack.items
      .filter((item) => isRecord(item) && isBoundedString(item.id))
      .map((item) => [item.id, item])
  );
}

function normalizeWorksheet(
  worksheet,
  expectedDayKey,
  learnerScope,
  expectedPackRef,
  allowHistoricalPack,
  pack,
) {
  if (!isRecord(worksheet) ||
    !isBoundedString(worksheet.assignmentId) ||
    !isValidDayKey(worksheet.dayKey) ||
    (expectedDayKey !== undefined && worksheet.dayKey !== expectedDayKey) ||
    worksheet.layoutVersion !== WORKSHEET_LAYOUT_VERSION ||
    !isValidPackRef(worksheet.packRef) ||
    !Array.isArray(worksheet.rows)) {
    return undefined;
  }
  if (expectedPackRef && !samePackRef(worksheet.packRef, expectedPackRef) && !allowHistoricalPack) {
    return undefined;
  }

  if (worksheet.rows.length !== WORKSHEET_ROWS_PER_DAY) return undefined;

  const packItems = getPackItems(pack, worksheet.packRef);

  const rows = worksheet.rows.map((row, index) => {
    if (!isRecord(row) ||
      !isBoundedString(row.rowId) ||
      !isBoundedString(row.itemId) ||
      !isNonEmptyString(row.glyph) ||
      !isNonEmptyString(row.pinyin) ||
      !isNonEmptyString(row.exampleWord)) {
      return undefined;
    }
    if (row.rowId !== `row-${index + 1}`) return undefined;

    if (packItems) {
      const item = packItems.get(row.itemId);
      if (!item || row.glyph !== item.glyph || row.pinyin !== item.pinyin ||
        row.exampleWord !== item.exampleWord) {
        return undefined;
      }
    }
    return {
      rowId: row.rowId,
      itemId: row.itemId,
      glyph: truncateSnapshotText(row.glyph),
      pinyin: truncateSnapshotText(row.pinyin),
      exampleWord: truncateSnapshotText(row.exampleWord),
    };
  });

  if (rows.some((row) => row === undefined)) return undefined;
  if (new Set(rows.map((row) => row.rowId)).size !== rows.length ||
    new Set(rows.map((row) => row.itemId)).size !== rows.length) {
    return undefined;
  }

  const expectedAssignmentId = getAssignmentId({
    packRef: worksheet.packRef,
    learnerScope,
    dayKey: worksheet.dayKey,
    rows,
  });
  if (worksheet.assignmentId !== expectedAssignmentId) return undefined;

  return {
    assignmentId: worksheet.assignmentId,
    dayKey: worksheet.dayKey,
    layoutVersion: worksheet.layoutVersion,
    packRef: clonePackRef(worksheet.packRef),
    rows,
  };
}

function normalizeAssignment(
  assignment,
  expectedDayKey,
  learnerScope,
  expectedPackRef,
  allowHistoricalPack,
  pack,
) {
  if (!isRecord(assignment) || !isRecord(assignment.candidates)) return undefined;

  const candidates = {};
  Object.keys(assignment.candidates).sort(compareStrings).forEach((candidateId) => {
    const worksheet = normalizeWorksheet(
      assignment.candidates[candidateId],
      expectedDayKey,
      learnerScope,
      expectedPackRef,
      allowHistoricalPack,
      pack,
    );
    if (worksheet && worksheet.assignmentId === candidateId) candidates[candidateId] = worksheet;
  });
  const candidateIds = Object.keys(candidates).sort(compareStrings);
  if (candidateIds.length === 0) return undefined;

  const completions = {};
  if (isRecord(assignment.completions)) {
    Object.keys(assignment.completions).sort(compareStrings).forEach((assignmentId) => {
      const completion = assignment.completions[assignmentId];
      if (candidates[assignmentId] && isRecord(completion) &&
        isValidCompletionTimestamp(completion.completedAt)) {
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
    ? [
      ...dayKeys.filter((dayKey) => dayKey <= referenceDayKey).slice(0, MAX_RETAINED_DAYS),
      ...dayKeys.filter((dayKey) => dayKey > referenceDayKey),
    ]
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

function payloadByteLength(value) {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(serialized).length
    : serialized.length;
}

function getLatestRetainedDayKey(assignments) {
  const dayKeys = Object.keys(assignments).sort(compareStrings);
  return dayKeys.length > 0 ? dayKeys[dayKeys.length - 1] : null;
}

function removeCandidate(assignments, dayKey, candidateId) {
  const assignment = assignments[dayKey];
  const candidates = { ...assignment.candidates };
  const completions = { ...assignment.completions };
  delete candidates[candidateId];
  delete completions[candidateId];

  return {
    ...assignments,
    [dayKey]: { ...assignment, candidates, completions },
  };
}

function enforcePayloadBudget(state) {
  let assignments = state.assignments;
  const candidateRemovalOrder = [];

  Object.keys(assignments).sort(compareStrings).forEach((dayKey) => {
    const assignment = assignments[dayKey];
    Object.keys(assignment.candidates)
      .filter((candidateId) => candidateId !== assignment.canonicalAssignmentId)
      .sort((left, right) => compareStrings(right, left))
      .forEach((candidateId) => candidateRemovalOrder.push({ dayKey, candidateId }));
  });

  for (const { dayKey, candidateId } of candidateRemovalOrder) {
    if (payloadByteLength({ ...state, assignments }) < MAX_PAYLOAD_BYTES) break;
    assignments = removeCandidate(assignments, dayKey, candidateId);
  }

  const completionRemovalOrder = [];
  Object.keys(assignments).sort(compareStrings).forEach((dayKey) => {
    const assignment = assignments[dayKey];
    Object.keys(assignment.completions)
      .filter((assignmentId) => assignmentId !== assignment.canonicalAssignmentId)
      .sort((left, right) => compareStrings(right, left))
      .forEach((assignmentId) => completionRemovalOrder.push({ dayKey, assignmentId }));
  });

  for (const { dayKey, assignmentId } of completionRemovalOrder) {
    if (payloadByteLength({ ...state, assignments }) < MAX_PAYLOAD_BYTES) break;
    const assignment = assignments[dayKey];
    const completions = { ...assignment.completions };
    delete completions[assignmentId];
    assignments = {
      ...assignments,
      [dayKey]: { ...assignment, completions },
    };
  }

  for (const dayKey of Object.keys(assignments).sort(compareStrings)) {
    if (payloadByteLength({ ...state, assignments }) < MAX_PAYLOAD_BYTES) break;
    if (Object.keys(assignments).length === 1) break;
    const retained = { ...assignments };
    delete retained[dayKey];
    assignments = retained;
  }

  return {
    ...state,
    assignments,
    lastIssuedDayKey: assignments[state.lastIssuedDayKey]
      ? state.lastIssuedDayKey
      : getLatestRetainedDayKey(assignments),
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
    const localCandidate = localAssignment?.candidates?.[candidateId];
    const remoteCandidate = remoteAssignment?.candidates?.[candidateId];
    if (localCandidate && remoteCandidate &&
      JSON.stringify(localCandidate) !== JSON.stringify(remoteCandidate)) {
      return;
    }
    const candidate = chooseStableValue(
      localCandidate,
      remoteCandidate
    );
    if (candidate) candidates[candidateId] = candidate;
  });

  const completionIds = new Set([
    ...Object.keys(localAssignment?.completions || {}),
    ...Object.keys(remoteAssignment?.completions || {}),
  ]);
  const completions = {};
  [...completionIds].sort(compareStrings).forEach((assignmentId) => {
    if (!candidates[assignmentId]) return;
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
  if (!isBoundedString(localState.learnerScope) ||
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

/**
 * Returns whether a rotation payload can be used in the expected learner
 * scope. An absent payload is compatible so callers can initialize a new
 * scope; a non-empty payload without an explicit scope is not.
 */
export function isRotationStateScopeCompatible(input, expectedLearnerScope) {
  if (!isBoundedString(expectedLearnerScope)) return false;
  if (input === undefined || input === null) return true;
  if (!isRecord(input)) return false;
  if (!Object.hasOwn(input, "learnerScope")) return Object.keys(input).length === 0;

  return isBoundedString(input.learnerScope) && input.learnerScope === expectedLearnerScope;
}

export function getDayKey(now, timeZone) {
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) {
    throw new TypeError("timeZone must be a valid IANA timezone");
  }

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }

  const parts = formatter.formatToParts(toDate(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeRotationState(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const hasSourceLearnerScope = Object.hasOwn(source, "learnerScope");
  const hasExpectedLearnerScope = options.expectedLearnerScope !== undefined ||
    options.learnerScope !== undefined;
  const expectedLearnerScope = options.expectedLearnerScope ?? options.learnerScope;
  const requestedLearnerScope = options.learnerScope ??
    options.expectedLearnerScope ??
    source.learnerScope ??
    "anonymous";
  const learnerScope = isBoundedString(requestedLearnerScope) ? requestedLearnerScope : "anonymous";
  const packRef = options.packRef !== undefined ? options.packRef : source.activePack;
  const state = createEmptyState(learnerScope, packRef);
  const referenceDayKey = isValidDayKey(options.referenceDayKey)
    ? options.referenceDayKey
    : (isValidDayKey(source.lastIssuedDayKey) ? source.lastIssuedDayKey : undefined);

  if ((source.schemaVersion !== undefined && source.schemaVersion !== 1) ||
    (source.algorithmVersion !== undefined && source.algorithmVersion !== ROTATION_ALGORITHM_VERSION) ||
    (hasSourceLearnerScope && !isBoundedString(source.learnerScope)) ||
    (hasExpectedLearnerScope && !isRotationStateScopeCompatible(source, expectedLearnerScope)) ||
    (!hasSourceLearnerScope && Object.keys(source).length > 0)) {
    return state;
  }

  if (isRecord(source.assignments)) {
    Object.keys(source.assignments).sort(compareStrings).forEach((dayKey) => {
      if (!isValidDayKey(dayKey)) return;
      const assignment = normalizeAssignment(
        source.assignments[dayKey],
        dayKey,
        learnerScope,
        packRef,
        referenceDayKey !== undefined && dayKey !== referenceDayKey,
        options.pack,
      );
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

  return enforcePayloadBudget(state);
}

export function resolveDailyWorksheet({
  rotationState,
  pack,
  learnerScope,
  now,
  timeZone,
}) {
  const dayKey = getDayKey(now, timeZone);
  if (!isRecord(pack) || !isValidPackRef({ setId: pack.setId, contentVersion: pack.contentVersion }) ||
    !isRecord(pack.worksheetPolicy) ||
    pack.worksheetPolicy.rowsPerDay !== WORKSHEET_ROWS_PER_DAY ||
    !Number.isInteger(pack.worksheetPolicy.recentDayWindow) ||
    pack.worksheetPolicy.recentDayWindow < 1 ||
    !Array.isArray(pack.items)) {
    throw new TypeError("pack must provide a valid four-row worksheet policy");
  }
  if (!isBoundedString(learnerScope)) {
    throw new TypeError("learnerScope must be a non-empty string");
  }
  const packRef = getPackRef(pack);
  if (!isRotationStateScopeCompatible(rotationState, learnerScope)) {
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
    pack,
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
  if (selectedItems.length !== WORKSHEET_ROWS_PER_DAY) {
    return {
      worksheet: undefined,
      rotationState: state,
    };
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

  const nextState = {
    ...state,
    activePack: clonePackRef(packRef),
    assignments,
    lastIssuedDayKey: dayKey,
  };

  return {
    worksheet: cloneValue(snapshot),
    rotationState: enforcePayloadBudget(nextState),
  };
}

export function recordWorksheetCompletion({ rotationState, worksheet, completedAt, pack }) {
  const state = normalizeRotationState(rotationState, {
    learnerScope: rotationState?.learnerScope,
    packRef: rotationState?.activePack,
    pack,
  });
  const dayKey = worksheet?.dayKey;
  const assignmentId = worksheet?.assignmentId;
  const assignment = state.assignments[dayKey];

  if (!isValidCompletionTimestamp(completedAt) ||
    !assignment || !assignment.candidates[assignmentId] ||
    JSON.stringify(assignment.candidates[assignmentId]) !== JSON.stringify(worksheet)) {
    return state;
  }
  if (assignment.completions[assignmentId]) return state;

  return enforcePayloadBudget({
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
  });
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

  return enforcePayloadBudget({
    schemaVersion: 1,
    learnerScope: local.learnerScope,
    algorithmVersion: ROTATION_ALGORITHM_VERSION,
    activePack: clonePackRef(local.activePack),
    assignments: retainedAssignments,
    lastIssuedDayKey: issuedDayKeys.length > 0 ? issuedDayKeys[issuedDayKeys.length - 1] : null,
  });
}
