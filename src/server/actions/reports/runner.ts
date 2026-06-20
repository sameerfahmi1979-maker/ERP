"use server";

/**
 * Global ERP Report Center — Runner Server Actions
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Server actions wrapping the report runner library.
 * Never returns raw sensitive values to the client.
 */

import { z } from "zod";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReport, createReportRunLog } from "@/lib/report-center/report-runner";
import { resolveReportBranding } from "@/lib/report-center/branding-resolver";
import type {
  ReportRunRequest,
  ReportRunResult,
  ReportRegistryEntry,
  ResolvedReportTemplate,
} from "@/lib/report-center/types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const runReportSchema = z.object({
  reportCode: z.string().min(1).max(100),
  outputFormat: z.enum(["screen", "pdf", "excel", "csv", "print", "email"]),
  filters: z.record(z.string(), z.unknown()).optional(),
  templateId: z.number().int().positive().optional(),
  ownerCompanyIds: z.array(z.number().int().positive()).optional(),
});

const resolveTemplateSchema = z.object({
  reportCode: z.string().min(1).max(100),
  ownerCompanyIds: z.array(z.number().int().positive()).optional(),
  templateId: z.number().int().positive().optional(),
  isLetterType: z.boolean().optional(),
});

const createRunLogSchema = z.object({
  reportCode: z.string().min(1).max(100),
  outputFormat: z.enum(["screen", "pdf", "excel", "csv", "print", "email"]),
  filters: z.record(z.string(), z.unknown()).optional(),
  templateId: z.number().int().positive().optional(),
  ownerCompanyIds: z.array(z.number().int().positive()).optional(),
  sensitiveProfile: z
    .enum(["normal", "payroll", "medical", "disciplinary", "recruitment", "dms_confidential", "mixed_sensitive"])
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// runReportAction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a report via the global engine.
 * Returns structured data (screen output) or metadata for PDF/email/print jobs.
 * Never returns raw sensitive values that have been redacted.
 */
export async function runReportAction(
  input: z.infer<typeof runReportSchema>
): Promise<ActionResult<ReportRunResult>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "You do not have permission to run reports." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "Authenticated user profile not found." };
    }

    const parsed = runReportSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }

    const request: ReportRunRequest = {
      ...parsed.data,
      requestedByUserId: ctx.profile.id,
    };

    const result = await runReport(request, ctx.permissionCodes);

    if (result.success) {
      await logAudit({
        module_code: "REPORTS",
        entity_name: "erp_report_runs",
        entity_id: result.runId ?? null,
        entity_reference: `${parsed.data.reportCode}/${parsed.data.outputFormat}`,
        action: "run",
        new_values: {
          report_code: parsed.data.reportCode,
          output_format: parsed.data.outputFormat,
          row_count: result.rowCount,
          was_redacted: result.redactionSummary?.wasRedacted ?? false,
        },
      });
    }

    return { success: result.success, data: result, error: result.error };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveReportTemplateForContextAction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the appropriate branding profile and template for a report context.
 * Called before rendering PDF/print output.
 */
export async function resolveReportTemplateForContextAction(
  input: z.infer<typeof resolveTemplateSchema>
): Promise<
  ActionResult<{
    resolvedTemplate: ResolvedReportTemplate | null;
    requiresManualTemplateSelection: boolean;
    isFallback: boolean;
  }>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view reports." };
    }

    const parsed = resolveTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }

    // Load registry entry for this report
    const db = createAdminClient();
    const { data: regRow } = await db
      .from("erp_report_registry")
      .select("*")
      .eq("report_code", parsed.data.reportCode)
      .maybeSingle();

    if (!regRow) {
      return { success: false, error: `Report '${parsed.data.reportCode}' not found.` };
    }

    const result = await resolveReportBranding({
      templateId: parsed.data.templateId,
      ownerCompanyIds: parsed.data.ownerCompanyIds ?? [],
      registryEntry: regRow as ReportRegistryEntry,
      isLetterType: parsed.data.isLetterType,
    });

    return {
      success: true,
      data: {
        resolvedTemplate: result.resolvedTemplate,
        requiresManualTemplateSelection: result.requiresManualTemplateSelection,
        isFallback: result.isFallback,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createReportRunLogAction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a report run log entry manually.
 * Used by output adapters (PDF, Excel) that handle their own data fetching.
 */
export async function createReportRunLogAction(
  input: z.infer<typeof createRunLogSchema>
): Promise<ActionResult<{ runId: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.run")) {
      return { success: false, error: "You do not have permission to run reports." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "Authenticated user profile not found." };
    }

    const parsed = createRunLogSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }

    const db = createAdminClient();
    const { data: regRow } = await db
      .from("erp_report_registry")
      .select("id, sensitive_profile")
      .eq("report_code", parsed.data.reportCode)
      .maybeSingle();

    const { runId, error } = await createReportRunLog({
      reportCode: parsed.data.reportCode,
      reportId: (regRow as { id?: number } | null)?.id ?? null,
      runByUserId: ctx.profile.id,
      outputFormat: parsed.data.outputFormat,
      filtersJson: parsed.data.filters ?? {},
      selectedTemplateId: parsed.data.templateId ?? null,
      resolvedBrandingProfileId: null,
      ownerCompanyIds: parsed.data.ownerCompanyIds ?? [],
      wasMultiCompany: (parsed.data.ownerCompanyIds?.length ?? 0) > 1,
      templateSelectedManually: !!parsed.data.templateId,
      sensitiveProfile:
        parsed.data.sensitiveProfile ??
        (regRow as { sensitive_profile?: string } | null)?.sensitive_profile ??
        "normal",
      sensitiveDataIncluded: false,
    });

    if (error || runId === null) {
      return { success: false, error: error ?? "Failed to create run log." };
    }

    return { success: true, data: { runId } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
