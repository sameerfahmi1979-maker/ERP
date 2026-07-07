"use server";

/**
 * Report Designer — Visual Layout Server Actions
 * Phase: REPORT DESIGNER.1 — DB Schema, Layout Standard, Zod Validation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import {
  EMPTY_LAYOUT,
  EDITABLE_GOVERNANCE_STATUSES,
  validateSaveLayoutInput,
  buildLayoutAuditMeta,
  ReportDesignerLayoutJsonSchema,
  SaveVisualLayoutInputSchema,
  repairLayoutBindingTokenPaths,
} from "@/lib/report-designer";
import type {
  ReportDesignerLayoutJson,
  VisualLayoutResult,
  SaveVisualLayoutInput,
} from "@/lib/report-designer";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// getReportTemplateVisualLayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the visual layout JSON for a template, plus governance metadata.
 * Returns EMPTY_LAYOUT defaults for zones that have not been designed yet.
 * Requires: reports.view or reports.manage
 */
export async function getReportTemplateVisualLayout(
  templateId: number
): Promise<ActionResult<VisualLayoutResult>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.view required" };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("erp_report_templates")
      .select(
        "id,template_name,template_code,template_type,version_no,governance_status,security_review_status,body_layout_json,header_layout_json,footer_layout_json,visual_editor_engine,visual_layout_schema_version,visual_layout_updated_at,visual_layout_updated_by"
      )
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (error || !data)
      return { success: false, error: error?.message ?? "Template not found" };

    const row = data as {
      id: number;
      template_name: string;
      template_code: string;
      template_type: string;
      version_no: number;
      governance_status: string;
      security_review_status: string | null;
      body_layout_json: unknown;
      header_layout_json: unknown;
      footer_layout_json: unknown;
      visual_editor_engine: string | null;
      visual_layout_schema_version: number | null;
      visual_layout_updated_at: string | null;
      visual_layout_updated_by: string | null;
    };

    const isEditable = (EDITABLE_GOVERNANCE_STATUSES as readonly string[]).includes(
      row.governance_status
    );

    const parseZone = (raw: unknown): ReportDesignerLayoutJson => {
      if (raw == null || raw === "") return EMPTY_LAYOUT;
      const parsed = ReportDesignerLayoutJsonSchema.safeParse(raw);
      return parsed.success ? parsed.data : EMPTY_LAYOUT;
    };

    return {
      success: true,
      data: {
        templateId: row.id,
        templateName: row.template_name,
        templateCode: row.template_code,
        templateType: row.template_type,
        versionNo: row.version_no,
        governanceStatus: row.governance_status,
        securityReviewStatus: row.security_review_status ?? "pending",
        isEditable,
        bodyLayout: parseZone(row.body_layout_json),
        headerLayout: parseZone(row.header_layout_json),
        footerLayout: parseZone(row.footer_layout_json),
        visualEditorEngine: row.visual_editor_engine ?? "puck",
        visualLayoutSchemaVersion: row.visual_layout_schema_version ?? 1,
        visualLayoutUpdatedAt: row.visual_layout_updated_at ?? null,
        visualLayoutUpdatedBy: row.visual_layout_updated_by ?? null,
      },
    };
  } catch (err) {
    console.error("[report-designer-layout] getReportTemplateVisualLayout:", err);
    return { success: false, error: "Unexpected error loading visual layout" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveReportTemplateVisualLayout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save the visual layout JSON for a template.
 *
 * Governance guard: only draft or rejected templates may be edited.
 * Requires: reports.manage
 */
export async function saveReportTemplateVisualLayout(
  input: SaveVisualLayoutInput
): Promise<ActionResult<{ templateId: number }>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions — reports.manage required" };
    }

    // Strip client-side Proxy wrappers from TipTap/Puck state objects before
    // any property access or Zod parsing. Without this, Next.js RSC boundary
    // throws "Cannot access X on the server" when validation walks richContent.
    const sanitize = <T>(v: T): T =>
      v != null ? (JSON.parse(JSON.stringify(v)) as T) : v;
    const sanitizedInput = {
      ...input,
      bodyLayout: sanitize(input.bodyLayout),
      headerLayout: sanitize(input.headerLayout),
      footerLayout: sanitize(input.footerLayout),
    } satisfies typeof input;

    // Self-heal binding chips that lost their path attribute (stale/broken
    // client bundles serialize chips without attrs). The plain-text fallback
    // carries the correct {{path}} tokens in document order, so we can repair
    // server-side regardless of what version the browser is running.
    for (const zone of [
      sanitizedInput.bodyLayout,
      sanitizedInput.headerLayout,
      sanitizedInput.footerLayout,
    ]) {
      if (!zone) continue;
      const repairedBlocks = repairLayoutBindingTokenPaths(
        zone as unknown as Record<string, unknown>
      );
      if (repairedBlocks > 0) {
        console.warn(
          `[report-designer-layout] save: repaired binding token paths in ${repairedBlocks} block(s) (template ${input.templateId})`
        );
      }
    }

    // Zod + binding validation
    const validation = validateSaveLayoutInput(sanitizedInput);
    if (!validation.valid) {
      return {
        success: false,
        error: `Layout validation failed:\n${validation.errors.join("\n")}`,
      };
    }

    const validated = SaveVisualLayoutInputSchema.parse(sanitizedInput);
    const supabase = createAdminClient();

    // Fetch current governance status
    const { data: tpl, error: fetchErr } = await supabase
      .from("erp_report_templates")
      .select("id,governance_status,template_code")
      .eq("id", validated.templateId)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !tpl)
      return { success: false, error: fetchErr?.message ?? "Template not found" };

    const tplRow = tpl as { id: number; governance_status: string; template_code: string };

    // Governance guard
    if (!(EDITABLE_GOVERNANCE_STATUSES as readonly string[]).includes(tplRow.governance_status)) {
      return {
        success: false,
        error: `Template cannot be edited — current status is "${tplRow.governance_status}". Only draft or rejected templates may have their visual layout changed.`,
      };
    }

    const now = new Date().toISOString();
    const actorId = authCtx.profile?.id ?? null;

    const { error: updateErr } = await supabase
      .from("erp_report_templates")
      .update({
        body_layout_json: validated.bodyLayout,
        header_layout_json: validated.headerLayout ?? {},
        footer_layout_json: validated.footerLayout ?? {},
        visual_editor_engine: validated.bodyLayout.engine,
        visual_layout_schema_version: validated.bodyLayout.schemaVersion,
        visual_layout_updated_at: now,
        visual_layout_updated_by: actorId,
        updated_at: now,
        updated_by: actorId,
      })
      .eq("id", validated.templateId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Audit: structural metadata only — never full layout JSON
    const auditMeta = buildLayoutAuditMeta(validated.templateId, validated.bodyLayout);
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: validated.templateId,
      entity_reference: tplRow.template_code,
      action: "visual_layout_saved",
      new_values: auditMeta,
    });

    revalidatePath("/admin/reports/templates");

    return { success: true, data: { templateId: validated.templateId } };
  } catch (err) {
    console.error("[report-designer-layout] saveReportTemplateVisualLayout:", err);
    return { success: false, error: "Unexpected error saving visual layout" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateReportDesignerLayoutAction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side validation of a layout without saving.
 * Requires: reports.view or reports.manage
 */
export async function validateReportDesignerLayoutAction(
  input: unknown
): Promise<ActionResult<{ valid: boolean; errors: string[]; warnings: string[] }>> {
  try {
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.view") && !hasPermission(authCtx, "reports.manage")) {
      return { success: false, error: "Insufficient permissions" };
    }

    const result = validateSaveLayoutInput(input);

    return {
      success: true,
      data: {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      },
    };
  } catch (err) {
    console.error("[report-designer-layout] validateReportDesignerLayoutAction:", err);
    return { success: false, error: "Unexpected error during validation" };
  }
}
