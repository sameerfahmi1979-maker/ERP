/**
 * ERP DMS AI Phase 16 — Apply Source Resolver
 *
 * Resolves apply proposal items from source records.
 *
 * Tier 1 sources:
 *   - entity_match_candidate → dms_documents FK proposals (company, branch, party)
 *   - extraction_result → DMS metadata + document title/date proposals
 *   - validation_finding → safe DMS metadata/date field proposals
 *   - dms_metadata_apply → bridge to existing Phase 6/7 engine (metadata values only)
 *
 * Tier 2 sources:
 *   - extraction_result + selected party child row → party_licenses / party_tax_registrations proposals
 *   (target row must be explicitly selected by the user; no auto-select)
 *
 * NOT supported:
 *   - Direct parties writes
 *   - party_bank_details writes
 *   - HR/employee writes
 */

import type { ApplyItemProposal, ApplyValueType, PartyApplyTargetKind } from "./types";
import { validateApplyTarget } from "./apply-target-registry";
import { buildValueSummary, buildPartyFieldSummary } from "./apply-value-normalizer";

// ── Entity match candidate → document FK proposals ────────────────────────────

export type EntityMatchCandidateRow = {
  id:                 number;
  document_id:        number;
  target_entity_type: string;  // 'owner_company' | 'owner_branch' | 'party'
  target_entity_id:   number;
  target_entity_name: string | null;
  confidence:         number | null;
  source_text_summary: string | null;  // safe summary only (max 200 chars)
  status:             string;          // 'pending' | 'accepted' | 'rejected'
};

/**
 * Map a Tier 1 entity match target type to a dms_documents field.
 */
function entityTypeToDocumentField(targetEntityType: string): string | null {
  switch (targetEntityType) {
    case "owner_company": return "owning_company_id";
    case "owner_branch":  return "owning_branch_id";
    case "party":         return "party_id";
    default:              return null;
  }
}

/**
 * Resolve an entity match candidate into apply item proposals.
 * Only produces items for accepted candidates. Rejected candidates are skipped.
 */
export function resolveEntityMatchCandidateProposals(
  candidate: EntityMatchCandidateRow,
  currentDocumentFieldValues: Record<string, unknown>
): ApplyItemProposal[] {
  if (candidate.status !== "accepted") {
    return [];  // only accepted candidates are eligible for apply
  }

  const targetField = entityTypeToDocumentField(candidate.target_entity_type);
  if (!targetField) return [];

  const validation = validateApplyTarget("dms_documents", targetField);
  if (!validation.valid) return [];

  const currentValue = currentDocumentFieldValues[targetField];
  const currentSummary = currentValue !== null && currentValue !== undefined
    ? buildValueSummary(currentValue, "bigint")
    : null;

  const proposedSummary = buildValueSummary(candidate.target_entity_id, "bigint");
  const hasExistingValue = currentValue !== null && currentValue !== undefined;

  return [
    {
      sourceType:          "entity_match_candidate",
      sourceId:            candidate.id,
      sourceFieldCode:     candidate.target_entity_type,
      targetTable:         "dms_documents",
      targetField,
      targetRecordId:      candidate.document_id,
      targetDisplayLabel:  `${validation.field.label}: ${candidate.target_entity_name ?? String(candidate.target_entity_id)}`,
      currentValueSummary: currentSummary,
      proposedValueSummary: proposedSummary,
      valueType:           "bigint" as ApplyValueType,
      confidence:          candidate.confidence,
      requiresConfirmation: true,
      conflictRisk:        hasExistingValue,
    },
  ];
}

// ── Validation finding → metadata/date proposals ───────────────────────────────

export type ValidationFindingRow = {
  id:               number;
  document_id:      number;
  field_code:       string | null;
  proposed_value:   unknown;
  current_value:    unknown;
  confidence:       number | null;
  finding_type:     string;
  status:           string;
};

/**
 * Resolve a validation finding into apply proposals.
 * Only "safe" DMS document date fields and metadata values are resolved in Tier 1.
 * Active/confirmed findings only.
 */
