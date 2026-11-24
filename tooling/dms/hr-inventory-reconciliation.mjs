import { createHash } from 'node:crypto';

const checkpointVersion = 1;
const changeKinds = ['exact', 'renamed', 'changed', 'new', 'missing', 'unverified'];
const dispositions = [
  'reviewedPrepared', 'reviewedHeld', 'approvedPrepared', 'approvedHold', 'unverifiedReviewHold', 'unclassifiedHold',
];
const reviewableStatuses = new Set(['readable', 'partial', 'unreadable']);
const sha256Pattern = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isToken(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/[\0\r\n]/.test(value);
}

function isPathSegment(value) {
  return isToken(value) && !/[\\/]/.test(value) && value !== '.' && value !== '..';
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value) {
  return typeof value === 'string' && value.length === 64 && sha256Pattern.test(value);
}

function sortedRows(byId) {
  return [...byId.keys()].sort().map((id) => byId.get(id));
}

function normalizeSnapshot(snapshot, label) {
  if (snapshot?.complete !== true || !Array.isArray(snapshot.items)) {
    throw new Error(`${label} inventory requires a complete snapshot`);
  }
  const scope = [snapshot.scope?.tenantId, snapshot.scope?.driveId, snapshot.scope?.sourceId];
  if (!scope.every(isToken)) throw new Error(`${label} snapshot has invalid source scope`);

  const byId = new Map();
  const paths = new Set();
  for (const row of snapshot.items) {
    const { id, name, folderNames, version = null, etag = null, size = null, mime = null } = row ?? {};
    if (!isToken(id) || !isPathSegment(name) || !Array.isArray(folderNames) ||
        !folderNames.every(isPathSegment) ||
        (etag !== null && !isToken(etag)) ||
        (version !== null && (!isToken(version) || !/^[ce]:.+$/.test(version))) ||
        (version?.startsWith('e:') && version.slice(2) !== etag) ||
        (size !== null && !isCount(size)) || (mime !== null && !isToken(mime))) {
      throw new Error(`${label} snapshot contains invalid file metadata`);
    }
    if (byId.has(id)) throw new Error(`${label} snapshot contains a duplicate item ID`);
    const path = [...folderNames, name].join('/');
    if (paths.has(path)) throw new Error(`${label} snapshot contains a duplicate relative path`);
    paths.add(path);
    byId.set(id, { id, path, version, etag, size, mime });
  }
  return { scope, byId, paths };
}

function normalizeReviews(rows) {
  if (!Array.isArray(rows)) throw new Error('Review rows must be an array');
  const byId = new Map();
  const byPath = new Map();
  for (const row of rows) {
    const { sourceId, relativePath, sha256: digest = null, sourceStatus, result } = row ?? {};
    const outcome = result?.outcome ?? null;
    if (!isToken(sourceId) || typeof relativePath !== 'string' || !relativePath.split('/').every(isPathSegment) ||
        !isToken(sourceStatus) || (digest !== null && !isSha256(digest)) ||
        (outcome !== null && outcome !== 'prepared' && outcome !== 'held') || (outcome !== null && !digest)) {
      throw new Error('Review rows contain invalid source evidence');
    }
    if (byId.has(sourceId)) throw new Error('Review rows contain a duplicate source ID');
    if (byPath.has(relativePath)) throw new Error('Review rows contain a duplicate relative path');
    const review = { sourceId, relativePath, digest, sourceStatus, outcome };
    byId.set(sourceId, review);
    byPath.set(relativePath, review);
  }
  return { byId, byPath };
}

function indexVerifiedBindings(rows, prior, reviews) {
  if (!Array.isArray(rows)) throw new Error('Verified review bindings must be an array');
  const byItemId = new Map();
  for (const row of rows) {
    const { sourceId, id, version, size, sha256: digest } = row ?? {};
    const previousItem = prior.byId.get(id);
    const review = reviews.byId.get(sourceId);
    if (!isToken(version) || !isCount(size) || !isSha256(digest) ||
        previousItem?.version !== version || previousItem.size !== size ||
        review?.digest !== digest || review.relativePath !== previousItem.path || !isReviewCandidate(review)) {
      throw new Error('Verified review binding does not match an exact prior item and review');
    }
    if (byItemId.has(id)) throw new Error('Verified review bindings contain a duplicate item ID');
    byItemId.set(id, { id, sourceId, version, size, digest });
  }
  return byItemId;
}

function indexApprovalRows(rows, label, isHold = false) {
  if (!Array.isArray(rows)) throw new Error(`${label} rows must be an array`);
  const byId = new Map();
  for (const row of rows) {
    const { sourceId, sha256: digest, state } = row ?? {};
    if (!isToken(sourceId) || !isSha256(digest) || (isHold && state !== 'awaiting_evidence')) {
      throw new Error(`${label} rows contain invalid approval evidence`);
    }
    if (byId.has(sourceId)) throw new Error(`${label} rows contain a duplicate source ID`);
    byId.set(sourceId, digest);
  }
  return byId;
}

