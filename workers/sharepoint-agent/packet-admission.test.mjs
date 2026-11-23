import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { assessPacketAdmission } from './packet-admission.mjs';

function fixture(pageCount = 2) {
  const item = { item_id: 'synthetic-item', version: 'c:1' };
  const bytes = Buffer.from('%PDF-synthetic original including all pages');
  const proof = {
    itemId: item.item_id,
    sourceVersion: item.version,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    pageCount,
    inspectedPages: Array.from({ length: pageCount }, (_, index) => index + 1),
    sourceReview: { outcome: 'prepared', profileId: 'passport-in', reasons: [] },
  };
  return { item, bytes, proof };
}

test('asks for a corrected original when both identity credentials were detected', () => {
  const input = fixture();
  input.proof.sourceReview = { outcome: 'held', profileId: null, reasons: ['mixed_passport_and_emirates_id'] };
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'correction_required',
    reason: 'mixed_passport_and_emirates_id',
  });
});

test('returns one unchanged original when all medical support pages belong to the assessment', () => {
  const input = fixture(3);
  input.proof.sourceReview = {
    outcome: 'prepared', profileId: 'medical-fitness', reasons: [],
    packet: { certificatePages: [2], supportingPages: [1, 3] },
  };
  input.proof.linkedSupportingPages = [1, 3];
  const result = assessPacketAdmission(input);
  assert.equal(result.status, 'ready');
  assert.equal(result.bytes, input.bytes);
  assert.equal(createHash('sha256').update(result.bytes).digest('hex'), input.proof.sourceSha256);
});

test('holds unlinked medical support even when the packet reader lists it', () => {
  const input = fixture(3);
  input.proof.sourceReview = {
    outcome: 'prepared', profileId: 'medical-fitness', reasons: [],
    packet: { certificatePages: [2], supportingPages: [1, 3] },
  };
  input.proof.linkedSupportingPages = [1];
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'held', reason: 'medical_packet_evidence_incomplete',
  });
});

test('holds duplicate or omitted page numbers instead of accepting an incomplete inspection', () => {
  const input = fixture();
  input.proof.inspectedPages = [1, 1];
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'held', reason: 'packet_inspection_incomplete',
  });
});

test('keeps all pages of a reviewed standalone credential', () => {
  const input = fixture();
  assert.deepEqual(assessPacketAdmission(input), { status: 'ready', bytes: input.bytes });
});

test('never reuses a proof for changed bytes, a stale version or another item', () => {
  const input = fixture();
  const held = { status: 'held', reason: 'packet_source_mismatch' };
  assert.deepEqual(assessPacketAdmission({ ...input, bytes: Buffer.from('%PDF-other original') }), held);
  assert.deepEqual(assessPacketAdmission({ ...input, item: { ...input.item, version: 'c:2' } }), held);
  assert.deepEqual(assessPacketAdmission({ ...input, item: { ...input.item, item_id: 'another-item' } }), held);
});

test('fails closed for missing and unresolved source evidence', () => {
  const input = fixture();
  assert.deepEqual(assessPacketAdmission({ ...input, proof: undefined }), {
    status: 'held', reason: 'packet_source_mismatch',
  });
  input.proof.sourceReview = { outcome: 'held', profileId: null, reasons: ['ambiguous_layout'] };
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'held', reason: 'packet_review_required',
  });
});
