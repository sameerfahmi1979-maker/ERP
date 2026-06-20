/**
 * ERP COMMON AI.1A — Stage 1 Party Registry
 *
 * Registers AI-eligible fields for the `parties` entity.
 * Stage 1 — active for Common AI generation.
 *
 * RULES:
 * - Only safe text fields from the `parties` table are registered.
 * - Child table fields (party_licenses, party_tax_registrations) are included
 *   as "restricted / requires_review" with a distinct targetTable.
 * - No IDs, party_code, audit fields, or status fields.
 */

import { assertAiFieldCanBeRegistered } from "../non-updatable-fields";
import type { ErpAiEntityRegistry } from "../types";

const ENTITY_TYPE = "party" as const;
const TARGET_TABLE = "parties";
const APPLY_KEY_PREFIX = "apply_party";

const TRADE_LICENSE_HINTS = ["TRADE_LICENSE", "VAT_CERTIFICATE", "TRN_CERTIFICATE", "POWER_OF_ATTORNEY"];

/** Party registry: AI-eligible fields on parties and related child tables. */
export const PARTY_REGISTRY: ErpAiEntityRegistry = {
  entityType: ENTITY_TYPE,
  entityLabel: "Party",
  targetTable: TARGET_TABLE,
  idField: "id",
  displayField: "display_name",
  viewPermission: "master_data.party_master.view",
  managePermission: "master_data.party_master.manage",
  stage: "stage_1",
  fields: [
    // ── Main parties table fields ──────────────────────────────────────────────
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "display_name",
      fieldLabel: "Display Name",
      fieldType: "text",
      documentTypeHints: TRADE_LICENSE_HINTS,
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The primary display name of the party (company or individual).",
      validationHint: "Extract the registered name. For companies, use trade name. For individuals, use full name.",
      maxLength: 255,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_display_name`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "legal_name_en",
      fieldLabel: "Legal Name (English)",
      fieldType: "text",
      documentTypeHints: TRADE_LICENSE_HINTS,
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The full legal registered name in English.",
      validationHint: "Extract the exact legal name as it appears on the trade license or official document.",
      maxLength: 255,
      allowOverwrite: true,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_legal_name_en`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "legal_name_ar",
      fieldLabel: "Legal Name (Arabic)",
      fieldType: "text",
      documentTypeHints: TRADE_LICENSE_HINTS,
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The full legal registered name in Arabic.",
      validationHint: "Extract the Arabic name exactly as it appears on the document. Return in Arabic script.",
      maxLength: 255,
      allowOverwrite: true,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_legal_name_ar`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "primary_email",
      fieldLabel: "Primary Email",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE", "COMPANY_PROFILE", "LETTER_HEAD"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "The primary business email address.",
      validationHint: "Extract a valid email address. Must contain @ and a domain.",
      maxLength: 255,
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_primary_email`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "primary_phone",
      fieldLabel: "Primary Phone",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE", "COMPANY_PROFILE", "LETTER_HEAD"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "The primary business phone number.",
      validationHint: "Extract a phone number including country code if present. UAE numbers start with +971.",
      maxLength: 50,
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_primary_phone`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: TARGET_TABLE,
      targetField: "website",
      fieldLabel: "Website",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE", "COMPANY_PROFILE", "LETTER_HEAD"],
      isAiEligible: true,
      safetyClassification: "business_safe",
      description: "The party's official website URL.",
      validationHint: "Extract the website URL. Must start with http:// or https://.",
      maxLength: 500,
      allowOverwrite: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_website`,
    },

    // ── Child table: party_tax_registrations ──────────────────────────────────
    // Registered as requires_review — apply handler targets child row, not parties
    {
      entityType: ENTITY_TYPE,
      targetTable: "party_tax_registrations",
      targetField: "trn",
      fieldLabel: "Tax Registration Number (TRN)",
      fieldType: "text",
      documentTypeHints: ["TRN_CERTIFICATE", "VAT_CERTIFICATE"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "UAE Tax Registration Number (TRN) — 15-digit number on the TRN/VAT certificate.",
      validationHint: "Extract the 15-digit TRN exactly. No spaces or dashes. Example: 100123456700003.",
      maxLength: 20,
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_tax_registration_trn`,
    },

    // ── Child table: party_licenses ────────────────────────────────────────────
    {
      entityType: ENTITY_TYPE,
      targetTable: "party_licenses",
      targetField: "license_number",
      fieldLabel: "Trade License Number",
      fieldType: "text",
      documentTypeHints: ["TRADE_LICENSE"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "The trade license number issued by the licensing authority.",
      validationHint: "Extract the license/registration number exactly as printed.",
      maxLength: 100,
      allowOverwrite: false,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_license_license_number`,
    },
    {
      entityType: ENTITY_TYPE,
      targetTable: "party_licenses",
      targetField: "expiry_date",
      fieldLabel: "Trade License Expiry Date",
      fieldType: "date",
      documentTypeHints: ["TRADE_LICENSE"],
      isAiEligible: true,
      safetyClassification: "requires_review",
      description: "The expiry/renewal due date of the trade license.",
      validationHint: "Extract the expiry or renewal date. Format: YYYY-MM-DD.",
      allowOverwrite: true,
      requiresExactDocumentEvidence: true,
      applyHandlerKey: `${APPLY_KEY_PREFIX}_license_expiry_date`,
    },
  ],
};

// ── Registry self-validation at module load ────────────────────────────────────

for (const field of PARTY_REGISTRY.fields) {
  assertAiFieldCanBeRegistered({
    targetField: field.targetField,
    fieldType: field.fieldType,
    allowForeignKeyUpdate: field.allowForeignKeyUpdate,
  });
}
