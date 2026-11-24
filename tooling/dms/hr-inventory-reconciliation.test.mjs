import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { reconcileHrInventory } from './hr-inventory-reconciliation.mjs';

const scope = { tenantId: 'tenant', driveId: 'drive', sourceId: 'hr-root' };
const digest = 'a'.repeat(64);

function item(id, name, overrides = {}) {
  return { id, name, version: `c:${id}:1`, etag: `${id}:1`, size: 100,
    folderNames: ['archive'], mime: 'application/pdf', ...overrides };
}

function snapshot(items, extra = {}) {
  return { scope, complete: true, items, ...extra };
}

function review(sourceId, relativePath, outcome, sha256 = digest) {
  return { sourceId, relativePath, sha256, sourceStatus: 'readable', result: { outcome } };
}

function proof(id, sourceId) {
  return { id, sourceId, version: `c:${id}:1`, size: 100, sha256: digest };
}

function fixture() {
  const priorItems = [
    item('1', 'exact.pdf'), item('2', 'rename.pdf'), item('3', 'changed.pdf'),
    item('4', 'gone.pdf'), item('5', 'reviewed.pdf'), item('6', 'uncatalogued.pdf'),
    item('7', 'retained-hold.pdf'), item('9', 'unverified.pdf'),
    item('10', 'exclusion.pdf'), item('11', 'size-changed.pdf'), item('12', 'mime-changed.pdf'),
  ];
  const currentItems = [
    item('1', 'exact.pdf'), item('2', 'employee-name-secret.pdf', { etag: '2:2', folderNames: ['moved'] }),
    item('3', 'changed.pdf', { version: 'c:3:2', etag: '3:2' }),
    item('5', 'reviewed.pdf'), item('6', 'uncatalogued.pdf'), item('7', 'retained-hold.pdf'),
    item('8', 'gone.pdf'), item('9', 'unverified.pdf', { version: null }), item('10', 'exclusion.pdf'),
    item('11', 'size-changed.pdf', { size: 101 }), item('12', 'mime-changed.pdf', { mime: 'image/png' }),
  ];
  return {
    prior: snapshot(priorItems),
    current: snapshot(currentItems),
    reviews: [
      review('review-exact', 'archive/exact.pdf', 'prepared'),
      review('review-rename', 'archive/rename.pdf', 'held'),
      review('review-changed', 'archive/changed.pdf', 'held'),
      review('review-gone', 'archive/gone.pdf', 'held'),
      review('review-explicit', 'archive/reviewed.pdf', 'held'),
      review('review-hold', 'archive/retained-hold.pdf', 'held'),
      review('review-unverified', 'archive/unverified.pdf', 'prepared'),
      { ...review('review-exclusion', 'archive/exclusion.pdf', undefined, null), sourceStatus: 'excluded' },
      review('review-unmatched', 'archive/ancillary.ini', undefined),
      review('review-size', 'archive/size-changed.pdf', 'prepared'),
      review('review-mime', 'archive/mime-changed.pdf', 'prepared'),
    ],
    approvedHolds: [
      { sourceId: 'review-rename', sha256: digest, state: 'awaiting_evidence' },
      { sourceId: 'review-hold', sha256: digest, state: 'awaiting_evidence' },
    ],
    verifiedReviewBindings: [
      proof('1', 'review-exact'), proof('2', 'review-rename'),
      proof('5', 'review-explicit'), proof('7', 'review-hold'),
    ],
  };
}

test('carries reviewed evidence only across exact Graph identity and a verified version', () => {
  const result = reconcileHrInventory(fixture());
  assert.equal(result.complete, true);
  assert.deepEqual(result.summary, {
    priorFiles: 11, currentFiles: 11, reviewRows: 11, unmatchedReviewRows: 1, verifiedReviewBindings: 4,
    approvedHoldRows: 2, unmatchedApprovedHoldRows: 0,
    approvedPreparedRows: 0, unmatchedApprovedPreparedRows: 0,
    change: { exact: 5, renamed: 1, changed: 3, new: 1, missing: 1, unverified: 1 },
    currentDisposition: { reviewedPrepared: 1, reviewedHeld: 1, approvedPrepared: 0, approvedHold: 2,
      unverifiedReviewHold: 0, unclassifiedHold: 7 },
  });
});

