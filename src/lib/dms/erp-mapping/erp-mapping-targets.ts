/**
 * ERP DMS AI Phase 8 — ERP Mapping Target Registry
 *
 * Server-side allowlist of permitted ERP mapping targets.
 * ALL target_table and target_field values used in dms_metadata_erp_mappings
 * must be validated against this registry before any read or (future Phase 9) write.
 *
 * Safety rules:
 *  - No employees table (too many FK dependencies for Phase 8)
 *  - No fleet/asset tables (modules not yet implemented)
 *  - No FK columns in safe_fields
 *  - No system-generated fields (IDs, codes) in safe_fields
 *  - allow_apply_to_existing is managed at the mapping row level (Phase 8: always false)
 */

// ── Per-target config ─────────────────────────────────────────────────────────

export type ErpMappingFieldMeta = {
  /** DB column name */
  column: string;
  /** Human-readable label shown in admin UI */
  label: string;
  /** Broad field category — controls type-compatibility checks */
  category: "text" | "date" | "number" | "boolean";
};

export type ErpMappingTargetConfig = {
  targetModule: "hr" | "party";
  targetTable: string;
  /** Human-readable table label for admin UI */
  tableLabel: string;
  /** Permission code required to READ (preview) this target in Phase 8 */
  permission: string;
  /** Alternative admin permission that also grants access */
  adminPermission: string;
  /** FK column that connects child row to parent entity */
  relationField: string;
  /**
   * DMS entity_type codes whose entity_id IS the target record id directly.
   * (target_record_strategy = 'link_exact')
   */
  directEntityTypes: string[];
  /**
   * DMS entity_type code whose entity_id is the PARENT entity.
   * System must resolve child records via relationField.
   * (target_record_strategy = 'link_parent')
   */
  parentEntityType: string;
  /** Allowed target fields with metadata */
  fields: ErpMappingFieldMeta[];
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const ERP_MAPPING_TARGET_REGISTRY = {
  hr: {
    employee_identity_documents: {
      targetModule: "hr",
      targetTable: "employee_identity_documents",
      tableLabel: "HR — Identity Document",
      permission: "hr.compliance.manage",
      adminPermission: "hr.admin",
      relationField: "employee_id",
      directEntityTypes: ["employee_identity_document"],
      parentEntityType: "employee",
      fields: [
        { column: "document_number",      label: "Document Number",       category: "text" },
        { column: "issue_date",           label: "Issue Date",            category: "date" },
        { column: "expiry_date",          label: "Expiry Date",           category: "date" },
        { column: "visa_file_number",     label: "Visa File Number",      category: "text" },
        { column: "uid_number",           label: "UID Number",            category: "text" },
        { column: "labour_card_number",   label: "Labour Card Number",    category: "text" },
        { column: "work_permit_number",   label: "Work Permit Number",    category: "text" },
        { column: "mohre_person_code",    label: "MOHRE Person Code",     category: "text" },
        { column: "profession_on_document", label: "Profession on Document", category: "text" },
        { column: "place_of_issue",       label: "Place of Issue",        category: "text" },
        { column: "notes",                label: "Notes",                 category: "text" },
      ],
    },
    employee_medical_insurances: {
      targetModule: "hr",
      targetTable: "employee_medical_insurances",
      tableLabel: "HR — Medical Insurance",
      permission: "hr.compliance.manage",
      adminPermission: "hr.admin",
      relationField: "employee_id",
      directEntityTypes: ["employee_medical_insurance"],
      parentEntityType: "employee",
      fields: [
        { column: "policy_number",        label: "Policy Number",         category: "text" },
        { column: "insurance_provider",   label: "Insurance Provider",    category: "text" },
        { column: "tpa",                  label: "TPA",                   category: "text" },
        { column: "member_id",            label: "Member ID",             category: "text" },
        { column: "plan_name",            label: "Plan Name",             category: "text" },
        { column: "plan_class",           label: "Plan Class",            category: "text" },
        { column: "effective_date",       label: "Effective Date",        category: "date" },
        { column: "expiry_date",          label: "Expiry Date",           category: "date" },
      ],
    },
  },
  party: {
    party_licenses: {
      targetModule: "party",
      targetTable: "party_licenses",
      tableLabel: "Party — License",
      permission: "master_data.parties.manage_licenses",
      adminPermission: "master_data.parties.edit",
      relationField: "party_id",
      directEntityTypes: ["party_license"],
      parentEntityType: "party",
      fields: [
        { column: "license_number",        label: "License Number",        category: "text" },
        { column: "license_name",          label: "License Name",          category: "text" },
        { column: "license_activity_text", label: "License Activity",      category: "text" },
        { column: "issue_date",            label: "Issue Date",            category: "date" },
        { column: "expiry_date",           label: "Expiry Date",           category: "date" },
        { column: "remarks",               label: "Remarks",               category: "text" },
      ],
    },
    party_tax_registrations: {
      targetModule: "party",
      targetTable: "party_tax_registrations",
      tableLabel: "Party — Tax Registration",
      permission: "master_data.parties.manage_tax",
      adminPermission: "master_data.parties.edit",
      relationField: "party_id",
      directEntityTypes: ["party_tax_registration"],
      parentEntityType: "party",
      fields: [
        { column: "tax_registration_number", label: "Tax Registration Number", category: "text" },
        { column: "effective_from",           label: "Effective From",          category: "date" },
        { column: "effective_to",             label: "Effective To",            category: "date" },
        { column: "remarks",                  label: "Remarks",                 category: "text" },
      ],
    },
  },
} as const satisfies Record<string, Record<string, ErpMappingTargetConfig>>;

// ── Derived types ─────────────────────────────────────────────────────────────

export type ErpMappingTargetModule = keyof typeof ERP_MAPPING_TARGET_REGISTRY;

type HrTables   = keyof (typeof ERP_MAPPING_TARGET_REGISTRY)["hr"];
type PartyTables = keyof (typeof ERP_MAPPING_TARGET_REGISTRY)["party"];
export type ErpMappingTargetTable = HrTables | PartyTables;

// ── Validation helpers ────────────────────────────────────────────────────────

export type ErpMappingValidationResult =
  | { valid: true; config: ErpMappingTargetConfig; field: ErpMappingFieldMeta }
  | { valid: false; reason: string };

/** Validate that a (module, table, field) combination is in the allowlist. */
export function validateErpMappingTarget(
  targetModule: string,
  targetTable: string,
  targetField: string
): ErpMappingValidationResult {
  if (!(targetModule in ERP_MAPPING_TARGET_REGISTRY)) {
    return { valid: false, reason: `target_module "${targetModule}" is not in the ERP mapping allowlist` };
  }
  const module = ERP_MAPPING_TARGET_REGISTRY[targetModule as ErpMappingTargetModule];
  if (!(targetTable in module)) {
    return {
      valid: false,
      reason: `target_table "${targetTable}" is not allowed for module "${targetModule}"`,
    };
  }
  const config = module[targetTable as keyof typeof module] as ErpMappingTargetConfig;
  const fieldMeta = config.fields.find((f) => f.column === targetField);
  if (!fieldMeta) {
    return {
      valid: false,
      reason: `target_field "${targetField}" is not in the allowed fields for "${targetTable}"`,
    };
  }
  return { valid: true, config, field: fieldMeta };
}

/** Get the config for a specific target. Returns null when not found. */
export function getErpMappingTargetConfig(
  targetModule: string,
  targetTable: string
): ErpMappingTargetConfig | null {
  if (!(targetModule in ERP_MAPPING_TARGET_REGISTRY)) return null;
  const module = ERP_MAPPING_TARGET_REGISTRY[targetModule as ErpMappingTargetModule];
  if (!(targetTable in module)) return null;
  return module[targetTable as keyof typeof module] as ErpMappingTargetConfig;
}

/** List all allowed targets as a flat array — used by admin UI dropdowns. */
export function listErpMappingTargets(): Array<{
  module: string;
  table: string;
  config: ErpMappingTargetConfig;
}> {
  const result: Array<{ module: string; table: string; config: ErpMappingTargetConfig }> = [];
  for (const [mod, tables] of Object.entries(ERP_MAPPING_TARGET_REGISTRY)) {
    for (const [table, config] of Object.entries(tables)) {
      result.push({ module: mod, table, config: config as ErpMappingTargetConfig });
    }
  }
  return result;
}

/** List allowed fields for a specific (module, table) — used for cascading field dropdown. */
export function listErpMappingFields(
  targetModule: string,
  targetTable: string
): ErpMappingFieldMeta[] {
  const config = getErpMappingTargetConfig(targetModule, targetTable);
  return config ? [...config.fields] : [];
}
