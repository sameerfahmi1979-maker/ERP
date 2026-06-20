/**
 * ERP COMMON AI.1A — Stage 2 Stub: Branch Registry
 *
 * STUB ONLY — NOT available for generation in Stage 1.
 * Will be activated after Stage 1 UAT (Organization + Party) passes.
 *
 * Do NOT use this registry for live AI generation until stage is updated to "stage_1".
 */

import { assertAiFieldCanBeRegistered } from "../non-updatable-fields";
import type { ErpAiEntityRegistry } from "../types";

const ENTITY_TYPE = "branch" as const;
const TARGET_TABLE = "branches";
const APPLY_KEY_PREFIX = "apply_branch";

/** Branch registry — Stage 2 stub. Not available for AI generation yet. */
export const BRANCH_REGISTRY: ErpAiEntityRegistry = {
  entityType: ENTITY_TYPE,
  entityLabel: "Branch",
  targetTable: TARGET_TABLE,
  idField: "id",
  displayField: "legal_branch_name",
  viewPermission: "branches.view",
  managePermission: "branches.manage",
  stage: "stage_2_stub",
  fields: [
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "legal_branch_name",
      fieldLabel: "Legal Branch Name",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE", "BRANCH_CERTIFICATE"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The official legal name of the branch as registered.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_legal_branch_name`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "trade_license_branch_ref",
      fieldLabel: "Trade License Branch Reference",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "The branch reference number on the trade license document.",
      maxLength: 100,
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_trade_license_branch_ref`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "opening_date",
      fieldLabel: "Opening Date",
      fieldType: "date",
      documentTypeHints: ["TRADE_LICENSE", "BRANCH_CERTIFICATE"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The date the branch officially opened.",
      validationHint: "Format: YYYY-MM-DD.",
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_opening_date`,
    },
  ],
};

// ── Registry self-validation ───────────────────────────────────────────────────

for (const field of BRANCH_REGISTRY.fields) {
  assertAiFieldCanBeRegistered({
    targetField: field.targetField,
    fieldType: field.fieldType,
    allowForeignKeyUpdate: field.allowForeignKeyUpdate,
  });
}
