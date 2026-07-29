/**
 * OFFICIAL DOCS.1 — Salary certificate definitions.
 *
 * Wording provenance (no invented wording):
 * - Salary Certificate (with Amount) EN prose — VERIFIED from the approved
 *   HR.1 notification template seed `HR_SALARY_CERTIFICATE`
 *   (supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql).
 * - Salary Certificate (General) EN prose — VERIFIED from the REPORT.4
 *   fetcher `certificate_body` (salaryCertGeneralFetcher) plus the standard
 *   issuance-purpose sentence from the same HR.1 seed.
 */

import type { OfficialDocumentDefinition } from "../../types";
import { formatAmount, formatDateEn, str } from "../helpers";

// ─────────────────────────────────────────────────────────────────────────────
// HR_SALARY_CERT_WITH_AMOUNT — Salary Certificate (With Amount), EN, Class A
// ─────────────────────────────────────────────────────────────────────────────

export const salaryCertificateWithAmountDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_SALARY_CERT_WITH_AMOUNT",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Salary Certificate",
  businessPurpose:
    "Certifies employment and monthly salary amount for banks, embassies, and other institutions. Sensitive — approval required.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: [
    "employee_name",
    "employee_code",
    "designation",
    "company_name",
    "joining_date",
    "gross_salary",
    "currency",
  ],
  missingFieldMessages: {
    gross_salary:
      "Salary Certificate cannot be generated because the employee's approved salary profile is missing. Complete the payroll profile first.",
    designation:
      "Salary Certificate cannot be generated because the employee has no designation assigned. Update the employee's job details first.",
  },
  optionalInputs: [
    {
      key: "addressee",
      labelEn: "Addressee (optional)",
      type: "text",
      required: false,
      maxLength: 120,
      placeholder: "e.g. Emirates NBD Bank",
      helpText: "Shown above the salutation when provided.",
    },
  ],
  sensitiveFields: ["basic_salary", "gross_salary"],
  wording: {
    en: {
      source:
        "supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql (HR_SALARY_CERTIFICATE template seed)",
      provenance: "verified_migration",
      businessApprovalStatus: "pending_business_approval",
      note: "Seed token {{total_salary}} maps to payroll profile gross_salary. Business-owner approval not yet formally recorded.",
    },
  },
  build: (ctx) => {
    const name = str(ctx.row.employee_name);
    const addressee = str(ctx.inputs.addressee).trim();
    return {
      titleEn: "Salary Certificate",
      meta: [
        { labelEn: "Employee Code", value: str(ctx.row.employee_code) },
        { labelEn: "Employee Name", value: name },
        { labelEn: "Designation", value: str(ctx.row.designation) },
        { labelEn: "Date of Joining", value: formatDateEn(ctx.row.joining_date) },
        {
          labelEn: "Monthly Salary",
          value: `${str(ctx.row.currency) || "AED"} ${formatAmount(ctx.row.gross_salary)}`,
        },
      ],
      blocks: [
        ...(addressee ? [{ kind: "paragraph" as const, en: `To: ${addressee}` }] : []),
        { kind: "paragraph", emphasis: "salutation", en: "TO WHOM IT MAY CONCERN" },
        {
          kind: "paragraph",
          en: `This is to certify that ${name}, holding Employee No. ${str(ctx.row.employee_code)}, is employed with ${str(ctx.row.company_name)} as ${str(ctx.row.designation)} since ${formatDateEn(ctx.row.joining_date)}.`,
        },
        {
          kind: "paragraph",
          en: `Monthly Salary: ${str(ctx.row.currency) || "AED"} ${formatAmount(ctx.row.gross_salary)}`,
        },
        {
          kind: "paragraph",
          en: "This certificate is issued upon the request of the employee for official purposes only.",
        },
      ],
      showSignature: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_SALARY_CERT_GENERAL — Salary Certificate (Without Amount), EN, Class B
// ─────────────────────────────────────────────────────────────────────────────

export const salaryCertificateGeneralDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_SALARY_CERT_GENERAL",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Salary Certificate (General)",
  businessPurpose:
    "Certifies employment without disclosing salary amounts — safe general-purpose confirmation.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: ["employee_name", "employee_code", "designation", "company_name", "joining_date"],
  missingFieldMessages: {
    designation:
      "Salary Certificate (General) cannot be generated because the employee has no designation assigned. Update the employee's job details first.",
    joining_date:
      "Salary Certificate (General) cannot be generated because the employee's joining date is missing. Update the employee's employment details first.",
  },
  optionalInputs: [],
  sensitiveFields: [],
  wording: {
    en: {
      source:
        "src/server/actions/reports/hr/hr-letter-documents.ts (salaryCertGeneralFetcher certificate_body, REPORT.4) + HR.1 HR_SALARY_CERTIFICATE seed closing sentence",
      provenance: "verified_code",
      businessApprovalStatus: "pending_business_approval",
      note: "Business-owner approval not yet formally recorded.",
    },
  },
  build: (ctx) => {
    const name = str(ctx.row.employee_name);
    return {
      titleEn: "Salary Certificate (General)",
      meta: [
        { labelEn: "Employee Code", value: str(ctx.row.employee_code) },
        { labelEn: "Employee Name", value: name },
        { labelEn: "Designation", value: str(ctx.row.designation) },
        { labelEn: "Date of Joining", value: formatDateEn(ctx.row.joining_date) },
      ],
      blocks: [
        { kind: "paragraph", emphasis: "salutation", en: "TO WHOM IT MAY CONCERN" },
        {
          kind: "paragraph",
          en: `This is to certify that ${name} is employed with ${str(ctx.row.company_name)} as ${str(ctx.row.designation)} since ${formatDateEn(ctx.row.joining_date)}.`,
        },
        {
          kind: "paragraph",
          en: "This certificate is issued upon the request of the employee for official purposes only.",
        },
      ],
      showSignature: true,
    };
  },
};
