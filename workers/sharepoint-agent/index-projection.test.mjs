import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAgentIndexRevision, projectAgentIndex } from './index-projection.mjs';

const scope = { connection_id: 'test-connection', company_id: 1, branch_id: null };
const checkedAt = '2026-11-22T08:00:00.000Z';
const committedAt = '2026-11-22T08:01:00.000Z';
const current = {
  ...scope, source_item_id: 'item-a', source_version: 'c:"c:{VERSION},2"',
  source_state: 'present', last_checked_at: checkedAt,
};
const previous = { ...current, source_version: 'e:"{VERSION},1"' };
const filed = {
  ...current, content_sha256: 'a'.repeat(64), document_type_code: 'CICPA_PASS',
  document_variant: 'onshore', profile_version: 3, dms_intake_reference: 'INTAKE-1',
  dms_document_number: 'DMS-1900-000001', document_read_back: true, employee_number: 'EMP-001',
  employee_link_read_back: true, processing_status: 'complete', outcome: 'filed',
  case_reference: 'CASE-1', review_reason: null,
};

function input(sources = [current], receipts = [filed], revision = 9) {
  return {
    scope,
    checkpoint: { ...scope, revision: 7 },
    snapshot: {
      ...scope, revision, checkpoint_revision: 7, committed_at: committedAt, sources, receipts,
    },
  };
}

test('scope-bound manifest uses exact opaque source reference and only approved fields', () => {
  const value = input([{ ...current, filename: 'Employee Name Passport.pdf', download_url: 'https://example.invalid/token' }], [
    { ...filed, national_id: 'full-personal-id', raw_ocr: 'private original text', medical_details: 'private test result' },
  ]);
  const manifest = projectAgentIndex(value);
  assert.deepEqual(manifest, {
    schema_version: 1, ...scope, revision: 9, generated_at: committedAt, files: [{
      source_item_id: current.source_item_id, source_version: current.source_version,
      content_sha256: filed.content_sha256, file_reference: current.source_item_id, source_state: 'present',
      document_type_code: filed.document_type_code, document_variant: 'onshore', profile_version: 3,
      employee_number: null, dms_intake_reference: 'INTAKE-1', dms_document_number: filed.dms_document_number,
      processing_status: 'complete', outcome: 'filed', last_checked_at: checkedAt,
      case_reference: 'CASE-1', review_reason: null,
    }],
  });
  assert.doesNotMatch(JSON.stringify(manifest), /Employee Name|https|token|full-personal-id|private|EMP-001/u);
});

test('employee projection requires separately enabled readership and confirmed ERP link', () => {
  const value = input();
  value.allowEmployeeNumbers = true;
  assert.equal(projectAgentIndex(value).files[0].employee_number, 'EMP-001');
  value.snapshot.receipts = [{ ...filed, employee_link_read_back: false }];
  assert.equal(projectAgentIndex(value).files[0].employee_number, null);
});

test('new version has no prior outcome or employee reference and confirmed removal persists', () => {
  const removed = { ...current, source_item_id: 'item-b', source_state: 'removed' };
  const manifest = projectAgentIndex(input([current, removed], [{ ...filed, ...previous }]));
  assert.equal(manifest.files[0].processing_status, 'discovered');
  assert.equal(manifest.files[0].dms_document_number, null);
  assert.equal(manifest.files[0].outcome, null);
  assert.equal(manifest.files[1].source_state, 'removed');
  assert.equal(manifest.files[1].processing_status, 'complete');
});

test('scoped projection refuses sibling branch, unknown connection, and mismatched checkpoint', () => {
  assert.throws(() => projectAgentIndex(input([{ ...current, branch_id: 2 }])), /scope_mismatch/u);
  assert.throws(() => projectAgentIndex(input([current], [{ ...filed, connection_id: 'another-connection' }])), /scope_mismatch/u);
  const value = input();
  value.checkpoint.revision++;
  assert.throws(() => projectAgentIndex(value), /checkpoint_revision_mismatch/u);
  delete value.snapshot.committed_at;
  assert.throws(() => projectAgentIndex(value), /checkpoint_revision_mismatch/u);
  value.checkpoint.revision--;
  assert.throws(() => projectAgentIndex(value), /invalid_snapshot/u);
});

test('planned publication cannot replace a newer revision or overwrite a same-revision conflict', () => {
  const candidate = projectAgentIndex(input());
  const old = projectAgentIndex(input([current], [filed], 8));
  assert.equal(compareAgentIndexRevision(candidate, null), 'advance');
  assert.equal(compareAgentIndexRevision(candidate, old), 'advance');
  assert.equal(compareAgentIndexRevision(old, candidate), 'stale');
  assert.equal(compareAgentIndexRevision(candidate, JSON.parse(JSON.stringify(candidate))), 'unchanged');
  assert.equal(compareAgentIndexRevision(candidate, { ...candidate, files: [] }), 'conflict');
  assert.throws(() => compareAgentIndexRevision(candidate, { ...old, company_id: 2 }), /scope_mismatch/u);
});

test('ordering and JSON are deterministic across independent source reads', () => {
  const other = { ...current, source_item_id: 'item-b' };
  const first = projectAgentIndex(input([current, other], []));
  const second = projectAgentIndex(input([other, current], []));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.throws(() => projectAgentIndex(input([current, current], [])), /duplicate_source/u);
  assert.throws(() => projectAgentIndex(input([current], [filed, filed])), /duplicate_receipt/u);
});

test('unverified filing and sensitive free-text reasons, versions, and references fail closed', () => {
  assert.throws(() => projectAgentIndex(input([current], [{ ...filed, document_read_back: false }])), /unverified_filing/u);
  assert.throws(() => projectAgentIndex(input([{ ...current, source_version: 'c:https://example.invalid/token' }], [])), /invalid_source/u);
  assert.throws(() => projectAgentIndex(input([current], [{ ...filed, case_reference: 'https://example.invalid/token' }])), /invalid_receipt_field/u);
  const held = {
    ...filed, processing_status: 'exception', outcome: null, document_read_back: false, dms_document_number: null,
    review_reason: 'personal details that stay in the case',
  };
  assert.equal(projectAgentIndex(input([current], [held])).files[0].review_reason, 'manual_review_required');
});

test('duplicate skip may have a confirmed original or an intake without a filed reference', () => {
  const duplicate = { ...filed, outcome: 'duplicate_skipped', document_read_back: false };
  const projected = projectAgentIndex(input([current], [duplicate])).files[0];
  assert.equal(projected.outcome, 'duplicate_skipped');
  assert.equal(projected.dms_document_number, null);
  assert.equal(projectAgentIndex(input([current], [{ ...duplicate, document_read_back: true }])).files[0].dms_document_number,
    filed.dms_document_number);
});
