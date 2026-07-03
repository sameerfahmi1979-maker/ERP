/**
 * Report Designer — Live Report Test Schema and Types
 * Phase: REPORT DESIGNER.1
 *
 * Foundation for the future "Test Report" capability where a designer can
 * click "Test Report" and preview their layout with real or sample ERP data.
 *
 * SECURITY RULES for test mode:
 *  - Must NEVER create public QR links
 *  - Must NEVER write report runs (no side effects)
 *  - Must NEVER send emails
 *  - Must NEVER publish templates
 *  - Must respect RBAC and sensitive-data redaction
 *  - Must use existing report fetchers/HR letter fetchers where available
 *  - Sample fallback data must be provided when no live record is selected
 *
 * This phase creates ONLY the types and Zod schemas.
 * Full execution engine is planned for REPORT DESIGNER.5.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Test mode types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How the test run sources its data:
 * - "sample": use static sample/placeholder data — no DB query needed
 * - "live_record": fetch a specific entity from the live DB (employee, party, etc.)
 * - "report_filters": run the report with specific filter parameters
 */
export type ReportDesignerTestMode = "sample" | "live_record" | "report_filters";

/**
 * The type of data context required to resolve the template bindings.
 * Determines which fetcher / data resolver is used in test execution.
 */
export type ReportDesignerTestDataSource =
  | "employee_letter"    // HR letter — requires employeeId + optional ownerCompanyId
  | "employee_report"    // HR tabular report — requires report filters
  | "company_letter"     // Company-level letter — requires ownerCompanyId
  | "party_letter"       // Party-addressed letter — requires partyId
  | "report_table"       // Tabular report — requires reportCode + optional filters
  | "generic";           // Generic / unknown — sample data only

/**
 * Input to the live report test capability.
 * Sent by the visual editor UI when user clicks "Test Report".
 */
export interface ReportDesignerTestInput {
  /** Template being tested — must be in draft or rejected status */
  templateId: number;
  /** Template type determines which data resolver is used */
  templateType:
    | "report"
    | "letter"
    | "certificate"
    | "form"
    | "external_submission"
    | "other";
  /** Data sourcing mode */
  testMode: ReportDesignerTestMode;
  /** Report code — required when templateType is "report" or testMode is "report_filters" */
  reportCode?: string;
  /** Employee ID — required for HR letter / employee report templates */
  employeeId?: number;
  /** Owner company ID — for multi-company setups */
  ownerCompanyId?: number;
  /** Party ID — for party-addressed letters */
  partyId?: number;
  /**
   * Arbitrary filter map — used in "report_filters" test mode.
   * Values must be primitives only (string, number, boolean, null).
   */
  filters?: Record<string, string | number | boolean | null>;
}

/**
 * Context resolved by the test executor from ERP data.
 * Passed to the preview renderer (Executive Ledger preview engine).
 * All values are pre-formatted strings — the renderer never calls the DB.
 */
export interface ReportDesignerTestContext {
  /** Whether this is sample (placeholder) data vs. resolved live data */
  isSampleData: boolean;
  /** Whether any sensitive fields were redacted */
  sensitiveFieldsRedacted: boolean;
  /** The resolved binding values for display in the preview */
  resolvedBindings: Record<string, string | null>;
  /** Source entity type used for resolution */
  dataSource: ReportDesignerTestDataSource;
  /** Human-readable description of the data context for the UI */
  contextDescription: string;
}

/**
 * Result returned after a test execution.
 * The rendered HTML is for preview only — not for QR issuance or PDF export.
 */
