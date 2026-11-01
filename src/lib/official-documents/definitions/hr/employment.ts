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
import {EMPLOYMENT_RECIPIENT_FIELDS, employmentAddressee, employmentRecipientError} from "../../employment-recipient";

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
      provenance: "verified_code",
      businessApprovalStatus: "pending_business_approval",
      note: "ERP PDF.1 production template prose, migrated verbatim. Business-owner approval not yet formally recorded — required before production activation.",
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
  version: 2,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Employment Confirmation Certificate",
  titleAr: "شهادة إثبات عمل",
  businessPurpose:
    "Confirms employment using employee/company records, with a general or named recipient and English, Arabic or bilingual output.",
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
  optionalInputs: EMPLOYMENT_RECIPIENT_FIELDS,
  validateInputs: employmentRecipientError,
  sensitiveFields: [],
  wording: {
    en: {
      source: "src/lib/official-documents/definitions/hr/employment.ts (owner-supplied wording, 2026-10-29)",
      provenance: "verified_prompt",
      businessApprovalStatus: "approved",
      approvedBy: "System owner",
      approvalDate: "2026-10-30",
      approvalReference: "Explicit owner instruction in ERP chat, 30 October 2026",
      approvalNotes: "Keep the English wording as supplied; approve Employment Confirmation Certificate and enable official generation locally. No push or deployment.",
      note: "Owner-supplied wording retained unchanged; local activation authorized.",
    },
    ar: {
      source: "src/lib/official-documents/definitions/hr/employment.ts (owner-supplied wording, 2026-10-29)",
      provenance: "verified_prompt",
      businessApprovalStatus: "approved",
      approvedBy: "System owner",
      approvalDate: "2026-10-30",
      approvalReference: "Explicit owner instruction in ERP chat, 30 October 2026",
      approvalNotes: "Keep the Arabic wording as supplied; approve Employment Confirmation Certificate and enable official generation locally. No push or deployment.",
      note: "Owner-supplied Arabic wording retained unchanged; local activation authorized.",
    },
  },
  build: (ctx) => {
    const nameEn = str(ctx.row.employee_name);
    const nameAr = str(ctx.row.employee_name_ar) || nameEn; // same fallback as the verified source
    const titleEnV = str(ctx.row.designation);
    const titleArV = str(ctx.row.designation_ar) || titleEnV;
    const joiningEn = formatDateEn(ctx.row.joining_date);
    const joiningAr = formatDateAr(ctx.row.joining_date);
    const companyEn = str(ctx.row.company_name);
    const companyAr = str(ctx.row.company_name_ar) || companyEn;
    const honorific = ctx.inputs.employee_title;
    const prefixEn = honorific === "Mr." || honorific === "Ms." ? `${honorific} ` : "";
    const prefixAr = honorific === "Mr." ? "السيد/ " : honorific === "Ms." ? "السيدة/ " : "";
    const employment = str(ctx.row.employment_type);
    const kind = employment.toLowerCase().replace(/[^a-z]/g, "");
    const basisEn = kind === "fulltime" ? " on a full-time basis" : kind === "parttime" ? " on a part-time basis" : employment ? ` on a ${employment} basis` : "";
    const basisAr = kind === "fulltime" ? "، وذلك بنظام الدوام الكامل" : kind === "parttime" ? "، وذلك بنظام الدوام الجزئي" : employment ? `، وذلك بنظام ${employment}` : "";
    return {
      titleEn: employmentAddressee(ctx.inputs, "en"),
      titleAr: employmentAddressee(ctx.inputs, "ar"),
      blocks: [
        {
          kind: "paragraph",
          emphasis: "salutation",
          en: "Subject: Employment Confirmation Certificate",
          ar: "الموضوع: شهادة إثبات عمل",
        },
        {
          kind: "paragraph",
          en: `This is to certify that ${prefixEn}${nameEn} has been employed with ${companyEn} since ${joiningEn} and currently holds the position of ${titleEnV}${basisEn}.`,
          ar: `تشهد شركة ${companyAr} بأن ${prefixAr}${nameAr} يعمل لديها منذ تاريخ ${joiningAr}، ولا يزال على رأس عمله حتى تاريخ إصدار هذه الشهادة، ويشغل حالياً منصب ${titleArV}${basisAr}.`,
        },
        {
          kind: "paragraph",
          en: "This certificate is issued at the employee's request for official purposes, without any liability or financial obligation on the part of the Company.",
          ar: "وقد أُصدرت هذه الشهادة بناءً على طلب الموظف لتقديمها إلى الجهات الرسمية والمعنية، دون أن يترتب على الشركة أي التزامات أو مسؤوليات مالية نتيجة إصدارها.",
        },
        {kind: "paragraph", ar: "وتفضلوا بقبول فائق الاحترام والتقدير."},
      ],
      closingEn: `For and on behalf of ${companyEn}`,
      closingAr: `عن شركة ${companyAr}`,
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
      provenance: "verified_code",
      businessApprovalStatus: "pending_business_approval",
      note: "Published as the verified structured field layout. Business-owner approval not yet formally recorded. Narrative prose upgrade pending approved wording.",
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
