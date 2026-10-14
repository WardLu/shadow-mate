import { sha256 } from '@noble/hashes/sha2.js';
import { deflateSync, inflateSync } from 'fflate';
import { CONTENT_LEARNING_STATE_KEY } from './content-learning.js';

export const LEARNING_ARCHIVE_SCHEMA_VERSION = 3;
export const LEARNING_ARCHIVE_CODEC = 'deflate-raw-columns-v1';
export const LEARNING_WRITE_PROTOCOL = 'shadow-mate-archive-v3';
export const MAX_LEARNING_ARCHIVE_BYTES = 1024 * 1024;
export const MAX_LEARNING_DECODED_BYTES = 64 * 1024 * 1024;
export const MAX_LEARNING_PACKED_BYTES = 32 * 1024 * 1024;
export const MAX_LEARNING_OCCURRENCES = 200000;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const dictionaryKeys = new Set(['activityId', 'itemId', 'deviceId', 'revocationDeviceId', 'feedback']);
const tableKeys = ['occurrences', 'introductions', 'feedback', 'skips'];
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const bytesOf = value => encoder.encode(JSON.stringify(value));
const checksum = bytes => Array.from(sha256(bytes), value => value.toString(16).padStart(2, '0')).join('');
const fail = message => { throw new RangeError(`Invalid learning archive: ${message}`); };

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== 'string' || value.length > MAX_LEARNING_ARCHIVE_BYTES
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('payload');
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time / 86400000;
}

function canonicalOccurrence(row) {
  if (typeof row?.activityId !== 'string' || typeof row.itemId !== 'string' || dayNumber(row.dayKey) === null) return null;
  return `${row.activityId}:${encodeURIComponent(row.itemId)}:${row.dayKey}`;
}

function encodeTable(rows, occurrenceIndex = null) {
  if (!Array.isArray(rows) || rows.length > MAX_LEARNING_OCCURRENCES || rows.some(row => !isRecord(row))) fail('table records');
  const keys = [...new Set(rows.flatMap(Object.keys))].sort();
  return { count: rows.length, columns: keys.map(key => {
    const missing = [];
    const values = rows.map((row, index) => {
      if (!Object.hasOwn(row, key)) { missing.push(index); return null; }
      const value = row[key];
      if (key === 'occurrenceId') {
        if (occurrenceIndex?.has(value)) return occurrenceIndex.get(value);
        if (!occurrenceIndex && value === canonicalOccurrence(row)) return null;
      }
      if (key === 'dayKey' || key === 'firstPlannedDay') return dayNumber(value) ?? value;
      if (key === 'completedAt' && typeof value === 'string') {
        const time = Date.parse(value);
        const day = dayNumber(row.dayKey);
        if (day !== null && Number.isFinite(time) && new Date(time).toISOString() === value) return time - day * 86400000;
      }
      return value;
    });
    const column = { key, values, ...(missing.length ? { missing } : {}) };
    if (dictionaryKeys.has(key) && values.every(value => value === null || typeof value === 'string')) {
      const dictionary = [...new Set(values)];
      const indices = new Map(dictionary.map((value, index) => [value, index]));
      column.dictionary = dictionary;
      column.values = values.map(value => indices.get(value));
    }
    return column;
  }) };
}

function decodeTable(table, occurrences = null) {
  if (!isRecord(table) || !Number.isSafeInteger(table.count) || table.count < 0
    || table.count > MAX_LEARNING_OCCURRENCES || !Array.isArray(table.columns) || table.columns.length > 100) fail('table');
  const rows = Array.from({ length: table.count }, () => ({}));
  const keys = new Set();
  for (const column of table.columns) {
    if (!isRecord(column) || typeof column.key !== 'string' || keys.has(column.key)
      || !Array.isArray(column.values) || column.values.length !== table.count) fail('column');
    keys.add(column.key);
    const missing = new Set(column.missing || []);
    if ([...missing].some(index => !Number.isSafeInteger(index) || index < 0 || index >= table.count)) fail('missing field');
    for (let index = 0; index < rows.length; index += 1) {
      if (missing.has(index)) continue;
      let value = column.values[index];
      if (Object.hasOwn(column, 'dictionary')) {
        if (!Array.isArray(column.dictionary) || !Number.isSafeInteger(value) || value < 0 || value >= column.dictionary.length) fail('dictionary index');
        value = column.dictionary[value];
      }
      Object.defineProperty(rows[index], column.key, { value, enumerable: true, writable: true, configurable: true });
    }
  }
  for (const row of rows) {
    for (const key of ['dayKey', 'firstPlannedDay']) {
      if (typeof row[key] === 'number') {
        if (!Number.isSafeInteger(row[key])) fail('date');
        row[key] = new Date(row[key] * 86400000).toISOString().slice(0, 10);
      }
    }
    if (typeof row.completedAt === 'number') {
      const day = dayNumber(row.dayKey);
      if (day === null || !Number.isSafeInteger(row.completedAt)) fail('timestamp');
      row.completedAt = new Date(day * 86400000 + row.completedAt).toISOString();
    }
    if (Object.hasOwn(row, 'occurrenceId')) {
      if (occurrences && typeof row.occurrenceId === 'number') {
        if (!Number.isSafeInteger(row.occurrenceId) || !occurrences[row.occurrenceId]) fail('occurrence reference');
        row.occurrenceId = occurrences[row.occurrenceId].occurrenceId;
      } else if (!occurrences && row.occurrenceId === null) {
        const id = canonicalOccurrence(row);
        if (!id) fail('occurrence identity');
        row.occurrenceId = id;
      }
    }
  }
  return rows;
}