test('holds historical review candidates until independent exact-version byte evidence binds them', () => {
  const input = fixture();
  const report = reconcileHrInventory({ ...input, verifiedReviewBindings: [] }).summary;
  assert.equal(report.change.exact, 5);
  assert.equal(report.change.renamed, 1);
  assert.equal(report.approvedHoldRows, 2);
  assert.equal(report.currentDisposition.approvedHold, 0);
  assert.equal(report.currentDisposition.reviewedPrepared, 0);
  assert.equal(report.currentDisposition.reviewedHeld, 0);
  assert.equal(report.currentDisposition.unverifiedReviewHold, 4);
});

test('refuses a byte receipt for another version, size, path, or digest', () => {
  for (const replacement of [
    { version: 'c:1:2' }, { size: 101 }, { sourceId: 'review-rename' }, { sha256: 'b'.repeat(64) },
  ]) {
    const input = fixture();
    input.verifiedReviewBindings[0] = { ...input.verifiedReviewBindings[0], ...replacement };
    assert.throws(() => reconcileHrInventory(input), /does not match an exact prior item and review/);
  }
});

test('inherits only exact approved prepared dispositions from explicitly supplied approvals', () => {
  const input = fixture();
  const approvedPrepared = [
    { sourceId: 'review-explicit', sha256: digest },
    { sourceId: 'review-changed', sha256: digest },
  ];
  const report = reconcileHrInventory({ ...input, approvedPrepared }).summary;
  assert.equal(report.approvedPreparedRows, 2);
  assert.equal(report.currentDisposition.approvedPrepared, 1);
  assert.equal(report.currentDisposition.reviewedHeld, 0);
  assert.equal(report.currentDisposition.unclassifiedHold, 7);
  assert.throws(() => reconcileHrInventory({ ...input, approvedPrepared: [
    ...approvedPrepared, { sourceId: 'review-rename', sha256: digest },
  ] }), /conflicting approved dispositions/);
});

test('derives prepared remainder only after verifying the complete handoff scope and hold queue', () => {
  const input = fixture();
  const { approvedHolds: holds, ...snapshotInput } = input;
  const authorizedRows = [...holds, { sourceId: 'review-explicit', sha256: digest }];
  const holdQueueBytes = Buffer.from(holds.map((hold) => JSON.stringify(hold)).join('\r\n') + '\r\n');
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const approvedHandoff = {
    authorizedRows, holdQueueBytes,
    handoff: {
      checkedPaths: 3, preparedPaths: 1, heldPaths: 2,
      authorizedSourceDigest: hash(`review-explicit:${digest}\nreview-hold:${digest}\nreview-rename:${digest}`),
      queueScopeDigest: hash(`review-hold:${digest}\nreview-rename:${digest}`),
      queueChecksum: hash(holdQueueBytes),
    },
  };
  const report = reconcileHrInventory({ ...snapshotInput, approvedHandoff }).summary;
  assert.equal(report.currentDisposition.approvedPrepared, 1);
  assert.equal(report.currentDisposition.approvedHold, 2);
  const editedQueue = Buffer.from(holdQueueBytes.toString().replaceAll('\r\n', '\n'));
  assert.throws(() => reconcileHrInventory({ ...snapshotInput, approvedHandoff: {
    ...approvedHandoff, holdQueueBytes: editedQueue,
  } }), /hold queue checksum/);
  assert.throws(() => reconcileHrInventory({ ...snapshotInput, approvedHandoff: {
    ...approvedHandoff, authorizedRows: [{ sourceId: 'review-changed', sha256: digest }, ...holds],
  } }), /authorized scope digest/);
  assert.throws(() => reconcileHrInventory({ ...snapshotInput, approvedHandoff: {
    ...approvedHandoff, handoff: { ...approvedHandoff.handoff, checkedPaths: 4 },
  } }), /handoff counts/);
});

test('treats the eTag fallback as an opaque version and holds a renamed file with a changed eTag', () => {
  const input = fixture();
  const original = input.prior.items[1];
  const renamed = input.current.items[1];
  input.prior.items[1] = { ...original, version: 'e:2:1' };
  input.current.items[1] = { ...renamed, version: 'e:2:2' };
  input.verifiedReviewBindings[1].version = 'e:2:1';
  const result = reconcileHrInventory(input);
  assert.equal(result.summary.change.renamed, 0);
  assert.equal(result.summary.change.changed, 4);
  assert.equal(result.summary.currentDisposition.approvedHold, 1);
  assert.equal(result.summary.currentDisposition.unclassifiedHold, 8);
});

