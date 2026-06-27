/**
 * ERP DMS AI Phase 16 — Apply Target Registry
 *
 * Server-side allowlist of permitted Apply-to-ERP targets.
 *
 * Tier 1 (DMS-owned fields):
 *   - dms_documents FK and basic fields
 *   - dms_document_metadata_values (via Phase 6/7 bridge)
 *
 * Tier 2 (Party child records — human-reviewed, flag-gated):
 *   - party_licenses (6 allowlisted fields)
 *   - party_tax_registrations (4 allowlisted fields)
 *
 * Forbidden forever (HR, payroll, bank, raw AI data):
 *   - HR/employee tables
 *   - parties direct profile fields
 *   - party_bank_details (IBAN, account)
 *   - salary/payroll/medical_diagnosis fields
 *
 * Safety:
 *   - isForbiddenTarget() blocks sensitive patterns regardless of allowlist
 *   - validateApplyTarget() rejects anything not explicitly allowlisted
 */

import type { ApplyTargetModule, ApplyValueType } from "./types";

// ── Field metadata ─────────────────────────────────────────────────────────────

export type ApplyTargetFieldMeta = {
  column:      string;
  label:       string;
  valueType:   ApplyValueType;
  /** Required DMS permission for write. */
  permission:  string;
  /** Whether an existing value may be replaced (requires replaceExistingConfirmed). */
  replaceable: boolean;
  /** Max length for text fields (null = no limit beyond db). */
  maxLength:   number | null;
};

