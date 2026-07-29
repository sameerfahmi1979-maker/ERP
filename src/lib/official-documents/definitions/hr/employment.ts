/**
 * OFFICIAL DOCS.1 — Employment family definitions.
 *
 * Wording provenance (no invented wording):
 * - Employment Certificate EN prose — VERIFIED from
 *   src/components/erp/print/templates/hr-employment-letter.tsx (ERP PDF.1).
 * - Employment Confirmation EN + AR prose — VERIFIED from
 *   src/components/erp/print/templates/bilingual-sample.tsx (ERP PDF.1).
 * - Experience Certificate — no verified narrative prose exists in the
 *   repository; the published presentation stays the verified structured
 *   REPORT.4 field layout. Narrative upgrade is pending approved wording.
 */

import type { OfficialDocumentDefinition } from "../../types";
import { formatDateAr, formatDateEn, str } from "../helpers";

// ─────────────────────────────────────────────────────────────────────────────
// HR_EMPLOYMENT_LETTER — Employment Certificate (EN)
// ─────────────────────────────────────────────────────────────────────────────

export const employmentCertificateDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_EMPLOYMENT_LETTER",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Employment Certificate",
  businessPurpose:
    "Certifies current employment (name, position, department, joining date, employment type) for official third-party use.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: ["employee_name", "employee_code", "designation", "joining_date", "company_name"],
  missingFieldMessages: {
    designation:
      "Employment Certificate cannot be generated because the employee has no designation assigned. Update the employee's job details first.",
    joining_date:
      "Employment Certificate cannot be generated because the employee's joining date is missing. Update the employee's employment details first.",
  },
  optionalInputs: [],
  sensitiveFields: [],
  wording: {
    en: {
      source: "src/components/erp/print/templates/hr-employment-letter.tsx",
      status: "verified_code",
      note: "ERP PDF.1 production template prose, migrated verbatim with the same data bindings.",
    },
  },
  build: (ctx) => {
    const name = str(ctx.row.employee_name);
    const designation = str(ctx.row.designation);
    const department = str(ctx.row.department);
    const employmentType = str(ctx.row.employment_type) || "full-time";
    const joining = formatDateEn(ctx.row.joining_date);
    return {
      titleEn: "Employment Certificate",
      meta: [
        { labelEn: "Employee Code", value: str(ctx.row.employee_code) },
        { labelEn: "Employee Name", value: name },
        { labelEn: "Job Title", value: designation },
        ...(department ? [{ labelEn: "Department", value: department }] : []),
        { labelEn: "Date of Joining", value: joining },
        { labelEn: "Employment Type", value: employmentType },
      ],
      blocks: [
        {
          kind: "paragraph",
          en:
            `This is to certify that ${name}, employed as ${designation}` +
            (department ? ` in the ${department} department` : "") +
            `, has been a member of our organization since ${joining} on a ${employmentType.toLowerCase()} basis.`,
        },
        {
          kind: "paragraph",
          en: "This certificate is issued upon the employee's request for official purposes only.",
        },
      ],
      showSignature: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_EMPLOYMENT_CONFIRMATION — Employment Confirmation (EN / AR / bilingual)
// ─────────────────────────────────────────────────────────────────────────────

export const employmentConfirmationDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_EMPLOYMENT_CONFIRMATION",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Employment Confirmation Letter",
  titleAr: "خطاب تأكيد التوظيف",
  businessPurpose:
    "Confirms active full-time employment to third parties, available in English, Arabic, and synchronized bilingual layout.",
  status: "published",
  supportedLanguages: ["en", "ar", "bilingual"],
  bilingualLayoutType: "narrative_two_column",
  requiredSourceFields: ["employee_name", "employee_code", "designation", "joining_date", "company_name"],
  missingFieldMessages: {
    designation:
      "Employment Confirmation cannot be generated because the employee has no designation assigned. Update the employee's job details first.",
    joining_date:
      "Employment Confirmation cannot be generated because the employee's joining date is missing. Update the employee's employment details first.",
  },
  optionalInputs: [],
  sensitiveFields: [],
  wording: {
    en: {
      source: "src/components/erp/print/templates/bilingual-sample.tsx",
      status: "verified_code",
      note: "ERP PDF.1 bilingual template EN prose, migrated verbatim.",
    },
    ar: {
      source: "src/components/erp/print/templates/bilingual-sample.tsx",
      status: "verified_code",
      note: "ERP PDF.1 bilingual template AR prose, migrated verbatim (draft gate was pending visual QA, executed in this program).",
    },
  },
  build: (ctx) => {
    const nameEn = str(ctx.row.employee_name);
    const nameAr = str(ctx.row.employee_name_ar) || nameEn; // same fallback as the verified source
    const titleEnV = str(ctx.row.designation);
    const titleArV = str(ctx.row.designation_ar) || titleEnV;
    const joiningEn = formatDateEn(ctx.row.joining_date);
    const joiningAr = formatDateAr(ctx.row.joining_date);
    return {
      titleEn: "Employment Confirmation Letter",
      titleAr: "خطاب تأكيد التوظيف",
      meta: [
        {
          labelEn: "Employee Name",
          labelAr: "اسم الموظف",
          value: ctx.language === "ar" ? nameAr : nameEn,
        },
        { labelEn: "Employee Number", labelAr: "رقم الموظف", value: str(ctx.row.employee_code) },
      ],
      blocks: [
        {
          kind: "paragraph",
          emphasis: "salutation",
          en: "To Whom It May Concern,",
          ar: "إلى من يهمه الأمر،",
        },
        {
          kind: "paragraph",
          en: `This letter confirms that ${nameEn}, holding the position of ${titleEnV}, is a full-time employee of this organization. The employee's tenure commenced on ${joiningEn} and remains active as of the date of this letter.`,
          ar: `يُقر هذا الخطاب بأن السيد/السيدة ${nameAr}، الذي يشغل منصب ${titleArV}، موظف بدوام كامل لدى هذه المنظمة. بدأت خدمة الموظف في ${joiningAr} ولا تزال سارية حتى تاريخ هذا الخطاب.`,
        },
        {
          kind: "paragraph",
          en: "This document is issued upon the employee's request for official use only.",
          ar: "يُصدر هذا الخطاب بناءً على طلب الموظف للاستخدام الرسمي فقط.",
        },
      ],
      showSignature: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_EXPERIENCE_LETTER — Experience Certificate (EN, structured)
// ─────────────────────────────────────────────────────────────────────────────

export const experienceCertificateDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_EXPERIENCE_LETTER",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Experience Certificate",
  businessPurpose:
    "Certifies the employee's service record (position, department, tenure, last working date where applicable).",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: ["employee_name", "employee_code", "designation", "joining_date", "company_name"],
  missingFieldMessages: {
    designation:
      "Experience Certificate cannot be generated because the employee has no designation assigned. Update the employee's job details first.",
    joining_date:
      "Experience Certificate cannot be generated because the employee's joining date is missing. Update the employee's employment details first.",
  },
  optionalInputs: [],
  sensitiveFields: ["last_working_date"],
  wording: {
    en: {
      source: "src/server/actions/reports/hr/hr-letter-documents.ts (experienceLetterFetcher, REPORT.4)",
      status: "verified_code",
      note: "Published as the verified structured field layout. Narrative prose upgrade is pending approved wording (recorded in the wording register).",
    },
  },
  build: (ctx) => {
    const lastWorking = str(ctx.row.last_working_date);
    return {
      titleEn: "Experience Certificate",
      blocks: [
        {
          kind: "form_table",
          rows: [
            { labelEn: "Employee Name", value: str(ctx.row.employee_name), emphasized: true },
            { labelEn: "Employee Code", value: str(ctx.row.employee_code) },
            { labelEn: "Designation", value: str(ctx.row.designation) },
            ...(str(ctx.row.department)
              ? [{ labelEn: "Department", value: str(ctx.row.department) }]
              : []),
            { labelEn: "Company", value: str(ctx.row.company_name) },
            { labelEn: "Date of Joining", value: formatDateEn(ctx.row.joining_date) },
            ...(lastWorking
              ? [{ labelEn: "Last Working Date", value: formatDateEn(lastWorking) }]
              : []),
          ],
        },
        {
          kind: "paragraph",
          en: "This certificate is issued upon the employee's request for official purposes only.",
        },
      ],
      showSignature: true,
    };
  },
};
