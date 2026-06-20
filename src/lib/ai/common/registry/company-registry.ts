/**
 * ERP COMMON AI.1A — Stage 1 Company (Organization) Registry
 *
 * Registers AI-eligible fields for the `owner_companies` entity.
 * Stage 1 — active for Common AI generation.
 *
 * RULES:
 * - Only safe, non-sensitive text/date fields are registered.
 * - No IDs, codes, audit fields, or status fields.
 * - FK fields (emirate_id, city_id) are registered as requires_review with
 *   explicit allowForeignKeyUpdate: true.
 * - compliance_status is NOT registered.
 */

import { assertAiFieldCanBeRegistered } from "../non-updatable-fields";
import type { ErpAiEntityRegistry } from "../types";

const ENTITY_TYPE = "company" as const;
const TARGET_TABLE = "owner_companies";
const APPLY_KEY_PREFIX = "apply_owner_company";

const TRADE_LICENSE_HINTS = ["TRADE_LICENSE", "VAT_CERTIFICATE", "TRN_CERTIFICATE", "POWER_OF_ATTORNEY", "UTILITY_BILL"];

/** Company registry: AI-eligible fields on owner_companies. */
export const COMPANY_REGISTRY: ErpAiEntityRegistry = {
  entityType: ENTITY_TYPE,
  entityLabel: "Organization",
  targetTable: TARGET_TABLE,
  idField: "id",
  displayField: "trade_name",
  viewPermission: "organizations.view",
  managePermission: "organizations.manage",
  stage: "stage_1",
  fields: [
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "trade_name",
      fieldLabel: "Trade Name",
      fieldType: "text",
      documentTypeHints: TRADE_LICENSE_HINTS,
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The registered trade name of the organization as it appears on the trade license.",
      validationHint: "Extract the exact trade name as printed on the trade license document.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_trade_name`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "main_activity",
      fieldLabel: "Main Business Activity",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The primary licensed business activity of the organization.",
      validationHint: "Extract the main/primary business activity as stated on the trade license.",
      maxLength: 500,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_main_activity`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "established_date",
      fieldLabel: "Established Date",
      fieldType: "date",
      documentTypeHints: ["TRADE_LICENSE", "MEMORANDUM_OF_ASSOCIATION"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The date the organization was established or incorporated.",
      validationHint: "Extract the establishment or incorporation date. Format: YYYY-MM-DD.",
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_established_date`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "office_address_line_1",
      fieldLabel: "Office Address Line 1",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE", "UTILITY_BILL", "TENANCY_CONTRACT"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "First line of the organization's primary office address.",
      validationHint: "Extract the street address, building name/number, or PO Box from the document.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_office_address_line_1`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "office_address_line_2",
      fieldLabel: "Office Address Line 2",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE", "UTILITY_BILL", "TENANCY_CONTRACT"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "Second line of the organization's primary office address (area, district, etc.).",
      validationHint: "Extract the secondary address line (area, district, floor, unit number).",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_office_address_line_2`,
    },
    // FK field: requires explicit review before apply
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "office_emirate_id",
      fieldLabel: "Emirate",
      fieldType: "fk",
      documentTypeHints: ["TRADE_LICENSE", "UTILITY_BILL", "TENANCY_CONTRACT"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "Emirates reference for the organization's office location. Requires FK lookup.",
      validationHint: "Extract the emirate name (e.g. Dubai, Abu Dhabi, Sharjah). The apply handler resolves to a DB FK.",
      allowOverwrite: true,
      allowForeignKeyUpdate: true,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_office_emirate_id`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "office_city_id",
      fieldLabel: "City",
      fieldType: "fk",
      documentTypeHints: ["TRADE_LICENSE", "UTILITY_BILL", "TENANCY_CONTRACT"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "City reference for the organization's office location. Requires FK lookup.",
      validationHint: "Extract the city name. The apply handler resolves to a DB FK using the cities table.",
      allowOverwrite: true,
      allowForeignKeyUpdate: true,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_office_city_id`,
    },
  ],
};

// ── Registry self-validation at module load ────────────────────────────────────

for (const field of COMPANY_REGISTRY.fields) {
  assertAiFieldCanBeRegistered({
    targetField: field.targetField,
    fieldType: field.fieldType,
    allowForeignKeyUpdate: field.allowForeignKeyUpdate,
  });
}