test('requires both Graph receipts to be complete and from the same pinned registration', () => {
  const input = fixture();
  assert.throws(() => reconcileHrInventory({ ...input, current: { ...input.current, complete: false } }),
    /complete snapshot/);
  assert.throws(() => reconcileHrInventory({ ...input, current: { ...input.current,
    scope: { ...scope, driveId: 'another-drive' } } }), /same source scope/);
});

test('rejects duplicate Graph identities and ambiguous historical paths without disclosing values', () => {
  const input = fixture();
  assert.throws(() => reconcileHrInventory({ ...input, current: snapshot([
    ...input.current.items, item('7', 'private-doc-name.pdf'),
  ]) }), { message: 'Current snapshot contains a duplicate item ID' });
  assert.throws(() => reconcileHrInventory({ ...input, prior: snapshot([
    ...input.prior.items, item('other', 'exact.pdf'),
  ]) }), { message: 'Prior snapshot contains a duplicate relative path' });
});

test('checks hold approval against the reviewed source ID, digest and held outcome', () => {
  const input = fixture();
  assert.throws(() => reconcileHrInventory({ ...input, approvedHolds: [
    { sourceId: 'review-exact', sha256: digest, state: 'awaiting_evidence' },
  ] }), /match a held review/);
  assert.throws(() => reconcileHrInventory({ ...input, approvedHolds: [
    { sourceId: 'review-rename', sha256: 'b'.repeat(64), state: 'awaiting_evidence' },
  ] }), /match a held review/);
  assert.throws(() => reconcileHrInventory({ ...input, approvedHolds: [
    ...input.approvedHolds, input.approvedHolds[0],
  ] }), /duplicate source ID/);
});

test('rejects malformed digests before a reviewed disposition can be carried forward', () => {
  for (const sha256 of [[digest], `${digest}\n`]) {
    const input = fixture();
    input.reviews[0].sha256 = sha256;
    assert.throws(() => reconcileHrInventory(input), /invalid source evidence/);
  }
});

test('restarts from serialized metadata checkpoints across reordered copies of the same receipts', () => {
  const input = fixture();
  const expected = reconcileHrInventory(input);
  const first = reconcileHrInventory(input, { maxItems: 3 });
  assert.equal(first.complete, false);
  const reordered = { prior: snapshot([...input.prior.items].reverse()),
    current: snapshot([...input.current.items].reverse()), reviews: [...input.reviews].reverse(),
    approvedHolds: [...input.approvedHolds].reverse(), verifiedReviewBindings: [...input.verifiedReviewBindings].reverse() };
  const second = reconcileHrInventory(reordered, {
    checkpoint: JSON.parse(JSON.stringify(first.checkpoint)), maxItems: 2,
  });
  assert.equal(second.complete, false);
  assert.equal(second.checkpoint.nextIndex, 5);
  const resumed = reconcileHrInventory(input, { checkpoint: second.checkpoint });
  assert.deepEqual(resumed, expected);
  assert.deepEqual(reconcileHrInventory(input, { checkpoint: resumed.checkpoint }), expected);
});

test('rejects stale checkpoints and detects corrupt counts or cursors', () => {
  const input = fixture();
  const { checkpoint } = reconcileHrInventory(input, { maxItems: 2 });
  const changed = fixture();
  changed.current.items[1].version = 'c:2:3';
  assert.throws(() => reconcileHrInventory(changed, { checkpoint }), /different inventory inputs/);
  assert.throws(() => reconcileHrInventory(input, { checkpoint: { ...checkpoint, nextIndex: 1 } }),
    /invalid checkpoint/i);
  const corrupt = structuredClone(checkpoint);
  corrupt.counts.change.exact = 12;
  assert.throws(() => reconcileHrInventory(input, { checkpoint: corrupt }), /invalid checkpoint/i);
});

test('returns aggregate evidence without file names, Graph IDs, or review values', () => {
  const input = fixture();
  input.current.items[0].id = 'private-graph-id';
  input.reviews[0].result = { outcome: 'prepared', fields: { passport: 'private-employee-value' } };
  const report = JSON.stringify(reconcileHrInventory(input));
  for (const value of ['employee-name-secret.pdf', 'private-graph-id', 'archive/exact.pdf', 'review-rename',
    'private-employee-value', digest]) {
    assert.equal(report.includes(value), false);
  }
});
