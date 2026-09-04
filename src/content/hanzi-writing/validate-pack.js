const REQUIRED_SOURCE_REF = "shadow-mate-preschool-hanzi-curriculum";
const UNSAFE_TEXT_PATTERN = /<\s*\/?\s*[a-z][^>]*>|(?:java|vb)script\s*:|on[a-z]+\s*=/iu;
const VISUAL_VALUE_URL_PATTERN = /(?:[a-z][a-z\d+.-]*:|\/\/|(?:^|[\s(])www\.)/iu;
const SINGLE_CJK_IDEOGRAPH_PATTERN = /^\p{Script=Han}$/u;
const MAX_METADATA_STRING_LENGTH = 120;
const MAX_VISUAL_GRAPHEME_COUNT = 8;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isSingleCjkIdeograph(value) {
  return typeof value === "string" && Array.from(value).length === 1 && SINGLE_CJK_IDEOGRAPH_PATTERN.test(value);
}

function collectUnsafeText(value, path, errors, seen = new Set()) {
  if (typeof value === "string") {
    if (UNSAFE_TEXT_PATTERN.test(value)) {
      errors.push(`${path} contains unsafe HTML-like text`);
    }
    return;
  }

  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectUnsafeText(entry, `${path}[${index}]`, errors, seen));
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    collectUnsafeText(entry, `${path}.${key}`, errors, seen);
  });
}

