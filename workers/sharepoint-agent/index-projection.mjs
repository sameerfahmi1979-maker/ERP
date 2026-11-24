import { isDeepStrictEqual } from 'node:util';

const opaqueReference = /^[A-Za-z0-9_!.-]{1,256}$/u;
const sourceItem = /^[A-Za-z0-9_!-]{1,256}$/u;
const sourceVersion = /^[ce]:[A-Za-z0-9!"{},.:_ -]{1,510}$/u;
const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const statuses = new Set([
  'discovered', 'processing', 'awaiting_review', 'correction_required', 'retry_scheduled', 'complete', 'exception',
]);
const outcomes = new Set(['filed', 'duplicate_skipped', 'rejected', 'excluded']);
const reviewReasons = new Set([
  'duplicate_suspected', 'intake_binding_mismatch', 'intake_no_longer_available', 'intake_processing_failed',
  'manual_review_required', 'mixed_passport_emirates_id', 'mixed_subjects', 'missing_field_evidence',
  'source_changed_or_unsupported', 'source_fingerprint_mismatch', 'sharepoint_intake_ready', 'unreadable_source',
]);

const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);

function requireScope(expected, actual) {
  if (!actual || expected.connection_id !== actual.connection_id || expected.company_id !== actual.company_id ||
      expected.branch_id !== actual.branch_id) throw new Error('scope_mismatch');
}

function validScope(scope) {
  return matches(opaqueReference, scope?.connection_id) && positiveInteger(scope.company_id) &&
    (scope.branch_id === null || positiveInteger(scope.branch_id));
}

function timestamp(value) {
  if (!matches(utcTimestamp, value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function key(row) {
  if (!matches(sourceItem, row.source_item_id) || !matches(sourceVersion, row.source_version)) {
    throw new Error('invalid_source_reference');
  }
  return row.source_item_id + ':' + row.source_version;
}

function receiptReference(value, pattern = opaqueReference) {
  if (value == null) return null;
  if (!matches(pattern, value)) throw new Error('invalid_receipt_field');
  return value;
}

function disposition(receipt, allowEmployeeNumbers, sourceState) {
  const status = receipt?.processing_status ?? (sourceState === 'removed' ? 'complete' : 'discovered');
  const outcome = receipt?.outcome ?? null;
  if (!statuses.has(status) || (outcome !== null && (!outcomes.has(outcome) || status !== 'complete'))) {
    throw new Error('invalid_receipt_status');
  }
  const number = receipt?.document_read_back === true ? receiptReference(receipt.dms_document_number) : null;
  if (outcome === 'filed' && !number) throw new Error('unverified_filing');
  const linksRecorded = number && (outcome === 'filed' || outcome === 'duplicate_skipped');
  return {
    employee_number: linksRecorded && allowEmployeeNumbers === true && receipt.employee_link_read_back === true
      ? receiptReference(receipt.employee_number) : null,
    dms_intake_reference: receiptReference(receipt?.dms_intake_reference),
    dms_document_number: linksRecorded ? number : null,
    processing_status: status,
    outcome,
  };
}

// The caller reads a complete scoped snapshot and its commit metadata from the ERP.
// The processing revision may advance while the Graph discovery checkpoint stays the same.
export function projectAgentIndex({ scope, checkpoint, snapshot, allowEmployeeNumbers = false }) {
  if (!validScope(scope)) throw new Error('invalid_scope');
  requireScope(scope, checkpoint);
  requireScope(scope, snapshot);
  const generatedAt = timestamp(snapshot.committed_at);
  if (!positiveInteger(checkpoint.revision) || snapshot.checkpoint_revision !== checkpoint.revision) {
    throw new Error('checkpoint_revision_mismatch');
  }
  if (!positiveInteger(snapshot.revision) || !generatedAt ||
      !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.receipts)) throw new Error('invalid_snapshot');

  const receipts = new Map();
  for (const receipt of snapshot.receipts) {
    requireScope(scope, receipt);
    const reference = key(receipt);
    if (receipts.has(reference)) throw new Error('duplicate_receipt');
    receipts.set(reference, receipt);
  }

  const seen = new Set();
  const files = snapshot.sources.map(source => {
    requireScope(scope, source);
    const receipt = receipts.get(key(source));
    const checkedAt = timestamp(source.last_checked_at);
    if (!checkedAt || checkedAt > generatedAt || !['present', 'removed'].includes(source.source_state)) {
      throw new Error('invalid_source');
    }
    if (seen.has(source.source_item_id)) throw new Error('duplicate_source');
    seen.add(source.source_item_id);
    const profile = receipt?.profile_version;
    const reason = receipt?.review_reason;
    return {
      source_item_id: source.source_item_id,
      source_version: source.source_version,
      content_sha256: receiptReference(receipt?.content_sha256, /^[a-f0-9]{64}$/u),
      file_reference: source.source_item_id,
      source_state: source.source_state,
      document_type_code: receiptReference(receipt?.document_type_code, /^[A-Z][A-Z0-9_]{0,63}$/u),
      document_variant: receiptReference(receipt?.document_variant, /^[a-z][a-z0-9_-]{0,63}$/u),
      profile_version: positiveInteger(profile) ? profile : receiptReference(profile, /^[a-z0-9][a-z0-9._-]{0,63}$/u),
      ...disposition(receipt, allowEmployeeNumbers, source.source_state),
      last_checked_at: checkedAt,
      case_reference: receiptReference(receipt?.case_reference),
      review_reason: reason == null ? null : reviewReasons.has(reason) ? reason : 'manual_review_required',
    };
  });
  files.sort((left, right) => Number(left.source_item_id > right.source_item_id) -
    Number(left.source_item_id < right.source_item_id));
  return {
    schema_version: 1, connection_id: scope.connection_id, company_id: scope.company_id, branch_id: scope.branch_id,
    revision: snapshot.revision, generated_at: generatedAt, files,
  };
}

// A future publisher must also compare the remote ETag on any write.
export function compareAgentIndexRevision(candidate, published) {
  if (!validScope(candidate) || candidate.schema_version !== 1 || !positiveInteger(candidate.revision)) {
    throw new Error('invalid_projection');
  }
  if (published === null) return 'advance';
  requireScope(candidate, published);
  if (published.schema_version !== candidate.schema_version || !positiveInteger(published.revision)) {
    throw new Error('invalid_published_revision');
  }
  if (candidate.revision < published.revision) return 'stale';
  if (candidate.revision > published.revision) return 'advance';
  return isDeepStrictEqual(candidate, published) ? 'unchanged' : 'conflict';
}
