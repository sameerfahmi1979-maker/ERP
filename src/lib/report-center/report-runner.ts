/**
 * Global ERP Report Center — Report Runner Foundation
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Server-side only. Do NOT import in client components.
 *
 * REPORT.2 scope:
 *  - runReport: validates permissions, detects missing fetcher, creates run log
 *  - createReportRunLog / completeReportRunLog / failReportRunLog: audit trail
 *
 * Real fetchers are registered in report-fetchers.ts (REPORT.4 for HR reports).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ReportRunRequest,
  ReportRunResult,
  ReportRegistryEntry,
  ReportDataResult,
} from "./types";
import { resolveReportBranding } from "./branding-resolver";
import { applyRedaction } from "./redaction-engine";
import { REPORT_FETCHERS } from "./report-fetchers";

// ─────────────────────────────────────────────────────────────────────────────
// Registry loader
// ─────────────────────────────────────────────────────────────────────────────

async function loadRegistryEntry(
  reportCode: string
): Promise<ReportRegistryEntry | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("erp_report_registry")
    .select("*")
    .eq("report_code", reportCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data as ReportRegistryEntry | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run log helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRunLogInput {
  reportCode: string;
  reportId: number | null;
  runByUserId: number;
  outputFormat: string;
  filtersJson: Record<string, unknown>;
  selectedTemplateId: number | null;
  resolvedBrandingProfileId: number | null;
  ownerCompanyIds: number[];
  wasMultiCompany: boolean;
  templateSelectedManually: boolean;
  sensitiveProfile: string;
  sensitiveDataIncluded: boolean;
}

export interface CreateRunLogResult {
  runId: number | null;
  error?: string;
}

export async function createReportRunLog(
  input: CreateRunLogInput
): Promise<CreateRunLogResult> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_runs")
      .insert({
        report_code: input.reportCode,
        report_id: input.reportId,
        run_by: input.runByUserId,
        run_status: "running",
        output_format: input.outputFormat,
        filters_json: input.filtersJson,
        selected_template_id: input.selectedTemplateId,
        resolved_branding_profile_id: input.resolvedBrandingProfileId,
        owner_company_ids: input.ownerCompanyIds,
        was_multi_company: input.wasMultiCompany,
        template_selected_manually: input.templateSelectedManually,
        sensitive_profile: input.sensitiveProfile,
        sensitive_data_included: input.sensitiveDataIncluded,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[report-runner] createReportRunLog error:", error.message);
      return { runId: null, error: error.message };
    }

    return { runId: (data as { id: number }).id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[report-runner] createReportRunLog exception:", msg);
    return { runId: null, error: msg };
  }
}

export async function completeReportRunLog(
  runId: number,
  rowCount: number,
  redactionSummaryJson: Record<string, unknown>,
  durationMs: number
): Promise<void> {
  try {
    const db = createAdminClient();
    await db
      .from("erp_report_runs")
      .update({
        run_status: "success",
        row_count: rowCount,
        redaction_summary_json: redactionSummaryJson,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", runId);
  } catch (err) {
    console.error("[report-runner] completeReportRunLog exception:", err);
  }
}

export async function failReportRunLog(
  runId: number,
  errorMessage: string,
  durationMs: number
): Promise<void> {
  try {
    const db = createAdminClient();
    await db
      .from("erp_report_runs")
      .update({
        run_status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", runId);
  } catch (err) {
    console.error("[report-runner] failReportRunLog exception:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a report:
 * 1. Load registry entry
 * 2. Validate caller permissions
 * 3. Resolve branding / template
 * 4. Find and call fetcher (or return controlled "not implemented" for stubs)
 * 5. Apply redaction
 * 6. Write run log
 * 7. Return result
 */
export async function runReport(
  request: ReportRunRequest,
  callerPermissionCodes: string[]
): Promise<ReportRunResult> {
  const startMs = Date.now();

  // ── 1. Load registry ──────────────────────────────────────────────────────
  const registryEntry = await loadRegistryEntry(request.reportCode);
  if (!registryEntry) {
    return {
      success: false,
      error: `Report '${request.reportCode}' not found in registry.`,
    };
  }

  // ── 2. Permission check ───────────────────────────────────────────────────
  const missingPerms = registryEntry.required_permissions.filter(
    (p) => !callerPermissionCodes.includes(p)
  );
  if (missingPerms.length > 0) {
    return {
      success: false,
      error: `Missing permissions: ${missingPerms.join(", ")}`,
    };
  }

  // ── 3. Branding resolution ────────────────────────────────────────────────
  const brandingResult = await resolveReportBranding({
    templateId: request.templateId,
    ownerCompanyIds: request.ownerCompanyIds ?? [],
    registryEntry,
    isLetterType: registryEntry.is_letter_type,
  });

  if (brandingResult.requiresManualTemplateSelection) {
    return {
      success: false,
      requiresManualTemplateSelection: true,
      error:
        "This report spans multiple companies. Please select a template manually.",
    };
  }

  // ── 4. Create run log (status=running) ────────────────────────────────────
  const { runId } = await createReportRunLog({
    reportCode: request.reportCode,
    reportId: registryEntry.id,
    runByUserId: request.requestedByUserId,
    outputFormat: request.outputFormat,
    filtersJson: request.filters ?? {},
    selectedTemplateId: brandingResult.resolvedTemplate?.id ?? null,
    resolvedBrandingProfileId:
      brandingResult.resolvedBrandingProfile?.id ?? null,
    ownerCompanyIds: request.ownerCompanyIds ?? [],
    wasMultiCompany: (request.ownerCompanyIds?.length ?? 0) > 1,
    templateSelectedManually: !!request.templateId,
    sensitiveProfile: registryEntry.sensitive_profile,
    sensitiveDataIncluded: registryEntry.sensitive_profile !== "normal",
  });

  // ── 5. Fetch data ─────────────────────────────────────────────────────────
  const fetcher = REPORT_FETCHERS[request.reportCode];
  if (!fetcher) {
    const errMsg = `Fetcher for '${request.reportCode}' is not implemented in this phase (REPORT.2). It will be available in REPORT.4.`;
    if (runId) {
      await failReportRunLog(runId, errMsg, Date.now() - startMs);
    }
    return { success: false, error: errMsg, runId: runId ?? undefined };
  }

  let rawData: ReportDataResult;
  try {
    rawData = await fetcher.fetch(
      request.filters ?? {},
      callerPermissionCodes
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (runId) {
      await failReportRunLog(runId, errMsg, Date.now() - startMs);
    }
    return { success: false, error: errMsg, runId: runId ?? undefined };
  }

  // ── 6. Apply redaction ────────────────────────────────────────────────────
  const { sanitizedData, summary } = applyRedaction(rawData, {
    profile: registryEntry.sensitive_profile,
    permissionCodes: callerPermissionCodes,
  });

  // ── 7. Complete run log ───────────────────────────────────────────────────
  const durationMs = Date.now() - startMs;
  if (runId) {
    await completeReportRunLog(
      runId,
      sanitizedData.rows.length,
      summary as unknown as Record<string, unknown>,
      durationMs
    );
  }

  return {
    success: true,
    runId: runId ?? undefined,
    rowCount: sanitizedData.rows.length,
    data: sanitizedData,
    redactionSummary: summary,
    resolvedBrandingProfileId:
      brandingResult.resolvedBrandingProfile?.id ?? undefined,
    resolvedTemplateId: brandingResult.resolvedTemplate?.id ?? undefined,
  };
}
