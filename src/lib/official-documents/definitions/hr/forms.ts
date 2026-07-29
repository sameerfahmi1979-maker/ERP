/**
 * OFFICIAL DOCS.1 — Internal HR form definitions.
 *
 * Wording provenance (no invented wording):
 * - Clearance areas and checklist items — VERIFIED from the REPORT.4 fetchers
 *   (src/server/actions/reports/hr/hr-letter-documents.ts).
 * - Bilingual field label pairs — supplied verbatim by the approved business
 *   program (Section 9.4): Employee Name / اسم الموظف, Employee Number /
 *   رقم الموظف, Department / القسم, Last Working Day / آخر يوم عمل.
 */

import type { OfficialDocumentDefinition } from "../../types";
import { formatDateEn, str } from "../helpers";

// ─────────────────────────────────────────────────────────────────────────────
// HR_CLEARANCE_FORM — Employee Clearance Form (EN / bilingual labels)
// ─────────────────────────────────────────────────────────────────────────────

export const clearanceFormDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_CLEARANCE_FORM",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Employee Clearance Form",
  titleAr: "نموذج تسوية الموظف",
  businessPurpose:
    "End-of-service clearance sign-off across departments (Department, HR, Finance, IT, Safety, Admin).",
  status: "published",
  supportedLanguages: ["en", "bilingual"],
  bilingualLayoutType: "bilingual_form_table",
  requiredSourceFields: ["employee_name", "employee_code"],
  optionalInputs: [],
  sensitiveFields: [],
  wording: {
    en: {
      source: "src/server/actions/reports/hr/hr-letter-documents.ts (clearanceFormFetcher, REPORT.4)",
      status: "verified_code",
    },
    ar: {
      source: "Program prompt Section 9.4 bilingual label pairs + HR seed title نموذج تسوية الموظف",
      status: "verified_prompt",
      note: "Arabic is label-level only (bilingual_form_table); no Arabic narrative prose exists or is required.",
    },
  },
  build: (ctx) => {
    const areaRows = ctx.rows.map((r) => ({
      labelEn: str(r.clearance_area),
      value: "",
      signatureCell: true,
    }));
    return {
      titleEn: "Employee Clearance Form",
      titleAr: "نموذج تسوية الموظف",
      meta: [
        { labelEn: "Employee Name", labelAr: "اسم الموظف", value: str(ctx.row.employee_name) },
        { labelEn: "Employee Number", labelAr: "رقم الموظف", value: str(ctx.row.employee_code) },
        ...(str(ctx.row.department)
          ? [{ labelEn: "Department", labelAr: "القسم", value: str(ctx.row.department) }]
          : []),
        ...(str(ctx.row.last_working_date)
          ? [
              {
                labelEn: "Last Working Day",
                labelAr: "آخر يوم عمل",
                value: formatDateEn(ctx.row.last_working_date),
              },
            ]
          : []),
      ],
      blocks: [
        {
          kind: "form_table",
          titleEn: "Clearance Sign-off",
          rows: areaRows,
        },
      ],
      showSignature: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_JOINING_CHECKLIST — Joining Checklist (EN)
// ─────────────────────────────────────────────────────────────────────────────

export const joiningChecklistDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_JOINING_CHECKLIST",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "Joining Checklist",
  businessPurpose: "Onboarding checklist covering HR, compliance, payroll, operations, DMS, safety and IT steps.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: ["employee_name", "employee_code"],
  optionalInputs: [],
  sensitiveFields: [],
  wording: {
    en: {
      source: "src/server/actions/reports/hr/hr-letter-documents.ts (joiningChecklistFetcher, REPORT.4)",
      status: "verified_code",
      note: "Checklist items migrated verbatim from the fetcher's item list.",
    },
  },
  build: (ctx) => ({
    titleEn: "Joining Checklist",
    meta: [
      { labelEn: "Employee Name", value: str(ctx.row.employee_name) },
      { labelEn: "Employee Number", value: str(ctx.row.employee_code) },
      { labelEn: "Date of Joining", value: formatDateEn(ctx.row.joining_date) },
    ],
    blocks: [
      {
        kind: "checklist",
        items: ctx.rows.map((r) => ({
          en: `${str(r.checklist_item)}${str(r.area) ? ` (${str(r.area)})` : ""}`,
        })),
        withStatusColumns: true,
      },
    ],
    showSignature: true,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_PPE_ISSUE_FORM — PPE Issue Form (EN)
// ─────────────────────────────────────────────────────────────────────────────

export const ppeIssueFormDefinition: OfficialDocumentDefinition = {
  documentCode: "HR_PPE_ISSUE_FORM",
  version: 1,
  moduleCode: "HR",
  recordType: "employee",
  titleEn: "PPE Issue Form",
  businessPurpose: "Records personal protective equipment issued to the employee with acknowledgment signature.",
  status: "published",
  supportedLanguages: ["en"],
  requiredSourceFields: ["employee_name", "employee_code"],
  optionalInputs: [],
  sensitiveFields: [],
  wording: {
    en: {
      source: "src/server/actions/reports/hr/hr-letter-documents.ts (ppeIssueFormFetcher, REPORT.4)",
      status: "verified_code",
    },
  },
  build: (ctx) => {
    const issued = ctx.rows.filter((r) => str(r.ppe_item) && str(r.ppe_item) !== "No items");
    return {
      titleEn: "PPE Issue Form",
      meta: [
        { labelEn: "Employee Name", value: str(ctx.row.employee_name) },
        { labelEn: "Employee Number", value: str(ctx.row.employee_code) },
      ],
      blocks: [
        issued.length > 0
          ? {
              kind: "checklist" as const,
              titleEn: "Issued Items",
              items: issued.map((r) => ({
                en: `${str(r.ppe_item)}${str(r.ppe_category) ? ` — ${str(r.ppe_category)}` : ""} (Qty: ${str(r.quantity) || "1"}, Issued: ${formatDateEn(r.issue_date)})`,
              })),
              withStatusColumns: false,
            }
          : {
              kind: "paragraph" as const,
              en: "No PPE items are currently recorded as issued to this employee.",
            },
        {
          kind: "form_table" as const,
          titleEn: "Acknowledgment",
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

// ─────────────────────────────────────────────────────────────────────────────
// Identities reserved pending approved wording — can NEVER generate.
// ─────────────────────────────────────────────────────────────────────────────

function pendingWording(documentCode: string, titleEn: string, businessPurpose: string): OfficialDocumentDefinition {
  return {
    documentCode,
    version: 0,
    moduleCode: "HR",
    recordType: "employee",
    titleEn,
    businessPurpose,
    status: "disabled_pending_wording",
    supportedLanguages: [],
    requiredSourceFields: [],
    optionalInputs: [],
    sensitiveFields: [],
    wording: {
      en: {
        source: "none",
        status: "pending",
        note: "No verified approved wording exists in the repository. Provide approved English (and Arabic where needed) wording to enable this document.",
      },
    },
    build: () => {
      throw new Error(`${titleEn} is disabled pending approved wording and cannot be rendered.`);
    },
  };
}

export const bankSalaryTransferLetterDefinition = pendingWording(
  "HR_BANK_SALARY_TRANSFER",
  "Bank Salary Transfer Letter",
  "Instructs/confirms salary transfer details to the employee's bank. Requires approved wording before activation."
);

export const embassyLetterDefinition = pendingWording(
  "HR_EMBASSY_LETTER",
  "Embassy / Consulate Letter",
  "Salary/employment confirmation addressed to an embassy or consulate. Requires approved wording before activation."
);

export const handoverFormDefinition = pendingWording(
  "HR_HANDOVER_FORM",
  "Employee Handover Form",
  "Records handover of duties, assets and documents. Requires approved wording/structure before activation."
);

export const leaveConfirmationDefinition = pendingWording(
  "HR_LEAVE_CONFIRMATION",
  "Leave Confirmation Letter",
  "Confirms approved leave dates. Requires approved wording before activation."
);