export interface ReportDesignerTestResult {
  success: boolean;
  error?: string;
  /** Preview HTML fragment — safe, server-rendered, NOT for direct innerHTML */
  previewHtmlFragment?: string;
  /** The resolved data context used for rendering */
  context?: ReportDesignerTestContext;
  /** Validation warnings from binding resolution */
  validationWarnings?: string[];
  /** Binding paths that were not resolved (e.g. optional fields) */
  unresolvedBindings?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ReportDesignerTestModeSchema = z.enum([
  "sample",
  "live_record",
  "report_filters",
]);

export const ReportDesignerTestInputSchema = z.object({
  templateId: z.number().int().positive(),
  templateType: z.enum([
    "report",
    "letter",
    "certificate",
    "form",
    "external_submission",
    "other",
  ]),
  testMode: ReportDesignerTestModeSchema,
  reportCode: z
    .string()
    .regex(/^[A-Z0-9_]+$/, "reportCode must be uppercase letters, numbers, and underscores")
    .max(100)
    .optional(),
  employeeId: z.number().int().positive().optional(),
  ownerCompanyId: z.number().int().positive().optional(),
  partyId: z.number().int().positive().optional(),
  filters: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export type ReportDesignerTestInputValidated = z.output<typeof ReportDesignerTestInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Test options descriptor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returned by getReportDesignerTestOptions — describes what context
 * is needed to run a test for a given template.
 *
 * Used by the UI to render the "Test Report" input dialog.
 */
export interface ReportDesignerTestOptions {
  templateId: number;
  templateName: string;
  templateType: string;
  /** Data sources supported for this template type */
  availableDataSources: ReportDesignerTestDataSource[];
  /** Whether live_record mode requires employee selection */
  requiresEmployeeId: boolean;
  /** Whether live_record mode requires company selection */
  requiresOwnerCompanyId: boolean;
  /** Whether live_record mode requires party selection */
  requiresPartyId: boolean;
  /** Whether report_filters mode is supported */
  supportsReportFilters: boolean;
  /** Report codes available for testing (if any) */
  availableReportCodes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample data generator (for "sample" test mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build static sample binding values for preview without hitting the DB.
 * Used in "sample" test mode and as fallback when live data is unavailable.
 *
 * All values are clearly labeled as [SAMPLE] to prevent confusion.
 */
export function buildSampleBindingValues(): Record<string, string> {
  return {
    "employee.full_name_en": "[SAMPLE] Ahmed Al Mansoori",
    "employee.full_name_ar": "[SAMPLE] أحمد المنصوري",
    "employee.employee_code": "[SAMPLE] EMP-2026-001",
    "employee.designation": "[SAMPLE] Senior Analyst",
    "employee.department": "[SAMPLE] Finance Department",
    "employee.branch": "[SAMPLE] Head Office",
    "employee.owner_company": "[SAMPLE] ALGT Holdings LLC",
    "employee.joining_date": "[SAMPLE] 01 Jan 2022",
    "employee.nationality": "[SAMPLE] UAE",
    "employee.employment_type": "[SAMPLE] Full-Time Permanent",
    "employee.contract_end_date": "[SAMPLE] 31 Dec 2027",
    "company.legal_name_en": "[SAMPLE] ALGT Holdings LLC",
    "company.legal_name_ar": "[SAMPLE] شركة الجت القابضة ذ.م.م",
    "company.address_block_en": "[SAMPLE] Level 12, Business Bay Tower, Dubai, UAE",
    "company.trn": "[SAMPLE] 100123456700003",
    "company.trade_license_no": "[SAMPLE] DED-2022-12345",
    "company.phone": "[SAMPLE] +971 4 123 4567",
    "company.email": "[SAMPLE] info@algt.example.com",
    "company.website": "[SAMPLE] www.algt.example.com",
    "document.title": "[SAMPLE] Experience Letter",
    "document.ref": "[SAMPLE] EXP/2026/001",
    "document.generated_at": "[SAMPLE] 01 Jul 2026",
    "document.issue_date": "[SAMPLE] 01 Jul 2026",
    "document.qr_verification_url": "[SAMPLE] https://app.example.com/verify/SAMPLE_TOKEN",
    "report.title": "[SAMPLE] HR Employee Report",
    "report.code": "[SAMPLE] HR_EMPLOYEE_LIST",
    "report.total_rows": "[SAMPLE] 42",
    "report.generated_at": "[SAMPLE] 01 Jul 2026",
  };
}