function handoffScopeDigest(rows) {
  return sha256([...rows].map(([sourceId, digest]) => `${sourceId}:${digest}`).sort().join('\n'));
}

function parseHoldQueue(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text === '') return [];
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw new Error('Approved handoff hold queue is invalid UTF-8 JSONL');
  }
}

function verifyHandoff({ authorizedRows, holdQueueBytes, handoff }) {
  const scope = indexApprovalRows(authorizedRows, 'Approved handoff scope');
  if (handoffScopeDigest(scope) !== handoff?.authorizedSourceDigest) {
    throw new Error('Approved handoff authorized scope digest does not match');
  }
  if (!(holdQueueBytes instanceof Uint8Array) || sha256(holdQueueBytes) !== handoff.queueChecksum) {
    throw new Error('Approved handoff hold queue checksum does not match');
  }
  const holds = indexApprovalRows(parseHoldQueue(holdQueueBytes), 'Approved hold', true);
  if (handoffScopeDigest(holds) !== handoff.queueScopeDigest) {
    throw new Error('Approved handoff hold queue scope digest does not match');
  }
  const { checkedPaths, heldPaths, preparedPaths } = handoff;
  if (scope.size !== checkedPaths || holds.size !== heldPaths || !isCount(preparedPaths) ||
      checkedPaths !== heldPaths + preparedPaths) {
    throw new Error('Approved handoff counts do not match');
  }
  for (const [id, digest] of holds) {
    if (scope.get(id) !== digest) throw new Error('Approved hold is outside the authorized scope');
    scope.delete(id);
  }
  return { holds, prepared: scope };
}

function validateApprovals(approvals, reviews) {
  for (const rows of [approvals.holds, approvals.prepared]) {
    for (const [id, digest] of rows) {
      if (approvals.holds.has(id) && approvals.prepared.has(id)) {
        throw new Error('Review has conflicting approved dispositions');
      }
      const review = reviews.byId.get(id);
      if (review?.outcome !== 'held' || review.digest !== digest || !reviewableStatuses.has(review.sourceStatus)) {
        throw new Error('Approved disposition does not match a held review');
      }
    }
  }
}

function approvalRows(byId) {
  return [...byId.keys()].sort().map((id) => [id, byId.get(id)]);
}

function changeKind(prior, current) {
  if (!prior) return 'new';
  if (!current) return 'missing';
  const comparison = [[prior.version, current.version], [prior.size, current.size], [prior.mime, current.mime]];
  if (comparison.some(([before, after]) => before !== null && after !== null && before !== after)) {
    return 'changed';
  }
  if (comparison.some(([before, after]) => before === null || after === null)) return 'unverified';
  return prior.path === current.path ? 'exact' : 'renamed';
}

function isReviewCandidate(review) {
  return review?.digest && review.outcome && reviewableStatuses.has(review.sourceStatus);
}

function currentDisposition(change, review, proven, approvals) {
  if ((change !== 'exact' && change !== 'renamed') || !isReviewCandidate(review)) {
    return 'unclassifiedHold';
  }
  if (!proven) return 'unverifiedReviewHold';
  if (approvals.holds.has(review.sourceId)) return 'approvedHold';
  if (approvals.prepared.has(review.sourceId)) return 'approvedPrepared';
  return review.outcome === 'prepared' ? 'reviewedPrepared' : 'reviewedHeld';
}

