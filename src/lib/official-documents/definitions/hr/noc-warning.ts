/**
 * OFFICIAL DOCS.1 — NOC and Warning Letter definitions.
 *
 * Wording provenance (no invented wording):
 * - NOC EN prose — VERIFIED from the approved HR.1 notification template seed
 *   `HR_NOC_LETTER` (supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql).
 * - Warning Letter EN prose — VERIFIED from the approved HR.1 notification
 *   template seed `HR_WARNING_LETTER` (same migration).
 */

import type { OfficialDocumentDefinition } from "../../types";
import { formatDateEn, str } from "../helpers";

// ─────────────────────────────────────────────────────────────────────────────
// HR_NOC — No Objection Certificate (EN, approval required)
// ─────────────────────────────────────────────────────────────────────────────

export const nocDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_NOC",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "No Objection Certificate",
  businessPurpose:
    "States the company has no objection to a specified purpose (travel, visa, driving licence, part-time study…). Approval required.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: ["employee_name", "employee_code", "company_name"],
  optionalInputs: [
    {
      key: "purpose",
      labelEn: "Purpose",
      type: "text",
      required: true,
      maxLength: 200,
      placeholder: "e.g. applying for a UAE driving licence",
      helpText: "The exact purpose stated in the certificate.",
    },
    {
      key: "validity_period",
      labelEn: "Validity Period (optional)",
      type: "text",
      required: false,
      maxLength: 60,
      placeholder: "e.g. 90 days",
      helpText: "When provided, the validity sentence is included.",
    },
  ],
  sensitiveFields: ["passport_number_masked"],
  wording: {
    en: {
      source:
        "supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql (HR_NOC_LETTER template seed)",
      provenance: "verified_migration",
      businessApprovalStatus: "pending_business_approval",
      note: "Validity sentence is conditional. Business-owner approval not yet formally recorded.",
    },
  },
  build: (ctx) => {
    const name = str(ctx.row.employee_name);
    const purpose = str(ctx.inputs.purpose).trim();
    const validity = str(ctx.inputs.validity_period).trim();
    const passport = str(ctx.row.passport_number_masked);
    return {
      titleEn: "No Objection Certificate",
      meta: [
        { labelEn: "Employee Code", value: str(ctx.row.employee_code) },
        { labelEn: "Employee Name", value: name },
        ...(str(ctx.row.designation) ? [{ labelEn: "Designation", value: str(ctx.row.designation) }] : []),
        ...(passport ? [{ labelEn: "Passport No.", value: passport }] : []),
      ],
      blocks: [
        { kind: "paragraph", emphasis: "salutation", en: "TO WHOM IT MAY CONCERN" },
        {
          kind: "paragraph",
          en: `This is to certify that ${str(ctx.row.company_name)} has no objection to ${name} (Employee No. ${str(ctx.row.employee_code)}) for the purpose of ${purpose}.`,
        },
        ...(validity
          ? [
              {
                kind: "paragraph" as const,
                en: `This NOC is valid for ${validity} from the date of issue.`,
              },
            ]
          : []),
      ],
      showSignature: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_WARNING_LETTER — Employee Warning Letter (EN, approval required, no QR)
// ─────────────────────────────────────────────────────────────────────────────

export const warningLetterDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_WARNING_LETTER",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Official Warning Letter",
  businessPurpose:
    "Formal disciplinary warning tied to a recorded disciplinary action. Approval required; never publicly verifiable.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: [
    "employee_name",
    "employee_code",
    "warning_level",
    "warning_reason",
    "incident_date",
  ],
  missingFieldMessages: {
    warning_level:
      "Warning Letter cannot be generated because the employee has no recorded disciplinary action. Record the disciplinary action in HR Actions first.",
    warning_reason:
      "Warning Letter cannot be generated because the disciplinary record has no reason recorded. Complete the disciplinary record first.",
    incident_date:
      "Warning Letter cannot be generated because the disciplinary record has no incident date. Complete the disciplinary record first.",
  },
  optionalInputs: [],
  sensitiveFields: ["warning_level", "warning_reason", "incident_date", "incident_description"],
  wording: {
    en: {
      source:
        "supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql (HR_WARNING_LETTER template seed)",
      provenance: "verified_migration",
      businessApprovalStatus: "pending_business_approval",
      note: "Business-owner approval not yet formally recorded.",
    },
  },
  build: (ctx) => {
    const name = str(ctx.row.employee_name);
    const level = str(ctx.row.warning_level);
    const reason = str(ctx.row.warning_reason);
    const description = str(ctx.row.incident_description);
    return {
      titleEn: "Official Warning Letter",
      meta: [
        { labelEn: "Employee Code", value: str(ctx.row.employee_code) },
        { labelEn: "Employee Name", value: name },
        { labelEn: "Warning Level", value: level, },
        { labelEn: "Incident Date", value: formatDateEn(ctx.row.incident_date) },
      ],
      blocks: [
        { kind: "paragraph", en: `Dear ${name},` },
        {
          kind: "paragraph",
          en: `This letter serves as an official ${level.toLowerCase()} warning regarding: ${reason}.`,
        },
        {
          kind: "paragraph",
          en:
            `Incident Date: ${formatDateEn(ctx.row.incident_date)}` +
            (description ? `\nDescription: ${description}` : ""),
        },
        {
          kind: "paragraph",
          en: "You are required to improve your conduct immediately. Further violations may result in disciplinary action up to and including termination.",
        },
        { kind: "paragraph", emphasis: "salutation", en: "Employee Acknowledgment Required." },
        {
          kind: "form_table",
          rows: [
            { labelEn: "Employee Signature", value: "", signatureCell: true },
            { labelEn: "Date", value: "", signatureCell: true },
          ],
        },
      ],
      showSignature: true,
    };
  },
};