function requireString(value, path, errors) {
  if (!isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function requireBoundedString(value, path, errors) {
  if (!requireString(value, path, errors)) return false;
  if (value.length > MAX_METADATA_STRING_LENGTH) {
    errors.push(`${path} must be at most ${MAX_METADATA_STRING_LENGTH} characters`);
    return false;
  }
  return true;
}

function countGraphemes(value) {
  if (typeof Intl?.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }
  return Array.from(value).length;
}

function validateStringArray(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array of strings`);
    return false;
  }

  let valid = true;
  value.forEach((entry, index) => {
    if (!requireString(entry, `${path}[${index}]`, errors)) valid = false;
  });
  return valid;
}

function validateExactTuple(value, expected, path, errors) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    errors.push(`${path} must be [${expected.join(", ")}]`);
    return false;
  }
  return true;
}

function validateConcept(item, path, errors) {
  const conceptPath = `${path}.concept`;
  if (!isRecord(item.concept)) {
    errors.push(`${conceptPath} must be an object`);
    return;
  }

  requireBoundedString(item.concept.label, `${conceptPath}.label`, errors);
  requireBoundedString(item.concept.englishLabel, `${conceptPath}.englishLabel`, errors);
  requireBoundedString(item.concept.characterEnglishLabel, `${conceptPath}.characterEnglishLabel`, errors);
  requireBoundedString(item.concept.characterMeaning, `${conceptPath}.characterMeaning`, errors);

  const visualPath = `${conceptPath}.visual`;
  if (!isRecord(item.concept.visual)) {
    errors.push(`${visualPath} must be an object`);
    return;
  }

  if (item.concept.visual.kind !== "emoji") {
    errors.push(`${visualPath}.kind must be "emoji"`);
  }

  const visualValuePath = `${visualPath}.value`;
  if (!isNonEmptyString(item.concept.visual.value)) {
    errors.push(`${visualValuePath} must be a non-empty string`);
  } else {
    const graphemeCount = countGraphemes(item.concept.visual.value);
    if (graphemeCount < 1 || graphemeCount > MAX_VISUAL_GRAPHEME_COUNT) {
      errors.push(`${visualValuePath} must contain 1-${MAX_VISUAL_GRAPHEME_COUNT} Unicode graphemes`);
    }
    if (VISUAL_VALUE_URL_PATTERN.test(item.concept.visual.value)) {
      errors.push(`${visualValuePath} must not contain a URL`);
    }
  }

  requireBoundedString(item.concept.visual.alt, `${visualPath}.alt`, errors);
}

function validateExampleWords(item, path, errors) {
  if (!Array.isArray(item.exampleWords) || item.exampleWords.length < 2) {
    errors.push(`${path}.exampleWords must contain at least two non-empty words`);
    return;
  }

  item.exampleWords.forEach((word, wordIndex) => {
    const wordPath = `${path}.exampleWords[${wordIndex}]`;
    if (!requireString(word, wordPath, errors)) return;
    if (isNonEmptyString(item.glyph) && !word.includes(item.glyph)) {
      errors.push(`${wordPath} must contain glyph "${item.glyph}"`);
    }
  });
}

function validateWriting(item, path, errors) {
  const writingPath = `${path}.writing`;
  if (item.traceEligible === false) {
    if (Object.hasOwn(item, "writing")) {
      errors.push(`${writingPath} must be omitted when traceEligible is false`);
    }
    return;
  }

  if (!isRecord(item.writing)) {
    errors.push(`${writingPath} must be an object`);
    return;
  }

  if (!Number.isInteger(item.writing.strokeCount) || item.writing.strokeCount < 1 || item.writing.strokeCount > 64) {
    errors.push(`${writingPath}.strokeCount must be an integer from 1 to 64`);
  }
  requireBoundedString(item.writing.structure, `${writingPath}.structure`, errors);
  requireBoundedString(item.writing.hint, `${writingPath}.hint`, errors);
}

function validateItem(item, index, packSourceRefs, ids, glyphs, orders, errors) {
  const path = `items[${index}]`;
  if (!isRecord(item)) {
    errors.push(`${path} must be an object`);
    return { active: false };
  }

  const idValid = requireString(item.id, `${path}.id`, errors);
  if (idValid) {
    if (ids.has(item.id)) errors.push(`${path} has duplicate id: ${item.id}`);
    ids.add(item.id);
  }

  if (!isSingleCjkIdeograph(item.glyph)) {
    errors.push(`${path}.glyph must be a single CJK ideograph`);
  } else {
    if (glyphs.has(item.glyph)) errors.push(`${path} has duplicate glyph: ${item.glyph}`);
    glyphs.add(item.glyph);
  }

  requireString(item.pinyin, `${path}.pinyin`, errors);
  requireString(item.exampleWord, `${path}.exampleWord`, errors);

  if (!isPositiveInteger(item.order)) {
    errors.push(`${path}.order must be a positive integer`);
  } else {
    if (orders.has(item.order)) errors.push(`${path} has duplicate order: ${item.order}`);
    orders.add(item.order);
  }

  requireString(item.theme, `${path}.theme`, errors);

  if (typeof item.difficulty !== "number" || !Number.isFinite(item.difficulty) || item.difficulty < 1) {
    errors.push(`${path}.difficulty must be a positive number`);
  }

  const statusValid = item.status === "active" || item.status === "retired";
  if (!statusValid) {
    errors.push(`${path}.status must be "active" or "retired"`);
  } else if (item.status === "retired") {
    errors.push(`${path} is a retired item and cannot be in the active pack`);
  }

  const itemSourceRefsValid = validateStringArray(item.sourceRefs, `${path}.sourceRefs`, errors);
  if (itemSourceRefsValid && packSourceRefs.length > 0) {
    item.sourceRefs.forEach((sourceRef, sourceIndex) => {
      if (!packSourceRefs.includes(sourceRef)) {
        errors.push(`${path}.sourceRefs[${sourceIndex}] is not declared by pack.sourceRefs`);
      }
    });
  }

  if (typeof item.traceEligible !== "boolean") {
    errors.push(`${path}.traceEligible must be a boolean`);
  }

  if (item.status === "active") {
    validateConcept(item, path, errors);
    validateExampleWords(item, path, errors);
    requireBoundedString(item.sentence, `${path}.sentence`, errors);
    validateWriting(item, path, errors);
  }

  return { active: item.status === "active" };
}

export function validateHanziWritingPack(pack) {
  const errors = [];

  if (!isRecord(pack)) return { valid: false, errors: ["pack must be an object"] };

  collectUnsafeText(pack, "pack", errors);

  if (pack.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (pack.setId !== "hanzi-writing-v2") errors.push('setId must be "hanzi-writing-v2"');
  requireString(pack.contentVersion, "contentVersion", errors);
  if (pack.algorithmCompatibility !== "rotation-v1") {
    errors.push('algorithmCompatibility must be "rotation-v1"');
  }
  if (pack.locale !== "zh-CN") errors.push('locale must be "zh-CN"');
  validateExactTuple(pack.targetAgeRange, [4, 5], "targetAgeRange", errors);

  if (!isRecord(pack.worksheetPolicy)) {
    errors.push("worksheetPolicy must be an object");
  } else {
    if (pack.worksheetPolicy.rowsPerDay !== 4) {
      errors.push("worksheetPolicy.rowsPerDay must be 4");
    }
    if (pack.worksheetPolicy.recentDayWindow !== 7) {
      errors.push("worksheetPolicy.recentDayWindow must be 7");
    }
  }

  const reviewersValid = validateStringArray(pack.reviewers, "reviewers", errors);
  if (reviewersValid && !pack.reviewers.includes("product-owner")) {
    errors.push('reviewers must include "product-owner"');
  }

  const packSourceRefsValid = validateStringArray(pack.sourceRefs, "sourceRefs", errors);
  const packSourceRefs = packSourceRefsValid ? pack.sourceRefs : [];
  if (packSourceRefsValid && !pack.sourceRefs.includes(REQUIRED_SOURCE_REF)) {
    errors.push(`sourceRefs must include "${REQUIRED_SOURCE_REF}"`);
  }

  const ids = new Set();
  const glyphs = new Set();
  const orders = new Set();
  let activeItemCount = 0;

  if (!Array.isArray(pack.items)) {
    errors.push("items must be an array");
  } else {
    pack.items.forEach((item, index) => {
      if (validateItem(item, index, packSourceRefs, ids, glyphs, orders, errors).active) {
        activeItemCount += 1;
      }
    });
  }

  if (activeItemCount < 32) errors.push("items must contain at least 32 active items");

  return { valid: errors.length === 0, errors };
}
