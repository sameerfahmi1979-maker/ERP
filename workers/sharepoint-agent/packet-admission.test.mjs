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

function medicalFixture() {
  const input = fixture(3);
  input.proof.sourceReview = {
    outcome: 'prepared', profileId: 'medical-fitness', reasons: [],
    packet: { certificatePages: [2], supportingPages: [1, 3] },
  };
  input.proof.medicalPageEvidence = [
    { page: 1, method: 'verified-transcription', kind: 'supporting-test', text: 'Blood Test Report\nAssessment ID: AS-101\nPatient ID: PT-01' },
    { page: 2, method: 'verified-transcription', kind: 'certificate', text: 'Medical Fitness Certificate\nAssessment ID: AS-101\nPatient ID: PT-01' },
    { page: 3, method: 'verified-transcription', kind: 'supporting-test', text: 'Audiometry Report\nAssessment ID: AS-101\nPatient ID: PT-01' },
  ];
  return input;
}

test('returns one unchanged original when every test has the same exact assessment and patient IDs', () => {
  const input = medicalFixture();
  const result = assessPacketAdmission(input);
  assert.equal(result.status, 'ready');
  assert.equal(result.bytes, input.bytes);
  assert.equal(createHash('sha256').update(result.bytes).digest('hex'), input.proof.sourceSha256);
});

test('holds medical support when the proof supplies only an asserted list of linked pages', () => {
  const input = medicalFixture();
  delete input.proof.medicalPageEvidence;
  input.proof.linkedSupportingPages = [1, 3];
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'held', reason: 'medical_packet_evidence_incomplete',
  });
});

for (const [name, edit] of [
  ['another patient', page => { page.text = page.text.replace('PT-01', 'PT-02'); }],
  ['another assessment', page => { page.text = page.text.replace('AS-101', 'AS-1010'); }],
  ['contradictory assessment IDs', page => { page.text += '\nAssessment ID: AS-102'; }],
  ['unlabelled assessment reference', page => { page.text = page.text.replace('Assessment ID:', 'Result:'); }],
  ['OCR alone', page => { page.method = 'ocr'; }],
  ['unverified page role', page => { page.kind = 'other'; }],
  ['duplicate page evidence', page => { page.page = 3; }],
]) {
  test(`holds a medical packet with ${name}`, () => {
    const input = medicalFixture();
    edit(input.proof.medicalPageEvidence[0]);
    assert.deepEqual(assessPacketAdmission(input), { status: 'held', reason: 'medical_packet_evidence_incomplete' });
  });
}

test('holds duplicate or omitted page numbers instead of accepting an incomplete inspection', () => {
  const input = fixture();
  input.proof.inspectedPages = [1, 1];
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'held', reason: 'packet_inspection_incomplete',
  });
});

test('holds a sparse inspection list even when its length matches the original', () => {
  const input = fixture();
  delete input.proof.inspectedPages[1];
  assert.deepEqual(assessPacketAdmission(input), {
    status: 'held', reason: 'packet_inspection_incomplete',
  });
});

test('requires complete inspection before asking for a corrected original', () => {
  const input = fixture(3);
  input.proof.sourceReview = { outcome: 'held', profileId: null, reasons: ['mixed_passport_and_emirates_id'] };
  input.proof.inspectedPages = [1, 2];
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

test('holds an original larger than the Graph admission limit even when its digest matches', () => {
  const input = medicalFixture();
  input.bytes = Buffer.alloc(3 * 1024 * 1024 + 1, '%PDF-');
  input.proof.sourceSha256 = createHash('sha256').update(input.bytes).digest('hex');
  assert.deepEqual(assessPacketAdmission(input), { status: 'held', reason: 'packet_source_mismatch' });
});
