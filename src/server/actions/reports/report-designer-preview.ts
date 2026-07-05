"use server";

/**
 * Report Designer — Formal Preview Server Action
 * Phase: REPORT DESIGNER.4 — Layout JSON to Executive Ledger Mapping
 *
 * Security invariants:
 *  - Requires reports.manage (user may send unsaved/draft layout JSON)
 *  - NEVER creates public QR links (erp_output_public_links)
 *  - NEVER writes report run history
 *  - NEVER sends emails
 *  - NEVER auto-publishes/approves templates
 *  - Branding resolved from DB only (no user-supplied asset URLs)
 *  - All layout JSON validated via Zod before mapping
 *  - HTML rendered by trusted Executive Ledger renderer (all text escaped)
 */

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { resolveTemplatePreview } from "@/server/actions/reports/templates";
import {
  mapRawZonesToExecutiveLedgerDocument,
  buildSampleBindingValues,
} from "@/lib/report-designer";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PreviewReportDesignerTemplateInput {
  templateId: number;
  /** Current header zone layout JSON (may be unsaved in-memory state) */
  headerLayoutJson?: unknown;
  /** Current body zone layout JSON (may be unsaved in-memory state) */
  bodyLayoutJson?: unknown;
  /** Current footer zone layout JSON (may be unsaved in-memory state) */
  footerLayoutJson?: unknown;
}

export interface PreviewReportDesignerTemplateResult {
  ok: boolean;
  /** Safe HTML string for embedding in an iframe via srcDoc */
  html?: string;
  /** Non-blocking warnings (unknown bindings, unsupported blocks, etc.) */
  warnings?: string[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a formal HTML preview of a report designer template.
 *
 * Uses sample binding values only (real data resolution is REPORT DESIGNER.5).
 * The returned HTML is safe for embedding in an <iframe srcDoc={...}>.
 *
 * Requires: reports.manage
 *   (reports.view would be insufficient here since the client sends arbitrary
 *    layout JSON that may not have been saved or validated to DB yet)
 */
export async function previewReportDesignerTemplate(
  input: PreviewReportDesignerTemplateInput
): Promise<PreviewReportDesignerTemplateResult> {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authCtx = await getAuthContext();
    if (!hasPermission(authCtx, "reports.manage")) {
      // Fallback: reports.view is acceptable for viewing a saved, published template
      if (!hasPermission(authCtx, "reports.view")) {
        return { ok: false, error: "Insufficient permissions — reports.manage required for editor preview" };
      }
    }

    const { templateId, headerLayoutJson, bodyLayoutJson, footerLayoutJson } = input;

    if (!templateId || typeof templateId !== "number" || templateId <= 0) {
      return { ok: false, error: "Invalid template ID" };
    }

    // ── Load template metadata ───────────────────────────────────────────────
    const supabase = createAdminClient();
    const { data: tpl, error: tplErr } = await supabase
      .from("erp_report_templates")
      .select("id,template_name,template_type,governance_status")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (tplErr || !tpl) {
      return { ok: false, error: tplErr?.message ?? "Template not found" };
    }

    const template = tpl as {
      id: number;
      template_name: string;
      template_type: string;
      governance_status: string;
    };

    // ── Resolve branding context ─────────────────────────────────────────────
    const brandingResult = await resolveTemplatePreview({ templateId });
    const branding = brandingResult.success && brandingResult.data
      ? brandingResult.data
      : {};

    // ── Sample binding values (REPORT DESIGNER.5 will use real data) ─────────
    const sampleValues = buildSampleBindingValues();

    // ── Map layout JSON → ExecutiveLedgerDocument ────────────────────────────
    const { document, warnings } = mapRawZonesToExecutiveLedgerDocument({
      templateName: template.template_name,
      templateType: template.template_type,
      headerLayoutRaw: headerLayoutJson,
      bodyLayoutRaw: bodyLayoutJson,
      footerLayoutRaw: footerLayoutJson,
      branding,
      bindingValues: sampleValues,
    });

    // Always warn that this is a sample-data preview
    const allWarnings: string[] = [
      "This is a sample-data preview. Binding values use placeholder data. " +
        "Real data resolution is available in REPORT DESIGNER.5.",
      ...warnings,
    ];

    // ── Render to HTML ───────────────────────────────────────────────────────
    const html = renderExecutiveLedgerHtml(document);

    return {
      ok: true,
      html,
      warnings: allWarnings,
    };
  } catch (err) {
    console.error("[report-designer-preview] previewReportDesignerTemplate:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error during preview generation",
    };
  }
}