function packEnvelope(envelope) {
  const packed = structuredClone(envelope);
  const ledger = packed.learning?.extra?.[CONTENT_LEARNING_STATE_KEY];
  if (!ledger) return packed;
  if (!isRecord(ledger) || ledger.schemaVersion !== 1) fail('ledger version');
  const indices = new Map(ledger.occurrences.map((row, index) => [row.occurrenceId, index]));
  for (const key of tableKeys) ledger[key] = encodeTable(ledger[key], key === 'feedback' ? indices : null);
  return packed;
}

function unpackEnvelope(packed) {
  const ledger = packed.learning?.extra?.[CONTENT_LEARNING_STATE_KEY];
  if (!ledger) return packed;
  ledger.occurrences = decodeTable(ledger.occurrences);
  for (const key of tableKeys.slice(1)) ledger[key] = decodeTable(ledger[key], key === 'feedback' ? ledger.occurrences : null);
  return packed;
}

function assertEnvelope(value) {
  if (!isRecord(value) || value.schema_version !== 2 || !isRecord(value.learning)
    || value.product_id !== 'shadow-mate' || !isRecord(value.scope)) fail('decoded envelope');
}

/** A single synchronous persistence format; domain queries and merges use the decoded v2 envelope. */
export function encodeLearningStateArchive(envelope) {
  if (envelope?.schema_version === LEARNING_ARCHIVE_SCHEMA_VERSION) envelope = decodeLearningStateArchive(envelope);
  assertEnvelope(envelope);
  const expandedBytes = bytesOf(envelope).length;
  const count = envelope.learning.extra?.[CONTENT_LEARNING_STATE_KEY]?.occurrences?.length || 0;
  if (expandedBytes > MAX_LEARNING_DECODED_BYTES || count > MAX_LEARNING_OCCURRENCES) fail('expanded budget');
  const bytes = bytesOf(packEnvelope(envelope));
  if (bytes.length > MAX_LEARNING_PACKED_BYTES) fail('packed budget');
  const archive = {
    schema_version: LEARNING_ARCHIVE_SCHEMA_VERSION,
    product_id: 'shadow-mate',
    scope: structuredClone(envelope.scope),
    archive: {
      codec: LEARNING_ARCHIVE_CODEC,
      packed_bytes: bytes.length,
      expanded_bytes: expandedBytes,
      occurrence_count: count,
      sha256: checksum(bytes),
      payload: toBase64(deflateSync(bytes, { level: 9, mem: 8 })),
    },
  };
  if (bytesOf(archive).length > MAX_LEARNING_ARCHIVE_BYTES) fail('storage budget; no learning facts were removed');
  return archive;
}

/** Unknown versions and damaged archives fail before callers can migrate, merge, or overwrite them. */
export function decodeLearningStateArchive(value) {
  if (!isRecord(value)) return value;
  if (Object.hasOwn(value, 'schema_version') && ![1, 2, LEARNING_ARCHIVE_SCHEMA_VERSION].includes(value.schema_version)) {
    throw new RangeError(`Unsupported learning state schema version: ${value.schema_version}`);
  }
  if (value.schema_version !== LEARNING_ARCHIVE_SCHEMA_VERSION) return structuredClone(value);
  const archive = value.archive;
  if (value.product_id !== 'shadow-mate' || !isRecord(value.scope) || !isRecord(archive)
    || archive.codec !== LEARNING_ARCHIVE_CODEC) fail('unsupported schema or codec');
  for (const [key, maximum] of [['packed_bytes', MAX_LEARNING_PACKED_BYTES], ['expanded_bytes', MAX_LEARNING_DECODED_BYTES], ['occurrence_count', MAX_LEARNING_OCCURRENCES]]) {
    if (!Number.isSafeInteger(archive[key]) || archive[key] < 0 || archive[key] > maximum) fail(`${key} budget`);
  }
  if (archive.packed_bytes < 2 || !/^[a-f0-9]{64}$/.test(archive.sha256)) fail('checksum metadata');
  // Providing out prevents fflate from growing an attacker-controlled output allocation.
  const bytes = inflateSync(fromBase64(archive.payload), { out: new Uint8Array(archive.packed_bytes) });
  if (bytes.length !== archive.packed_bytes || checksum(bytes) !== archive.sha256) fail('checksum');
  const envelope = unpackEnvelope(JSON.parse(decoder.decode(bytes)));
  assertEnvelope(envelope);
  if (envelope.scope.household_id !== value.scope.household_id || envelope.scope.profile_id !== value.scope.profile_id) fail('scope mismatch');
  if (bytesOf(envelope).length !== archive.expanded_bytes
    || (envelope.learning.extra?.[CONTENT_LEARNING_STATE_KEY]?.occurrences?.length || 0) !== archive.occurrence_count) fail('expanded metadata');
  return envelope;
}
