/**
 * ERP COMMON AI.1A — Stage 2 Stub: Work Site Registry
 *
 * STUB ONLY — NOT available for generation in Stage 1.
 * Will be activated after Stage 1 UAT (Organization + Party) passes.
 *
 * Do NOT use this registry for live AI generation until stage is updated to "stage_1".
 * site_code is NEVER registered.
 */

import { assertAiFieldCanBeRegistered } from "../non-updatable-fields";
import type { ErpAiEntityRegistry } from "../types";

const ENTITY_TYPE = "site" as const;
const TARGET_TABLE = "work_sites";
const APPLY_KEY_PREFIX = "apply_site";

/** Work site registry — Stage 2 stub. Not available for AI generation yet. */
export const SITE_REGISTRY: ErpAiEntityRegistry = {
  entityType: ENTITY_TYPE,
  entityLabel: "Work Site",
  targetTable: TARGET_TABLE,
  idField: "id",
  displayField: "site_name",
  viewPermission: "common_md.work_sites.view",
  managePermission: "common_md.work_sites.manage",
  stage: "stage_2_stub",
  fields: [
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "site_name",
      fieldLabel: "Site Name",
      fieldType: "text",
      documentTypeHints: ["SITE_PERMIT", "TRADE_LICENSE", "UTILITY_BILL"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The official name of the work site.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_site_name`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "address_line_1",
      fieldLabel: "Address Line 1",
      fieldType: "text",
      documentTypeHints: ["SITE_PERMIT", "UTILITY_BILL", "TENANCY_CONTRACT"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "First line of the work site's physical address.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_address_line_1`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "address_line_2",
      fieldLabel: "Address Line 2",
      fieldType: "text",
      documentTypeHints: ["SITE_PERMIT", "UTILITY_BILL", "TENANCY_CONTRACT"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "Second line of the work site's physical address.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_address_line_2`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "access_restrictions",
      fieldLabel: "Access Restrictions",
      fieldType: "text",
      documentTypeHints: ["SITE_PERMIT", "HSE_PLAN"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "Any access restrictions or special requirements for this site.",
      maxLength: 1000,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_access_restrictions`,
    },
  ],
};

// ── Registry self-validation ───────────────────────────────────────────────────

for (const field of SITE_REGISTRY.fields) {
  assertAiFieldCanBeRegistered({
    targetField: field.targetField,
    fieldType: field.fieldType,
    allowForeignKeyUpdate: field.allowForeignKeyUpdate,
  });
}