function readCounters(values, keys) {
  if (values === null || typeof values !== 'object' || Object.keys(values).length !== keys.length ||
      !keys.every((key) => Object.hasOwn(values, key) && isCount(values[key]))) {
    throw new Error('Invalid checkpoint counters');
  }
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

function makeCheckpoint(inputDigest, nextIndex, counts) {
  const state = { schemaVersion: checkpointVersion, inputDigest, nextIndex, counts };
  return { ...state, integrity: sha256(JSON.stringify(state)) };
}

function restoreCheckpoint(checkpoint, inputDigest, itemCount) {
  if (checkpoint === null || typeof checkpoint !== 'object' || Object.keys(checkpoint).length !== 5 ||
      checkpoint.schemaVersion !== checkpointVersion || !isCount(checkpoint.nextIndex) ||
      checkpoint.nextIndex > itemCount || Object.keys(checkpoint.counts ?? {}).length !== 2) {
    throw new Error('Invalid checkpoint');
  }
  if (checkpoint.inputDigest !== inputDigest) throw new Error('Checkpoint belongs to different inventory inputs');
  const counts = {
    change: readCounters(checkpoint.counts.change, changeKinds),
    currentDisposition: readCounters(checkpoint.counts.currentDisposition, dispositions),
  };
  const total = (counter) => Object.values(counter).reduce((sum, count) => sum + count, 0);
  if (total(counts.change) !== checkpoint.nextIndex ||
      total(counts.currentDisposition) !== checkpoint.nextIndex - counts.change.missing ||
      makeCheckpoint(inputDigest, checkpoint.nextIndex, counts).integrity !== checkpoint.integrity) {
    throw new Error('Invalid checkpoint');
  }
  return { nextIndex: checkpoint.nextIndex, counts };
}

/**
 * Reconciles two complete, caller-validated Graph inventories within one pinned source.
 * The prior path finds review candidates. A caller-verified independent byte receipt
 * must bind each review source ID and SHA to the prior Graph ID, version and size.
 * The current receipt must match that ID and opaque version (prefer cTag, fall back
 * to eTag), with size and MIME guards. Matching metadata alone leaves reviews held.
 * A `renamed` result includes a move with the same exact identity and content version.
 * Supply a trusted handoff receipt with raw queue bytes, or approval rows already verified
 * by the caller. Preparation dispositions describe historical review and grant no action.
 * A caller may serialize the counts-only checkpoint and restore it with the same inputs.
 * The integrity digest detects corruption in local, trusted checkpoint storage.
 */
export function reconcileHrInventory({
  prior, current, reviews, verifiedReviewBindings = [], approvedHandoff, approvedHolds, approvedPrepared,
}, { checkpoint, maxItems = Infinity } = {}) {
  if (maxItems !== Infinity && (!isCount(maxItems) || maxItems === 0)) throw new Error('Invalid item limit');
  const before = normalizeSnapshot(prior, 'Prior');
  const after = normalizeSnapshot(current, 'Current');
  if (JSON.stringify(before.scope) !== JSON.stringify(after.scope)) {
    throw new Error('Graph snapshots must use the same source scope');
  }
  const reviewed = normalizeReviews(reviews);
  const verified = indexVerifiedBindings(verifiedReviewBindings, before, reviewed);
  if (approvedHandoff !== undefined && (approvedHolds !== undefined || approvedPrepared !== undefined)) {
    throw new Error('Choose one source of approved dispositions');
  }
  const approvals = approvedHandoff === undefined ? {
    holds: indexApprovalRows(approvedHolds ?? [], 'Approved hold', true),
    prepared: indexApprovalRows(approvedPrepared ?? [], 'Approved prepared'),
  } : verifyHandoff(approvedHandoff);
  validateApprovals(approvals, reviewed);

  const itemIds = [...new Set([...before.byId.keys(), ...after.byId.keys()])].sort();
  const inputDigest = sha256(JSON.stringify([
    before.scope, sortedRows(before.byId), sortedRows(after.byId), sortedRows(reviewed.byId), sortedRows(verified),
    approvalRows(approvals.holds), approvalRows(approvals.prepared),
  ]));
  const { nextIndex, counts } = checkpoint === undefined ? {
    nextIndex: 0,
    counts: {
      change: Object.fromEntries(changeKinds.map((kind) => [kind, 0])),
      currentDisposition: Object.fromEntries(dispositions.map((kind) => [kind, 0])),
    },
  } : restoreCheckpoint(checkpoint, inputDigest, itemIds.length);

  const end = nextIndex + Math.min(maxItems, itemIds.length - nextIndex);
  for (let index = nextIndex; index < end; index++) {
    const oldItem = before.byId.get(itemIds[index]);
    const change = changeKind(oldItem, after.byId.get(itemIds[index]));
    counts.change[change]++;
    if (change === 'missing') continue;
    const disposition = currentDisposition(change, reviewed.byPath.get(oldItem?.path), verified.has(oldItem?.id), approvals);
    counts.currentDisposition[disposition]++;
  }

  const unmatchedReviews = [...reviewed.byId.values()].filter((review) => !before.paths.has(review.relativePath));
  return {
    complete: end === itemIds.length,
    summary: {
      priorFiles: before.byId.size,
      currentFiles: after.byId.size,
      reviewRows: reviewed.byId.size,
      unmatchedReviewRows: unmatchedReviews.length,
      verifiedReviewBindings: verified.size,
      approvedHoldRows: approvals.holds.size,
      unmatchedApprovedHoldRows: unmatchedReviews.filter((review) => approvals.holds.has(review.sourceId)).length,
      approvedPreparedRows: approvals.prepared.size,
      unmatchedApprovedPreparedRows: unmatchedReviews.filter((review) => approvals.prepared.has(review.sourceId)).length,
      ...counts,
    },
    checkpoint: makeCheckpoint(inputDigest, end, counts),
  };
}
