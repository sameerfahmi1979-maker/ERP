"use server";

/**
 * Report Designer — Live Report Test Server Actions (Foundation Skeleton)
 * Phase: REPORT DESIGNER.1
 *
 * Foundation skeletons for the future "Test Report" capability.
 * These actions are READ-ONLY and non-mutating.
 *
 * Full test execution engine is planned for REPORT DESIGNER.5.
 *
 * SECURITY INVARIANTS (must hold in all future phases):
 *  - Must NEVER create public QR links
 *  - Must NEVER write report_runs or audit report outputs
 *  - Must NEVER send emails
 *  - Must NEVER publish or mutate templates
 *  - Must respect RBAC: reports.view + module-specific data access
 *  - Must apply sensitive-field redaction (salary, IBAN, etc.)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  ReportDesignerTestInputSchema,
  buildSampleBindingValues,
} from "@/lib/report-designer";
import type {
  ReportDesignerTestDataSource,
  ReportDesignerTestInput,
  ReportDesignerTestOptions,
  ReportDesignerTestResult,
} from "@/lib/report-designer";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// getReportDesignerTestOptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns what context is needed to run a live test for a given template.
 * Requires: reports.view
 */
export async function getReportDesignerTestOptions(
  templateId: number
): Promise<ActionResult<ReportDesignerTestOptions>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.view required" };
    }

    const supabase = createAdminClient();
    const { data: tpl, error } = await supabase
      .from("erp_report_templates")
      .select("id,template_name,template_type,governance_status")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (error || !tpl)
      return { success: false, error: error?.message ?? "Template not found" };

    const row = tpl as { id: number; template_name: string; template_type: string; governance_status: string };
    const type = row.template_type;

    const options: ReportDesignerTestOptions = {
      templateId: row.id,
      templateName: row.template_name,
      templateType: type,
      availableDataSources: deriveDataSources(type),
      requiresEmployeeId: ["letter", "certificate"].includes(type),
      requiresOwnerCompanyId: ["letter", "certificate", "report"].includes(type),
      requiresPartyId: false,
      supportsReportFilters: type === "report",
      availableReportCodes: [],
    };

    return { success: true, data: options };
  } catch (err) {
    console.error("[report-designer-test] getReportDesignerTestOptions:", err);
    return { success: false, error: "Unexpected error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateReportDesignerTestInput
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a test input object against the Zod schema.
 * Requires: reports.view
 */
export async function validateReportDesignerTestInput(
  input: unknown
): Promise<ActionResult<{ valid: boolean; errors: string[] }>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions" };
    }

    const parsed = ReportDesignerTestInputSchema.safeParse(input);

    if (parsed.success) {
      return { success: true, data: { valid: true, errors: [] } };
    }

    return {
      success: true,
      data: {
        valid: false,
        errors: parsed.error.issues.map(
          (e) => `${e.path.map(String).join(".")}: ${e.message}`
        ),
      },
    };
  } catch (err) {
    console.error("[report-designer-test] validateReportDesignerTestInput:", err);
    return { success: false, error: "Unexpected error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runReportDesignerTest  (SKELETON — REPORT DESIGNER.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a report designer test run.
 *
 * SKELETON — Returns sample data only in REPORT DESIGNER.1.
 * Full live-record and report-filter execution is planned for REPORT DESIGNER.5.
 *
 * REPORT DESIGNER.5 integration plan:
 *  1. For testMode="live_record" + employeeId → call getHrLetterContext() or
 *     equivalent safe resolver to build ExportBrandingContext + field map.
 *  2. For testMode="report_filters" → call the report runner in preview mode
 *     (no audit row written, no PDF exported).
 *  3. Redact any binding resolved to a sensitive field:
 *     salary, IBAN, bank_account, medical data — replace with "[REDACTED]".
 *  4. Pass resolved bindings + template layout to renderExecutiveLedgerHtml()
 *     to generate a safe HTML fragment.
 *  5. NEVER persist the test run. NEVER create a QR link. NEVER send emails.
 *
 * Requires: reports.view
 */
export async function runReportDesignerTest(
  input: ReportDesignerTestInput
): Promise<ActionResult<ReportDesignerTestResult>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.view required" };
    }

    const parsed = ReportDesignerTestInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid test input: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      };
    }

    // REPORT DESIGNER.1: return sample data only — full execution in REPORT DESIGNER.5
    const sampleBindings = buildSampleBindingValues();

    const result: ReportDesignerTestResult = {
      success: true,
      context: {
        isSampleData: true,
        sensitiveFieldsRedacted: false,
        resolvedBindings: sampleBindings,
        dataSource: "generic",
        contextDescription:
          "Sample placeholder data (REPORT DESIGNER.5 will add live data resolution)",
      },
      validationWarnings: [
        "Live data resolution is not yet implemented (REPORT DESIGNER.5). " +
          "This preview uses sample placeholder values only.",
      ],
      unresolvedBindings: [],
    };

    return { success: true, data: result };
  } catch (err) {
    console.error("[report-designer-test] runReportDesignerTest:", err);
    return { success: false, error: "Unexpected error during test run" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deriveDataSources(templateType: string): ReportDesignerTestDataSource[] {
  switch (templateType) {
    case "letter":
    case "certificate":
      return ["employee_letter", "company_letter", "generic"];
    case "report":
    case "group_summary":
      return ["report_table", "employee_report", "generic"];
    case "form":
    case "checklist":
      return ["employee_letter", "generic"];
    default:
      return ["generic"];
  }
}
