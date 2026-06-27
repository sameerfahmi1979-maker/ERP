/**
 * ERP DMS AI Phase 16 — Apply Conflict Detector
 *
 * Detects conflicts between the previewed current value and the live DB value
 * immediately before applying a write. Prevents stale-preview overwrites.
 *
 * Tier 1 rules (dms_documents, dms_document_metadata_values):
 *   - Reload target record fresh from DB before every apply check
 *   - If record missing → conflict
 *   - If current DB value differs from preview's currentValueSummary → conflict
 *     (unless replaceExistingConfirmed=true)
 *   - If DB field is already non-empty and replaceExistingConfirmed=false → conflict
 *
 * Tier 2 rules (party_licenses, party_tax_registrations):
 *   - null target row → conflict (target_record_not_found)
 *   - party_id mismatch → conflict (target_party_mismatch)
 *   - is_active=false → conflict (target_record_inactive)
 *   - field value changed since preview → conflict (target_field_changed)
 *   - existing value + replaceExistingConfirmed=false → conflict
 */

import type { ConflictDetectionResult } from "./types";

// ── dms_documents field conflict ──────────────────────────────────────────────

export type DmsDocumentRecord = {
  id: number;
  owning_company_id: number | null;
  owning_branch_id:  number | null;
  party_id:          number | null;
  issue_date:        string | null;
  expiry_date:       string | null;
  title:             string | null;
  description:       string | null;
  deleted_at:        string | null;
};

/**
 * Check for conflict on a dms_documents field.
 *
 * @param currentDoc         - live record reloaded from DB
 * @param targetField        - column name
 * @param previewCurrentValue - value summary from the preview (what we saw before)
 * @param replaceExistingConfirmed - user confirmed overwriting
 */
export function detectDmsDocumentFieldConflict(
  currentDoc: DmsDocumentRecord | null,
  targetField: keyof DmsDocumentRecord,
  previewCurrentValue: string | null,
  replaceExistingConfirmed: boolean
): ConflictDetectionResult {
  if (!currentDoc) {
    return { conflict: true, reason: "document record not found or was deleted" };
  }
  if (currentDoc.deleted_at) {
    return { conflict: true, reason: "document was deleted since preview" };
  }

  const liveRaw = currentDoc[targetField];
  const liveStr = liveRaw !== null && liveRaw !== undefined
    ? String(liveRaw)
    : null;

  // If the live value is non-empty (non-null) and user hasn't confirmed replacement
  if (liveStr !== null && !replaceExistingConfirmed) {
    // Only a conflict if we are about to overwrite an existing value
    return {
      conflict: true,
      reason: `field "${targetField}" already has a value; set replaceExistingConfirmed=true to overwrite`,
    };
  }

  // If both preview and live are null/empty → no conflict
  if (!previewCurrentValue && !liveStr) {
    return { conflict: false };
  }

  // If the preview showed a value but live is now different → conflict
  if (previewCurrentValue !== null && liveStr !== previewCurrentValue) {
    return {
      conflict: true,
      reason: `field "${targetField}" value changed since preview (preview had "${truncate(previewCurrentValue)}", live is "${truncate(liveStr)}")`,
    };
  }

  return { conflict: false };
}

// ── dms_document_metadata_values conflict ─────────────────────────────────────

export type DmsMetadataValueRecord = {
  id:               number | null;  // null = no row exists yet
  definition_id:    number;
  document_id:      number;
  value_text:       string | null;
  value_number:     number | null;
  value_date:       string | null;
  value_boolean:    boolean | null;
};

/**
 * Check for conflict on a dms_document_metadata_values field.
 *
 * @param currentRow          - live metadata value row (null if not yet seeded)
 * @param targetField         - column (value_text | value_number | value_date | value_boolean)
 * @param previewCurrentValue - summary from preview
 * @param replaceExistingConfirmed - user confirmed overwriting
 */
