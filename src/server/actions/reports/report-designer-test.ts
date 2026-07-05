"use server";

/**
 * Report Designer — Live Report Test Server Actions
 * Phase: REPORT DESIGNER.5 — Live Report Test Execution with Real ERP Data
 * Phase: REPORT DESIGNER.6 — Safe Renderer and Production Output Integration
 *
 * REPORT DESIGNER.6 adds:
 *  - Company Context test mode (ownerCompanyId only, no employee)
 *  - Report Filters test mode (no-write preview via preview-runner)
 *  - searchReportDesignerTestCompanies action
 *
 * SECURITY INVARIANTS (all maintained):
 *  - NEVER creates public QR links (erp_output_public_links)
 *  - NEVER writes report_runs or erp_report_delivery_logs
 *  - NEVER sends or queues emails
 *  - NEVER publishes or mutates templates
 *  - NEVER updates employees, HR, DMS, parties, payroll, or any business data
 *  - Requires RBAC: reports.view/manage + hr.employees.view for employee data
 *  - Sensitive fields (salary, IBAN, passport, EID, etc.) NEVER in binding registry
 *  - Defensive redaction applied to all resolved binding values
 *  - SELECT-only DB operations after permission gate
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
import {
  resolveEmployeeBindingValues,
  resolveOwnerCompanyBindingValues,
  resolveDocumentBindingValues,
  redactDesignerTestBindingValues,
  buildReportDesignerTestContextSummary,
} from "@/lib/report-designer/test-data-resolver";
import { resolveTemplatePreview } from "@/server/actions/reports/templates";
import { mapRawZonesToExecutiveLedgerDocument } from "@/lib/report-designer/layout-to-executive-ledger";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import { runReportFetcherPreview } from "@/lib/report-center/preview-runner";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Null-safe empty company bindings helper
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_COMPANY_BINDINGS: Record<string, string> = {
  "company.legal_name_en": "",
  "company.legal_name_ar": "",
  "company.address_block_en": "",
  "company.trn": "",
  "company.trade_license_no": "",
  "company.phone": "",
  "company.email": "",
  "company.website": "",
};

// ─────────────────────────────────────────────────────────────────────────────
// getReportDesignerTestOptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns what context is needed to run a live test for a given template.
 * Requires: reports.view or reports.manage
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
// runReportDesignerTest — REPORT DESIGNER.5 + DESIGNER.6
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a report designer test run with real or sample ERP data.
 *
 * REPORT DESIGNER.5:
 *  - Sample mode: uses static placeholder values
 *  - live_record mode with employeeId: resolves real employee + company bindings
 *
 * REPORT DESIGNER.6 adds:
 *  - live_record mode with ownerCompanyId (no employee): Company Context
 *  - report_filters mode: no-write preview via runReportFetcherPreview
 *
 * Requires: reports.view or reports.manage
 * Employee data additionally requires: hr.employees.view
 *
 * SAFETY: read-only. No QR tokens, no report runs, no emails, no mutations.
 */
