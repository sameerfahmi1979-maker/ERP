import assert from 'node:assert/strict';
import test from 'node:test';
import { produceVerifiedReviewBindings, sha256 } from './hr-verified-review-bindings.mjs';

const bytes = Buffer.from('%PDF-1.7\nsynthetic review\n');
const scope = { tenantId: 'tenant', driveId: 'drive', sourceId: 'root' };
const original = {
  id: 'item', version: 'c:one', mime: 'application/pdf', size: bytes.length, sha256: sha256(bytes), scope,
};
const file = { ...original, folderNames: ['folder'], name: 'original.pdf' };
const review = { sourceId: 'review', sourceStatus: 'readable', relativePath: 'folder/original.pdf',
  sha256: original.sha256, result: { outcome: 'held' } };
const inputs = {
  prior: { complete: true, scope, items: [file] },
  current: { complete: true, scope, items: [{ ...file, name: 'renamed.pdf' }] },
  reviews: [review], originals: [original], readBytes: async () => bytes,
};

test('hashes matching bytes and carries across a rename by stable Graph identity', async () => {
  const result = await produceVerifiedReviewBindings(inputs);
  assert.deepEqual(result.bindings, [
    { sourceId: review.sourceId, id: file.id, version: file.version, size: bytes.length, sha256: original.sha256 },
  ]);
  assert.equal(Object.values(result.holds).reduce((sum, next) => sum + next), 0);
});

test('refuses mismatched scope before opening bytes', async () => {
  let read = false;
  const result = await produceVerifiedReviewBindings({ ...inputs,
    originals: [{ ...original, scope: { ...scope, driveId: 'other-drive' } }],
    readBytes: async () => { read = true; return bytes; },
  });
  assert.equal(read, false);
  assert.equal(result.bindings.length, 0);
  assert.equal(result.holds.scopeMismatch, 1);
  await assert.rejects(() => produceVerifiedReviewBindings({ ...inputs,
    current: { ...inputs.current, scope: { ...scope, sourceId: 'different-root' } },
  }), /binding_snapshot_unverified/);
});

test('refuses a matching path with another item ID, changed version, or changed length', async () => {
  for (const changed of [{ id: 'other-item' }, { version: 'c:two' }, { size: bytes.length + 1 }, { mime: 'image/png' }]) {
    const result = await produceVerifiedReviewBindings({ ...inputs,
      current: { ...inputs.current, items: [{ ...file, ...changed }] },
    });
    assert.equal(result.bindings.length, 0);
    assert.equal(result.holds.historicalOrCurrentVersionMismatch, 1);
  }
});

test('holds if a retained hash differs from the review', async () => {
  const result = await produceVerifiedReviewBindings({ ...inputs, reviews: [{ ...review, sha256: '0'.repeat(64) }] });
  assert.equal(result.bindings.length, 0);
  assert.equal(result.holds.reviewMissingOrDifferentDigest, 1);
});

test('independently detects an altered original even when its length is unchanged', async () => {
  const altered = Buffer.from(bytes);
  altered[altered.length - 2] ^= 1;
  const result = await produceVerifiedReviewBindings({ ...inputs, readBytes: async () => altered });
  assert.equal(result.bindings.length, 0);
  assert.equal(result.holds.digestMismatch, 1);
});

test('holds if bytes are unavailable, short, or not a PDF', async () => {
  const unavailable = await produceVerifiedReviewBindings({ ...inputs, readBytes: async () => { throw Error(); } });
  assert.equal(unavailable.holds.bytesUnavailable, 1);
  for (const invalid of [bytes.subarray(0, -1), Buffer.alloc(bytes.length)]) {
    const result = await produceVerifiedReviewBindings({ ...inputs, readBytes: async () => invalid });
    assert.equal(result.bindings.length, 0);
    assert.equal(result.holds.invalidFormatOrLength, 1);
  }
});

test('rejects duplicate original item IDs', async () => {
  await assert.rejects(() => produceVerifiedReviewBindings({ ...inputs, originals: [original, original] }),
    /binding_input_identity_invalid_or_duplicate/);
});


test('rejects two historical item IDs at the same recorded path', async () => {
  await assert.rejects(() => produceVerifiedReviewBindings({ ...inputs,
    prior: { ...inputs.prior, items: [file, { ...file, id: 'other-item' }] },
  }), /binding_input_identity_invalid_or_duplicate/);
});
