import { createHash } from 'node:crypto';

const mixedIdentity = 'mixed_passport_and_emirates_id';
const maxPdfBytes = 3 * 1024 * 1024;
const maxMedicalPageText = 16_384;
const held = reason => ({ status: 'held', reason });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function coversOriginal(pages, pageCount) {
  if (!Array.isArray(pages) || pages.length !== pageCount) return false;
  const uniquePages = new Set(pages);
  return uniquePages.size === pageCount
    && [...uniquePages].every(page => Number.isSafeInteger(page) && page >= 1 && page <= pageCount);
}

function readMedicalReferences(evidence, kind) {
  if (evidence?.kind !== kind || evidence.method !== 'verified-transcription'
      || typeof evidence.text !== 'string' || evidence.text.length > maxMedicalPageText) return null;

  const assessmentIds = new Set();
  const patientIds = new Set();
  for (const line of evidence.text.split(/\r?\n/u)) {
    const labelled = /^[ \t]*(Assessment|Patient)[ \t]+(?:ID|Reference)[ \t]*:[ \t]*(.*?)[ \t]*$/iu.exec(line);
    if (!labelled) continue;
    const [, label, value] = labelled;
    if (!/^(?=.*[0-9])[A-Za-z0-9][A-Za-z0-9/-]{1,63}$/u.test(value)) return null;
    const values = label.toLowerCase() === 'assessment' ? assessmentIds : patientIds;
    values.add(value);
  }
  if (assessmentIds.size !== 1 || patientIds.size !== 1) return null;
  return { assessmentId: [...assessmentIds][0], patientId: [...patientIds][0] };
}

function medicalSupportMatches(packet, evidence, pageCount) {
  const { certificatePages, supportingPages } = packet ?? {};
  if (!Array.isArray(certificatePages) || certificatePages.length !== 1 || !Array.isArray(supportingPages)
      || !coversOriginal([...certificatePages, ...supportingPages], pageCount)) return false;
  if (!supportingPages.length) return true;
  if (!Array.isArray(evidence) || evidence.length !== pageCount
      || !coversOriginal(evidence.map(observation => observation?.page), pageCount)) return false;

  const byPage = new Map(evidence.map(observation => [observation.page, observation]));
  const certificate = readMedicalReferences(byPage.get(certificatePages[0]), 'certificate');
  return Boolean(certificate) && supportingPages.every(page => {
    const support = readMedicalReferences(byPage.get(page), 'supporting-test');
    return support?.assessmentId === certificate.assessmentId && support.patientId === certificate.patientId;
  });
}

/**
 * Evaluate a local original-reader proof before ERP admission. The proof must come
 * from the trusted reader for the claimed source. Medical evidence includes the
 * verified visible page role and verbatim labelled identifiers. Ready permits the
 * intact bytes to continue to the ordinary worker gates.
 */
export function assessPacketAdmission({ item, bytes, proof }) {
  if (!proof || !item || typeof item.item_id !== 'string' || !item.item_id
      || typeof item.version !== 'string' || !item.version
      || proof.itemId !== item.item_id || proof.sourceVersion !== item.version
      || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxPdfBytes
      || proof.sourceSha256 !== sha256(bytes)) {
    return held('packet_source_mismatch');
  }

  const { pageCount, inspectedPages, sourceReview } = proof;
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || !coversOriginal(inspectedPages, pageCount)) {
    return held('packet_inspection_incomplete');
  }
  if (Array.isArray(sourceReview?.reasons) && sourceReview.reasons.includes(mixedIdentity)) {
    return { status: 'correction_required', reason: mixedIdentity };
  }
  if (sourceReview?.outcome !== 'prepared' || !sourceReview.profileId
      || !Array.isArray(sourceReview.reasons) || sourceReview.reasons.length) {
    return held('packet_review_required');
  }

  if (sourceReview.profileId === 'medical-fitness'
      && !medicalSupportMatches(sourceReview.packet, proof.medicalPageEvidence, pageCount)) {
    return held('medical_packet_evidence_incomplete');
  }
  return { status: 'ready', bytes };
}