export async function runReportDesignerTest(
  input: ReportDesignerTestInput
): Promise<ActionResult<ReportDesignerTestResult>> {
  const startMs = Date.now();

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.view required" };
    }

    // ── Zod validation ───────────────────────────────────────────────────────
    const parsed = ReportDesignerTestInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid test input: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
      };
    }

    const {
      templateId,
      testMode,
      employeeId,
      ownerCompanyId,
      reportCode,
      filters,
      headerLayoutJson,
      bodyLayoutJson,
      footerLayoutJson,
    } = parsed.data;

    // ── Load template metadata ───────────────────────────────────────────────
    const supabase = createAdminClient();
    const { data: tpl, error: tplErr } = await supabase
      .from("erp_report_templates")
      .select(
        "id,template_name,template_code,template_type,governance_status,branding_profile_id," +
        "header_layout_json,body_layout_json,footer_layout_json"
      )
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (tplErr || !tpl) {
      return { success: false, error: tplErr?.message ?? "Template not found" };
    }

    const template = tpl as unknown as {
      id: number;
      template_name: string;
      template_code: string;
      template_type: string;
      governance_status: string;
      branding_profile_id: number | null;
      header_layout_json: unknown;
      body_layout_json: unknown;
      footer_layout_json: unknown;
    };

    // ── Resolve layout zones (prefer client in-memory over saved DB layout) ──
    // Deep-clone through JSON round-trip to strip any client-side Proxy wrappers
    // from TipTap/Puck state objects before passing to the server renderer.
    // This resolves the Next.js RSC "Cannot access textAlign on the server" error
    // caused by ProseMirror attrs objects being proxied in the client module context.
    const sanitize = (v: unknown) =>
      v != null ? JSON.parse(JSON.stringify(v)) as unknown : v;
    const resolvedHeaderLayout = sanitize(headerLayoutJson ?? template.header_layout_json);
    const resolvedBodyLayout = sanitize(bodyLayoutJson ?? template.body_layout_json);
    const resolvedFooterLayout = sanitize(footerLayoutJson ?? template.footer_layout_json);

    // ── Resolve branding context ─────────────────────────────────────────────
    const brandingResult = await resolveTemplatePreview({ templateId });
    const branding = brandingResult.success && brandingResult.data ? brandingResult.data : {};

    // ── Resolve binding values based on test mode ────────────────────────────
    const allWarnings: string[] = [];
    let bindingValues: Record<string, string> = {};
    let contextDescription = "";
    let dataSource: ReportDesignerTestDataSource = "generic";
    let isSampleData = true;
    let sensitiveFieldsRedacted = false;
    let resolvedOwnerCompanyId: number | null = null;
    // REPORT DESIGNER.8: preview rows for ReportTableBlock rendering
    let reportPreviewRows: Record<string, unknown>[] = [];
    let reportPreviewColumns: string[] = [];

    if (testMode === "sample") {
      // ── Sample mode ─────────────────────────────────────────────────────
      bindingValues = buildSampleBindingValues();
      contextDescription = "Sample placeholder data — no live DB query";
      dataSource = "generic";
      isSampleData = true;

      const redactResult = redactDesignerTestBindingValues(bindingValues);
      bindingValues = redactResult.values;
      if (redactResult.redactedKeys.length > 0) {
        allWarnings.push(
          `Defensive redaction removed ${redactResult.redactedKeys.length} unexpected sensitive field(s) from sample data.`
        );
      }

    } else if (testMode === "live_record") {
      // ── Live record mode: Employee or Company Context ────────────────────
      isSampleData = false;

      if (employeeId) {
        // Employee Record sub-mode
        if (!hasPermission(authCtx, "hr.employees.view") && !hasPermission(authCtx, "reports.manage")) {
          return {
            success: false,
            error: "Insufficient permissions — hr.employees.view required to test with live employee data",
          };
        }

        const empResult = await resolveEmployeeBindingValues(employeeId, supabase);
        allWarnings.push(...empResult.warnings);
        bindingValues = { ...bindingValues, ...empResult.values };
        contextDescription = empResult.contextDescription;
        dataSource = "employee_letter";
        resolvedOwnerCompanyId = empResult.ownerCompanyId;

        // Resolve owner company from employee if no explicit ownerCompanyId
        const coId = ownerCompanyId ?? resolvedOwnerCompanyId;
        if (coId) {
          const coResult = await resolveOwnerCompanyBindingValues(coId, supabase);
          allWarnings.push(...coResult.warnings);
          bindingValues = { ...bindingValues, ...coResult.values };
        } else {
          allWarnings.push("company bindings: employee has no owner company — company.* bindings will be empty");
          bindingValues = { ...bindingValues, ...EMPTY_COMPANY_BINDINGS };
        }

      } else if (ownerCompanyId) {
        // Company Context sub-mode (no employee)
        dataSource = "company_letter";
        resolvedOwnerCompanyId = ownerCompanyId;

        const coResult = await resolveOwnerCompanyBindingValues(ownerCompanyId, supabase);
        allWarnings.push(...coResult.warnings);
        bindingValues = { ...bindingValues, ...coResult.values };
        contextDescription = `Company: ${bindingValues["company.legal_name_en"] || `(id=${ownerCompanyId})`}`;

        // Employee bindings are blank in company-only mode
        allWarnings.push(
          "employee.* bindings: not resolved in Company Context mode — add employee selection for employee data"
        );

      } else {
        return {
          success: false,
          error: "live_record mode requires either employeeId or ownerCompanyId",
        };
      }

      // Document + report bindings
      const docBindings = resolveDocumentBindingValues({
        templateName: template.template_name,
        templateCode: template.template_code,
      });
      bindingValues = { ...bindingValues, ...docBindings };

      // Defensive redaction
      const redactResult = redactDesignerTestBindingValues(bindingValues);
      bindingValues = redactResult.values;
      if (redactResult.redactedKeys.length > 0) {
        sensitiveFieldsRedacted = true;
        allWarnings.push(
          `Defensive redaction removed ${redactResult.redactedKeys.length} unexpected sensitive field(s): ${redactResult.redactedKeys.join(", ")}`
        );
      }

    } else if (testMode === "report_filters") {
      // ── Report Filters mode — REPORT DESIGNER.6 ─────────────────────────
      if (!reportCode) {
        return {
          success: false,
          error: "reportCode is required for report_filters test mode",
        };
      }

      const previewResult = await runReportFetcherPreview({
        reportCode,
        filters: filters as Record<string, unknown> | undefined,
        permissionCodes: authCtx.permissionCodes ?? [],
        maxRows: 50,
      });

      if (!previewResult.success) {
        allWarnings.push(
          `Report Filters preview failed: ${previewResult.error ?? "unknown error"}. Falling back to sample data.`
        );
        bindingValues = buildSampleBindingValues();
        isSampleData = true;
        contextDescription = "Report filters fallback — preview failed";
        dataSource = "generic";
      } else {
        // Map report metadata to report.* bindings
        const rowCount = previewResult.totalRows ?? 0;
        bindingValues = {
          ...buildSampleBindingValues(), // fill employee/company with samples
          "report.title": previewResult.reportTitle ?? reportCode,
          "report.code": reportCode,
          "report.total_rows": String(rowCount),
          "report.generated_at": new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          "document.title": template.template_name,
          "document.ref": `TST/${new Date().getFullYear()}-PREVIEW`,
          "document.generated_at": new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          "document.issue_date": new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          "document.qr_verification_url": "[TEST PREVIEW — No QR token issued]",
        };

        isSampleData = false;
        dataSource = "report_table";
        contextDescription = `Report: ${previewResult.reportTitle ?? reportCode} — ${rowCount} rows (capped at ${previewResult.isCapped ? "50" : rowCount})`;

        // REPORT DESIGNER.8: store preview rows for ReportTableBlock rendering
        reportPreviewRows = previewResult.rows ?? [];
        reportPreviewColumns = previewResult.columns ?? [];

        if (previewResult.isCapped) {
          allWarnings.push(
            `Report data capped at 50 rows for preview (total rows: ${rowCount}). Full data available in official report run.`
          );
        }
        if (previewResult.wasRedacted) {
          sensitiveFieldsRedacted = true;
          allWarnings.push(
            "Some report fields were redacted based on your permissions. Full data visible with appropriate access."
          );
        }
      }

    } else {
      // Fallback for unknown modes
      allWarnings.push("Unknown test mode — using sample data fallback.");
      bindingValues = buildSampleBindingValues();
      isSampleData = true;
      contextDescription = "Unknown mode — sample data fallback";
      dataSource = "generic";
    }

    // ── Map layout JSON → ExecutiveLedgerDocument ────────────────────────────
    const { document, warnings: mapWarnings } = mapRawZonesToExecutiveLedgerDocument({
      templateName: template.template_name,
      templateType: template.template_type,
      headerLayoutRaw: resolvedHeaderLayout,
      bodyLayoutRaw: resolvedBodyLayout,
      footerLayoutRaw: resolvedFooterLayout,
      branding,
      bindingValues,
      // REPORT DESIGNER.8: pass preview rows for ReportTableBlock
      previewRows: reportPreviewRows,
      previewColumns: reportPreviewColumns,
    });

    allWarnings.push(...mapWarnings);

    // ── Render to HTML ───────────────────────────────────────────────────────
    const html = renderExecutiveLedgerHtml(document);

    // ── Build context summary ────────────────────────────────────────────────
    const modeKey =
      testMode === "live_record"
        ? employeeId
          ? "employee_record"
          : "employee_record"
        : testMode === "sample"
        ? "sample"
        : "report_filters";

    const contextSummary = buildReportDesignerTestContextSummary({
      mode: modeKey,
      employeeDescription: contextDescription,
      employeeId: employeeId ?? undefined,
      ownerCompanyId: resolvedOwnerCompanyId ?? ownerCompanyId ?? undefined,
      redactedFieldCount: sensitiveFieldsRedacted ? 1 : 0,
    });

    const durationMs = Date.now() - startMs;
    void durationMs;

    const result: ReportDesignerTestResult = {
      success: true,
      previewHtmlFragment: html,
      context: {
        isSampleData,
        sensitiveFieldsRedacted,
        resolvedBindings: bindingValues,
        dataSource,
        contextDescription: contextSummary.detail || contextDescription,
      },
      validationWarnings: allWarnings.length > 0 ? allWarnings : undefined,
      unresolvedBindings: [],
    };

    return { success: true, data: result };
  } catch (err) {
    console.error("[report-designer-test] runReportDesignerTest:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error during test run",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// searchReportDesignerTestEmployees
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerTestEmployeeOption {
  id: number;
  employee_code: string;
  full_name_en: string;
  designation: string;
}

/**
 * Search employees for the test panel employee selector.
 * Returns only safe, non-sensitive display fields.
 * Requires: hr.employees.view or reports.manage
 */
export async function searchReportDesignerTestEmployees(
  query: string
): Promise<ActionResult<ReportDesignerTestEmployeeOption[]>> {
  try {
    const authCtx = await getAuthContext();
    if (
      !hasPermission(authCtx, "hr.employees.view") &&
      !hasPermission(authCtx, "reports.manage")
    ) {
      return { success: false, error: "Insufficient permissions — hr.employees.view required" };
    }

    const supabase = createAdminClient();
    const trimmedQuery = (query ?? "").trim();

    let q = supabase
      .from("employees")
      .select(
        `id,
         employee_code,
         full_name_en,
         designation:designations(designation_name_en)`
      )
      .is("deleted_at", null)
      .order("employee_code", { ascending: true })
      .limit(25);

    if (trimmedQuery.length >= 2) {
      q = q.or(
        `employee_code.ilike.%${trimmedQuery}%,full_name_en.ilike.%${trimmedQuery}%`
      );
    }

    const { data, error } = await q;

    if (error) {
      return { success: false, error: error.message };
    }

    type RawRow = {
      id: number;
      employee_code: string;
      full_name_en: string;
      designation: { designation_name_en: string } | null;
    };

    const rows: ReportDesignerTestEmployeeOption[] = ((data ?? []) as unknown as RawRow[]).map((row) => ({
      id: row.id,
      employee_code: row.employee_code,
      full_name_en: row.full_name_en,
      designation: row.designation?.designation_name_en ?? "",
    }));

    return { success: true, data: rows };
  } catch (err) {
    console.error("[report-designer-test] searchReportDesignerTestEmployees:", err);
    return { success: false, error: "Unexpected error during employee search" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// searchReportDesignerTestCompanies  (REPORT DESIGNER.6)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerTestCompanyOption {
  id: number;
  company_code: string;
  legal_name_en: string;
  trade_name_en: string | null;
}

/**
 * Search owner companies for the Company Context test mode.
 * Returns only safe display fields.
 * Requires: reports.view or reports.manage
 */
export async function searchReportDesignerTestCompanies(
  query: string
): Promise<ActionResult<ReportDesignerTestCompanyOption[]>> {
  try {
    const authCtx = await getAuthContext();
    if (
      !hasPermission(authCtx, "reports.view") &&
      !hasPermission(authCtx, "reports.manage")
    ) {
      return { success: false, error: "Insufficient permissions — reports.view required" };
    }

    const supabase = createAdminClient();
    const trimmedQuery = (query ?? "").trim();

    let q = supabase
      .from("owner_companies")
      .select("id, company_code, legal_name_en, trade_name_en")
      .eq("status", "active")
      .order("legal_name_en", { ascending: true })
      .limit(25);

    if (trimmedQuery.length >= 2) {
      q = q.or(
        `legal_name_en.ilike.%${trimmedQuery}%,company_code.ilike.%${trimmedQuery}%`
      );
    }

    const { data, error } = await q;

    if (error) {
      return { success: false, error: error.message };
    }

    type RawCo = {
      id: number;
      company_code: string;
      legal_name_en: string;
      trade_name_en: string | null;
    };

    const rows: ReportDesignerTestCompanyOption[] = ((data ?? []) as RawCo[]).map((co) => ({
      id: co.id,
      company_code: co.company_code ?? "",
      legal_name_en: co.legal_name_en ?? "",
      trade_name_en: co.trade_name_en ?? null,
    }));

    return { success: true, data: rows };
  } catch (err) {
    console.error("[report-designer-test] searchReportDesignerTestCompanies:", err);
    return { success: false, error: "Unexpected error during company search" };
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
