import { createHash } from 'node:crypto';

const scopeFields = ['tenantId', 'driveId', 'sourceId'];
const reviewableStatuses = new Set(['readable', 'partial', 'unreadable']);
const itemPattern = /^[A-Za-z0-9_!-]{1,256}$/;
const versionPattern = /^[ce]:[^\0\r\n]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const maxPdfSize = 3 * 1024 * 1024;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function scopeKey(scope) {
  const values = scopeFields.map(field => scope?.[field]);
  if (!values.every(value => typeof value === 'string' && itemPattern.test(value))) {
    throw new Error('binding_scope_invalid');
  }
  return JSON.stringify(values);
}

function indexBy(rows, key) {
  if (!Array.isArray(rows)) throw new Error('binding_input_invalid');
  const index = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!value || index.has(value)) throw new Error('binding_input_identity_invalid_or_duplicate');
    index.set(value, row);
  }
  return index;
}

function samePdfVersion(item, version) {
  return typeof item?.id === 'string' && item.id === version.id && itemPattern.test(item.id) &&
    typeof item.version === 'string' && versionPattern.test(item.version) && item.version === version.version &&
    item.mime === 'application/pdf' && version.mime === item.mime &&
    Number.isSafeInteger(item.size) && item.size > 0 && item.size <= maxPdfSize && item.size === version.size;
}

function pathOf(item) {
  if (!Array.isArray(item.folderNames) || typeof item.name !== 'string') throw new Error('binding_input_invalid');
  return [...item.folderNames, item.name].join('/');
}

/**
 * Rehash originals already attested to the registered source by a trusted caller.
 * An original descriptor must come from an exact Graph content response or a
 * verified retained download receipt. A mirror path or listing alone is insufficient.
 * Returned bindings are reconciliation inputs and confer no authority to act.
 */
export async function produceVerifiedReviewBindings({ prior, current, reviews, originals, readBytes }) {
  const exactScope = scopeKey(prior?.scope);
  if (prior?.complete !== true || current?.complete !== true || scopeKey(current.scope) !== exactScope ||
      typeof readBytes !== 'function') throw new Error('binding_snapshot_unverified');
  const before = indexBy(prior.items, row => row?.id);
  const after = indexBy(current.items, row => row?.id);
  indexBy(prior.items, pathOf);
  indexBy(current.items, pathOf);
  const reviewByPath = indexBy(reviews, row => row?.relativePath);
  indexBy(reviews, row => row?.sourceId);
  const byItem = indexBy(originals, row => row?.id);
  const holds = {
    scopeMismatch: 0, historicalOrCurrentVersionMismatch: 0, reviewMissingOrDifferentDigest: 0,
    bytesUnavailable: 0, invalidFormatOrLength: 0, digestMismatch: 0,
  };
  const bindings = [];
  for (const original of byItem.values()) {
    if (scopeKey(original.scope) !== exactScope) {
      holds.scopeMismatch++;
      continue;
    }
    const old = before.get(original.id);
    const fresh = after.get(original.id);
    if (!samePdfVersion(old, original) || !samePdfVersion(fresh, original)) {
      holds.historicalOrCurrentVersionMismatch++;
      continue;
    }

    // A historical path locates a candidate review; independently proven bytes establish the binding.
    const review = reviewByPath.get(pathOf(old));
    if (!review || !reviewableStatuses.has(review.sourceStatus) ||
        !['prepared', 'held'].includes(review.result?.outcome) ||
        typeof original.sha256 !== 'string' || !sha256Pattern.test(original.sha256) ||
        review.sha256 !== original.sha256) {
      holds.reviewMissingOrDifferentDigest++;
      continue;
    }
    let bytes;
    try {
      bytes = await readBytes(original);
    } catch {
      holds.bytesUnavailable++;
      continue;
    }
    if (!Buffer.isBuffer(bytes) || bytes.length !== original.size ||
        !bytes.subarray(0, 1024).includes('%PDF-')) {
      holds.invalidFormatOrLength++;
      continue;
    }
    const digest = sha256(bytes);
    if (digest !== original.sha256) {
      holds.digestMismatch++;
      continue;
    }

    bindings.push({ sourceId: review.sourceId, id: original.id, version: original.version,
      size: bytes.length, sha256: digest });
  }
  return { bindings, holds };
}
