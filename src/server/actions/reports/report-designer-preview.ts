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
import {canManageReportBrandingAssets,canViewReportBrandingAssets} from "@/lib/branding/asset-permissions";

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
    if(!hasPermission(authCtx,"reports.manage")&&!hasPermission(authCtx,"reports.view"))return {ok:false,error:"Report preview is not authorized."};

    const { templateId, headerLayoutJson, bodyLayoutJson, footerLayoutJson } = input;

    if (!Number.isSafeInteger(templateId) || templateId <= 0) {
      return { ok: false, error: "Invalid template ID" };
    }

    // ── Load template metadata ───────────────────────────────────────────────
    const supabase = createAdminClient();
    const { data: tpl, error: tplErr } = await supabase
      .from("erp_report_templates")
      .select("id,template_name,template_type,governance_status,is_active,branding_profile_id,header_layout_json,body_layout_json,footer_layout_json,branding_profile:erp_report_branding_profiles(id,owner_company_id,is_active,deleted_at)")
      .eq("id", templateId)
      .is("deleted_at", null)
      .single();

    if (tplErr || !tpl) {
      return { ok: false, error: "Template preview is unavailable." };
    }

    const template = tpl as unknown as {
      id: number;
      template_name: string;
      template_type: string;
      governance_status: string;
      is_active:boolean;
      branding_profile_id:number|null;
      branding_profile:{id:number;owner_company_id:number|null;is_active:boolean;deleted_at:string|null}|null;
      header_layout_json:unknown;
      body_layout_json:unknown;
      footer_layout_json:unknown;
    };
    const profile=template.branding_profile;
    if(!template.is_active||(template.branding_profile_id!==null&&!profile)||(profile&&(!profile.is_active||profile.deleted_at))||
      !canViewReportBrandingAssets(authCtx,profile?.owner_company_id??null))return {ok:false,error:"The selected branding is unavailable or not authorized."};
    const canEdit=canManageReportBrandingAssets(authCtx,profile?.owner_company_id??null);
    const hasDraftInput=['headerLayoutJson','bodyLayoutJson','footerLayoutJson'].some(key=>Object.hasOwn(input,key));
    if(!canEdit&&(hasDraftInput||!['approved','published'].includes(template.governance_status))){
      return {ok:false,error:"Only an authorized template manager can preview draft layouts. Viewers may preview the saved, approved template."};
    }

    // ── Resolve branding context ─────────────────────────────────────────────
    const brandingResult = await resolveTemplatePreview({ templateId });
    if(!brandingResult.success||!brandingResult.data)return {ok:false,error:"Template branding could not be loaded. Retry before previewing."};
    const branding=brandingResult.data;

    // ── Sample binding values (REPORT DESIGNER.5 will use real data) ─────────
    const sampleValues = buildSampleBindingValues();

    // ── Map layout JSON → ExecutiveLedgerDocument ────────────────────────────
    const { document, warnings } = mapRawZonesToExecutiveLedgerDocument({
      templateName: template.template_name,
      templateType: template.template_type,
      headerLayoutRaw: canEdit&&Object.hasOwn(input,'headerLayoutJson')?headerLayoutJson:template.header_layout_json,
      bodyLayoutRaw: canEdit&&Object.hasOwn(input,'bodyLayoutJson')?bodyLayoutJson:template.body_layout_json,
      footerLayoutRaw: canEdit&&Object.hasOwn(input,'footerLayoutJson')?footerLayoutJson:template.footer_layout_json,
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
  } catch {
    return {
      ok: false,
      error: "The preview could not be generated. Retry or ask an authorized template manager to check the selected branding.",
    };
  }
}