export type ApplyTargetConfig = {
  targetModule:  ApplyTargetModule;
  targetTable:   string;
  tableLabel:    string;
  /** Primary DMS permission to write. */
  permission:    string;
  /** Alternate admin permission that also grants write. */
  adminPermission: string;
  fields:        ApplyTargetFieldMeta[];
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const APPLY_TARGET_REGISTRY: Record<string, ApplyTargetConfig> = {
  "dms_documents": {
    targetModule:   "dms_document",
    targetTable:    "dms_documents",
    tableLabel:     "DMS Document",
    permission:     "dms.documents.edit",
    adminPermission: "dms.admin",
    fields: [
      {
        column:      "owning_company_id",
        label:       "Owning Company",
        valueType:   "bigint",
        permission:  "dms.documents.edit",
        replaceable: false,
        maxLength:   null,
      },
      {
        column:      "owning_branch_id",
        label:       "Owning Branch",
        valueType:   "bigint",
        permission:  "dms.documents.edit",
        replaceable: false,
        maxLength:   null,
      },
      {
        column:      "party_id",
        label:       "Party",
        valueType:   "bigint",
        permission:  "dms.documents.edit",
        replaceable: false,
        maxLength:   null,
      },
      {
        column:      "issue_date",
        label:       "Issue Date",
        valueType:   "date",
        permission:  "dms.documents.edit",
        replaceable: true,
        maxLength:   null,
      },
      {
        column:      "expiry_date",
        label:       "Expiry Date",
        valueType:   "date",
        permission:  "dms.documents.edit",
        replaceable: true,
        maxLength:   null,
      },
      {
        column:      "title",
        label:       "Document Title",
        valueType:   "text",
        permission:  "dms.documents.edit",
        replaceable: true,
        maxLength:   200,
      },
      {
        column:      "description",
        label:       "Description",
        valueType:   "text",
        permission:  "dms.documents.edit",
        replaceable: true,
        maxLength:   500,
      },
    ],
  },

  "dms_document_metadata_values": {
    targetModule:   "dms_metadata",
    targetTable:    "dms_document_metadata_values",
    tableLabel:     "DMS Document Metadata",
    permission:     "dms.documents.edit",
    adminPermission: "dms.admin",
    fields: [
      { column: "value_text",    label: "Text Value",    valueType: "text",    permission: "dms.documents.edit", replaceable: true, maxLength: 2000 },
      { column: "value_number",  label: "Number Value",  valueType: "number",  permission: "dms.documents.edit", replaceable: true, maxLength: null },
      { column: "value_date",    label: "Date Value",    valueType: "date",    permission: "dms.documents.edit", replaceable: true, maxLength: null },
      { column: "value_boolean", label: "Boolean Value", valueType: "boolean", permission: "dms.documents.edit", replaceable: true, maxLength: null },
    ],
  },

  // ── Tier 2: Party child records ─────────────────────────────────────────────
  // Requires: DMS_AI_APPLY_TO_ERP=true + DMS_AI_APPLY_TO_ERP_PARTY=true
  // Plus specific sub-flag per table.

  "party_licenses": {
    targetModule:    "party",
    targetTable:     "party_licenses",
    tableLabel:      "Party License",
    permission:      "master_data.parties.manage_licenses",
    adminPermission: "master_data.parties.edit",
    fields: [
      {
        column:      "license_number",
        label:       "License Number",
        valueType:   "text",
        permission:  "master_data.parties.manage_licenses",
        replaceable: true,
        maxLength:   200,
      },
      {
        column:      "license_name",
        label:       "License Name",
        valueType:   "text",
        permission:  "master_data.parties.manage_licenses",
        replaceable: true,
        maxLength:   300,
      },
      {
        column:      "license_activity_text",
        label:       "License Activity",
        valueType:   "text",
        permission:  "master_data.parties.manage_licenses",
        replaceable: true,
        maxLength:   500,
      },
      {
        column:      "issue_date",
        label:       "Issue Date",
        valueType:   "date",
        permission:  "master_data.parties.manage_licenses",
        replaceable: true,
        maxLength:   null,
      },
      {
        column:      "expiry_date",
        label:       "Expiry Date",
        valueType:   "date",
        permission:  "master_data.parties.manage_licenses",
        replaceable: true,
        maxLength:   null,
      },
      {
        column:      "remarks",
        label:       "Remarks",
        valueType:   "text",
        permission:  "master_data.parties.manage_licenses",
        replaceable: true,
        maxLength:   1000,
      },
    ],
  },

  "party_tax_registrations": {
    targetModule:    "party",
    targetTable:     "party_tax_registrations",
    tableLabel:      "Party Tax Registration",
    permission:      "master_data.parties.manage_tax",
    adminPermission: "master_data.parties.edit",
    fields: [
      {
        column:      "tax_registration_number",
        label:       "Tax Registration Number",
        valueType:   "text",
        permission:  "master_data.parties.manage_tax",
        replaceable: true,
        maxLength:   100,
      },
      {
        column:      "effective_from",
        label:       "Effective From",
        valueType:   "date",
        permission:  "master_data.parties.manage_tax",
        replaceable: true,
        maxLength:   null,
      },
      {
        column:      "effective_to",
        label:       "Effective To",
        valueType:   "date",
        permission:  "master_data.parties.manage_tax",
        replaceable: true,
        maxLength:   null,
      },
      {
        column:      "remarks",
        label:       "Remarks",
        valueType:   "text",
        permission:  "master_data.parties.manage_tax",
        replaceable: true,
        maxLength:   1000,
      },
    ],
  },
};

// ── Forbidden patterns ────────────────────────────────────────────────────────
// These match on table name OR field/column name patterns.
// isForbiddenTarget() blocks these regardless of allowlist state.

const FORBIDDEN_TABLE_PATTERNS = [
  /payroll/i,
  /salar/i,     // matches salary, salaries, salary_records, etc.
  /bank_detail/i,
  /iban/i,
  /disciplinar/i,
  /medical_diagnosis/i,
  /audit_log/i,
  /erp_ai_usage/i,
  /erp_ai_feature_flag/i,
  /numbering_sequence/i,
  /user_role/i,
  /user_permission/i,
  /^auth\./i,
];

const FORBIDDEN_FIELD_PATTERNS = [
  /salary/i,
  /payroll/i,
  /iban/i,
  /account_number/i,
  /password/i,
  /secret/i,
  /api_key/i,
  /^token/i,
  /raw_response/i,
  /ocr_text/i,
  /content_text/i,
  /chunk_text/i,
  /embedding/i,
  /vector/i,
  /full_text/i,
  /diagnosis/i,
  /basic_salary/i,
  /total_salary/i,
  /facility_limit/i,
];

/**
 * Returns true if the table OR field name matches a forbidden pattern.
 * This check runs server-side before any allowlist check.
 */
export function isForbiddenTarget(table: string, field: string): boolean {
  for (const pattern of FORBIDDEN_TABLE_PATTERNS) {
    if (pattern.test(table)) return true;
  }
  for (const pattern of FORBIDDEN_FIELD_PATTERNS) {
    if (pattern.test(field)) return true;
  }
  return false;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type ApplyTargetValidation =
  | { valid: true; config: ApplyTargetConfig; field: ApplyTargetFieldMeta }
  | { valid: false; reason: string };

/**
 * Validate that a (table, field) combination is in the allowlist (Tier 1 or Tier 2).
 * Also runs forbidden pattern check.
 */
export function validateApplyTarget(
  targetTable: string,
  targetField: string
): ApplyTargetValidation {
  // Forbidden check runs before allowlist check
  if (isForbiddenTarget(targetTable, targetField)) {
    return { valid: false, reason: `target "${targetTable}.${targetField}" is in the forbidden list` };
  }

  const config = APPLY_TARGET_REGISTRY[targetTable];
  if (!config) {
    return { valid: false, reason: `target_table "${targetTable}" is not in the apply allowlist` };
  }

  const fieldMeta = config.fields.find((f) => f.column === targetField);
  if (!fieldMeta) {
    return { valid: false, reason: `target_field "${targetField}" is not in the allowed fields for "${targetTable}"` };
  }

  return { valid: true, config, field: fieldMeta };
}

/**
 * Get target config for a specific table.
 * Returns null if not in allowlist.
 */
export function getApplyTargetConfig(targetTable: string): ApplyTargetConfig | null {
  return APPLY_TARGET_REGISTRY[targetTable] ?? null;
}

/**
 * Get required permissions for applying to a specific target table/field.
 */
export function getTargetPermissions(
  targetTable: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _targetField: string
): { dmsApplyPermission: string; targetPermission: string; adminPermission: string } {
  const config = APPLY_TARGET_REGISTRY[targetTable];
  return {
    dmsApplyPermission: "dms.apply_to_erp.run",
    targetPermission:   config?.permission ?? "dms.documents.edit",
    adminPermission:    config?.adminPermission ?? "dms.admin",
  };
}

/**
 * List all allowlisted targets (Tier 1 + Tier 2).
 * Renamed from listTier1ApplyTargets for breadth; backward-compat alias kept below.
 */
export function listAllApplyTargets(): Array<{
  table: string;
  config: ApplyTargetConfig;
}> {
  return Object.entries(APPLY_TARGET_REGISTRY).map(([table, config]) => ({
    table,
    config,
  }));
}

/** @deprecated Use listAllApplyTargets() instead. Kept for backward compatibility. */
export function listTier1ApplyTargets(): Array<{ table: string; config: ApplyTargetConfig }> {
  return listAllApplyTargets().filter((t) => t.config.targetModule !== "party");
}

/**
 * List only Tier 2 (Party child) allowlisted targets.
 */
export function listTier2ApplyTargets(): Array<{ table: string; config: ApplyTargetConfig }> {
  return listAllApplyTargets().filter((t) => t.config.targetModule === "party");
}