export function resolveValidationFindingProposals(
  finding: ValidationFindingRow
): ApplyItemProposal[] {
  if (finding.status !== "active" && finding.status !== "confirmed") return [];
  if (!finding.field_code || !finding.proposed_value) return [];

  const { field_code, proposed_value, current_value, document_id, confidence } = finding;

  // Only safe Tier 1 date fields from dms_documents
  const safeDocumentDateFields = new Set(["issue_date", "expiry_date"]);

  if (safeDocumentDateFields.has(field_code)) {
    const validation = validateApplyTarget("dms_documents", field_code);
    if (!validation.valid) return [];

    const currentSummary = current_value !== null && current_value !== undefined
      ? buildValueSummary(current_value, "date")
      : null;

    return [
      {
        sourceType:          "validation_finding",
        sourceId:            finding.id,
        sourceFieldCode:     field_code,
        targetTable:         "dms_documents",
        targetField:         field_code,
        targetRecordId:      document_id,
        targetDisplayLabel:  validation.field.label,
        currentValueSummary:  currentSummary,
        proposedValueSummary: buildValueSummary(proposed_value, "date"),
        valueType:           "date",
        confidence,
        requiresConfirmation: true,
        conflictRisk:        currentSummary !== null,
      },
    ];
  }

  return [];  // other finding types not resolved in Tier 1
}

// ── Party child row proposals (Tier 2) ────────────────────────────────────────

export type PartyChildRowCurrentValues = Record<string, unknown>;

/**
 * Build apply item proposals for a selected party child row.
 *
 * The caller must:
 *   1. Have the user explicitly select/confirm the targetRecordId.
 *   2. Pass current field values from the live row.
 *   3. Pass AI-proposed values from extraction or ERP mapping.
 *
 * No auto-creation. No auto-selection. targetRecordId is required.
 *
 * @param opts.targetKind        - 'party_licenses' or 'party_tax_registrations'
 * @param opts.targetRecordId    - explicitly selected child row ID
 * @param opts.partyId           - confirmed party_id
 * @param opts.documentId        - source document ID
 * @param opts.sourceType        - what generated the proposals (extraction_result, etc.)
 * @param opts.sourceId          - source record ID
 * @param opts.currentValues     - live current field values from DB row
 * @param opts.proposedValues    - AI-proposed values for allowlisted fields
 */
export function resolvePartyChildRowProposals(opts: {
  targetKind:     PartyApplyTargetKind;
  targetRecordId: number;
  partyId:        number;
  documentId:     number;
  sourceType:     ApplyItemProposal["sourceType"];
  sourceId:       number | null;
  currentValues:  PartyChildRowCurrentValues;
  proposedValues: Record<string, unknown>;
}): ApplyItemProposal[] {
  const {
    targetKind, targetRecordId, sourceType, sourceId,
    currentValues, proposedValues,
  } = opts;

  const proposals: ApplyItemProposal[] = [];

  for (const [field, proposedValue] of Object.entries(proposedValues)) {
    if (proposedValue === null || proposedValue === undefined || proposedValue === "") continue;

    const validation = validateApplyTarget(targetKind, field);
    if (!validation.valid) continue;  // skip non-allowlisted fields

    const currentRaw = currentValues[field];
    const currentSummary = currentRaw !== null && currentRaw !== undefined
      ? buildPartyFieldSummary(field, currentRaw, validation.field.valueType === "date" ? "date" : "text")
      : null;
    const proposedSummary = buildPartyFieldSummary(
      field,
      proposedValue,
      validation.field.valueType === "date" ? "date" : "text"
    );

    proposals.push({
      sourceType,
      sourceId,
      sourceFieldCode:      field,
      targetTable:          targetKind,
      targetField:          field,
      targetRecordId,
      targetDisplayLabel:   validation.field.label,
      currentValueSummary:  currentSummary,
      proposedValueSummary: proposedSummary,
      valueType:            validation.field.valueType,
      confidence:           null,
      requiresConfirmation: true,
      conflictRisk:         currentSummary !== null,
    });
  }

  return proposals;
}

// ── Source-type dispatcher ────────────────────────────────────────────────────

export type ApplySourceInput =
  | { sourceType: "entity_match_candidate"; row: EntityMatchCandidateRow; currentDocFields: Record<string, unknown> }
  | { sourceType: "validation_finding";     row: ValidationFindingRow }
  | { sourceType: "extraction_result";      items: ApplyItemProposal[] }  // pre-built by caller
  | { sourceType: "dms_metadata_apply";     items: ApplyItemProposal[] }; // pre-built by caller

/**
 * Resolve an apply source into a list of item proposals.
 * The 'extraction_result' and 'dms_metadata_apply' types pass pre-built items
 * through (source resolver does light validation only).
 */
export function resolveApplySourceProposals(input: ApplySourceInput): ApplyItemProposal[] {
  switch (input.sourceType) {
    case "entity_match_candidate":
      return resolveEntityMatchCandidateProposals(input.row, input.currentDocFields);

    case "validation_finding":
      return resolveValidationFindingProposals(input.row);

    case "extraction_result":
    case "dms_metadata_apply":
      // Items are pre-built by the server action; just pass them through after allowlist validation
      return input.items.filter((item) => {
        const v = validateApplyTarget(item.targetTable, item.targetField);
        return v.valid;
      });
  }
}
