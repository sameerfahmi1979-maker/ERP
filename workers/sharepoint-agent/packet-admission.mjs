import { createHash } from 'node:crypto';

const mixedIdentity = 'mixed_passport_and_emirates_id';
const held = reason => ({ status: 'held', reason });

function coversOriginal(pages, pageCount) {
  return Array.isArray(pages) && pages.length === pageCount && new Set(pages).size === pageCount
    && pages.every(page => Number.isSafeInteger(page) && page >= 1 && page <= pageCount);
}

/**
 * Evaluate a local original-reader proof before ERP admission. The proof must come
 * from the trusted reader for the claimed source, never from an AI Fill response.
 * Ready permits the intact bytes to continue to the ordinary worker gates.
 */
export function assessPacketAdmission({ item, bytes, proof }) {
  if (!proof || !item || typeof item.item_id !== 'string' || !item.item_id
      || typeof item.version !== 'string' || !item.version
      || proof.itemId !== item.item_id || proof.sourceVersion !== item.version
      || !Buffer.isBuffer(bytes) || !bytes.length
      || proof.sourceSha256 !== createHash('sha256').update(bytes).digest('hex')) {
    return held('packet_source_mismatch');
  }

  const { pageCount, inspectedPages, sourceReview } = proof;
  if (Array.isArray(sourceReview?.reasons) && sourceReview.reasons.includes(mixedIdentity)) {
    return { status: 'correction_required', reason: mixedIdentity };
  }
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || !coversOriginal(inspectedPages, pageCount)) {
    return held('packet_inspection_incomplete');
  }
  if (sourceReview?.outcome !== 'prepared' || !sourceReview.profileId
      || !Array.isArray(sourceReview.reasons) || sourceReview.reasons.length) {
    return held('packet_review_required');
  }

  if (sourceReview.profileId === 'medical-fitness') {
    const { certificatePages, supportingPages } = sourceReview.packet ?? {};
    const { linkedSupportingPages } = proof;
    // Listing a page as support is insufficient. The reader must affirm its
    // association with the exact assessment independently of page order.
    if (!Array.isArray(certificatePages) || certificatePages.length !== 1
        || !Array.isArray(supportingPages)
        || !coversOriginal([...certificatePages, ...supportingPages], pageCount)
        || !Array.isArray(linkedSupportingPages) || linkedSupportingPages.length !== supportingPages.length
        || !supportingPages.every(page => linkedSupportingPages.includes(page))) {
      return held('medical_packet_evidence_incomplete');
    }
  }
  return { status: 'ready', bytes };
}