export function detectMetadataValueConflict(
  currentRow: DmsMetadataValueRecord | null,
  targetField: "value_text" | "value_number" | "value_date" | "value_boolean",
  previewCurrentValue: string | null,
  replaceExistingConfirmed: boolean
): ConflictDetectionResult {
  // Row not existing yet = no conflict (new insert)
  if (!currentRow) {
    return { conflict: false };
  }

  const liveRaw = currentRow[targetField];
  const liveStr = liveRaw !== null && liveRaw !== undefined
    ? String(liveRaw)
    : null;

  if (liveStr !== null && !replaceExistingConfirmed) {
    return {
      conflict: true,
      reason: `metadata field "${targetField}" already has a value; set replaceExistingConfirmed=true to overwrite`,
    };
  }

  if (previewCurrentValue !== null && liveStr !== previewCurrentValue) {
    return {
      conflict: true,
      reason: `metadata field "${targetField}" changed since preview`,
    };
  }

  return { conflict: false };
}

// ── party_licenses field conflict (Tier 2) ────────────────────────────────────

/** Minimal safe shape for a party_licenses row loaded fresh from DB. */
export type PartyLicenseRecord = {
  id:        number;
  party_id:  number;
  is_active: boolean;
  [key: string]: unknown;  // dynamic field access for allowlisted columns
};

/**
 * Check for conflict before writing to a party_licenses field.
 *
 * @param currentRow          - fresh row from DB (null if not found)
 * @param expectedPartyId     - expected party_id for ownership check
 * @param targetField         - allowlisted column to write
 * @param previewCurrentValue - summary from when run was created
 * @param replaceExistingConfirmed - user confirmed overwriting
 */
export function detectPartyLicenseFieldConflict(
  currentRow: PartyLicenseRecord | null,
  expectedPartyId: number,
  targetField: string,
  previewCurrentValue: string | null,
  replaceExistingConfirmed: boolean
): ConflictDetectionResult {
  if (!currentRow) {
    return { conflict: true, reason: "target_record_not_found" };
  }
  if (currentRow.party_id !== expectedPartyId) {
    return { conflict: true, reason: "target_party_mismatch" };
  }
  if (!currentRow.is_active) {
    return { conflict: true, reason: "target_record_inactive" };
  }

  const liveRaw = currentRow[targetField];
  const liveStr = liveRaw !== null && liveRaw !== undefined ? String(liveRaw) : null;

  if (liveStr !== null && !replaceExistingConfirmed) {
    return { conflict: true, reason: "replace_existing_not_confirmed" };
  }

  if (previewCurrentValue !== null && liveStr !== previewCurrentValue) {
    return { conflict: true, reason: "target_field_changed" };
  }

  return { conflict: false };
}

// ── party_tax_registrations field conflict (Tier 2) ───────────────────────────

/** Minimal safe shape for a party_tax_registrations row loaded fresh from DB. */
export type PartyTaxRecord = {
  id:        number;
  party_id:  number;
  is_active: boolean;
  [key: string]: unknown;  // dynamic field access for allowlisted columns
};

/**
 * Check for conflict before writing to a party_tax_registrations field.
 *
 * @param currentRow          - fresh row from DB (null if not found)
 * @param expectedPartyId     - expected party_id for ownership check
 * @param targetField         - allowlisted column to write
 * @param previewCurrentValue - summary from when run was created
 * @param replaceExistingConfirmed - user confirmed overwriting
 */
export function detectPartyTaxFieldConflict(
  currentRow: PartyTaxRecord | null,
  expectedPartyId: number,
  targetField: string,
  previewCurrentValue: string | null,
  replaceExistingConfirmed: boolean
): ConflictDetectionResult {
  if (!currentRow) {
    return { conflict: true, reason: "target_record_not_found" };
  }
  if (currentRow.party_id !== expectedPartyId) {
    return { conflict: true, reason: "target_party_mismatch" };
  }
  if (!currentRow.is_active) {
    return { conflict: true, reason: "target_record_inactive" };
  }

  const liveRaw = currentRow[targetField];
  const liveStr = liveRaw !== null && liveRaw !== undefined ? String(liveRaw) : null;

  if (liveStr !== null && !replaceExistingConfirmed) {
    return { conflict: true, reason: "replace_existing_not_confirmed" };
  }

  if (previewCurrentValue !== null && liveStr !== previewCurrentValue) {
    return { conflict: true, reason: "target_field_changed" };
  }

  return { conflict: false };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function truncate(val: string | null, max = 60): string | null {
  if (!val) return val;
  return val.length > max ? val.slice(0, max - 3) + "..." : val;
}
