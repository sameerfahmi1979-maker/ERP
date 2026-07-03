"use server";

/**
 * Global ERP Report Center — Template & Branding Profile Server Actions
 * Phase: REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Full CRUD for erp_report_templates and erp_report_branding_profiles.
 * All write actions require reports.manage permission.
 * All read actions require reports.view or reports.manage.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import type { ReportTemplate, ReportBrandingProfile } from "@/lib/report-center/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { resolveReportBrandingProfileAssetUrls } from "@/lib/branding/resolve-report-branding-assets";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Projection type for the template selection dialog
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportTemplateForSelection {
  id: number;
  template_code: string;
  template_name: string;
  template_type: string;
  is_default: boolean;
  governance_status: string;
  branding_profile_id: number | null;
  branding_profile_name: string | null;
  branding_profile_type: string | null;
  company_name: string | null;
  logo_url: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const updateTemplateSchema = z.object({
  id: z.number().int().positive(),
  template_name: z.string().min(2).max(200),
  template_type: z.string(),
  default_orientation: z.enum(["portrait", "landscape"]).optional(),
  page_size: z.enum(["a4", "letter", "legal"]).optional(),
  font_family: z.string().max(100).optional(),
  language_mode: z.enum(["en", "ar", "bilingual"]).optional(),
  show_logo: z.boolean().optional(),
  show_small_logo: z.boolean().optional(),
  show_address: z.boolean().optional(),
  show_trn: z.boolean().optional(),
  show_license: z.boolean().optional(),
  show_signatory: z.boolean().optional(),
  show_stamp: z.boolean().optional(),
  show_watermark: z.boolean().optional(),
  watermark_text: z.string().max(100).nullable().optional(),
  body_html_en: z.string().nullable().optional(),
  body_html_ar: z.string().nullable().optional(),
  custom_css: z.string().nullable().optional(),
  branding_profile_id: z.number().int().positive().nullable().optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const createTemplateSchema = updateTemplateSchema.omit({ id: true }).extend({
  template_code: z.string().min(2).max(100).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE"),
  template_name: z.string().min(2).max(200),
  template_type: z.string(),
});

const updateBrandingProfileSchema = z.object({
  id: z.number().int().positive(),
  profile_name: z.string().min(2).max(200),
  profile_type: z.enum(["company", "group", "neutral", "custom"]).optional(),
  owner_company_id: z.number().int().positive().nullable().optional(),
  logo_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  small_logo_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  stamp_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  signature_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  watermark_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  watermark_text: z.string().max(100).nullable().optional(),
  theme_primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  theme_secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  theme_header_bg_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  theme_header_text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color").optional(),
  legal_name_en: z.string().max(300).nullable().optional(),
  legal_name_ar: z.string().max(300).nullable().optional(),
  trade_name_en: z.string().max(300).nullable().optional(),
  trade_name_ar: z.string().max(300).nullable().optional(),
  address_block_en: z.string().max(500).nullable().optional(),
  address_block_ar: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
  website: z.string().max(200).nullable().optional(),
  po_box: z.string().max(50).nullable().optional(),
  trn: z.string().max(50).nullable().optional(),
  trade_license_no: z.string().max(100).nullable().optional(),
  footer_text_en: z.string().max(500).nullable().optional(),
  footer_text_ar: z.string().max(500).nullable().optional(),
  signatory_name: z.string().max(200).nullable().optional(),
  signatory_title_en: z.string().max(200).nullable().optional(),
  signatory_title_ar: z.string().max(200).nullable().optional(),
  is_default_for_company: z.boolean().optional(),
  is_group_profile: z.boolean().optional(),
  is_neutral_profile: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const createBrandingProfileSchema = updateBrandingProfileSchema.omit({ id: true }).extend({
  profile_code: z.string().min(2).max(100).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE"),
  profile_name: z.string().min(2).max(200),
});

// ─────────────────────────────────────────────────────────────────────────────
// Template read actions
// ─────────────────────────────────────────────────────────────────────────────

export async function listReportTemplates(): Promise<ActionResult<ReportTemplate[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view report templates." };
    }
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .select("*")
      .is("deleted_at", null)
      .order("template_name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ReportTemplate[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getReportTemplate(id: number): Promise<ActionResult<ReportTemplate>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view report templates." };
    }
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ReportTemplate };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * List templates for the ReportTemplateSelectDialog.
 * Returns a slim projection joined with branding profile and owner company info.
 */
export async function listReportTemplatesForSelection(input?: {
  ownerCompanyIds?: number[];
  issuableOnly?: boolean;
}): Promise<ActionResult<ReportTemplateForSelection[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission." };
    }
    const db = createAdminClient();

    let q = db
      .from("erp_report_templates")
      .select(`
        id,
        template_code,
        template_name,
        template_type,
        is_default,
        governance_status,
        branding_profile_id,
        branding_profile:erp_report_branding_profiles (
          id,
          profile_name,
          profile_type,
          logo_url,
          owner_company_id,
          is_group_profile,
          is_neutral_profile,
          owner_company:owner_companies ( legal_name_en )
        )
      `)
      .eq("is_active", true)
      .is("deleted_at", null);

    // BRANDING.8: filter to approved/published only when issuable=true
    if (input?.issuableOnly) {
      q = q.in("governance_status", ["approved", "published"]);
    }

    const { data, error } = await q
      .order("is_default", { ascending: false })
      .order("template_name");

    if (error) return { success: false, error: error.message };

    const rows: ReportTemplateForSelection[] = (data ?? []).map((row: any) => ({
      id: row.id,
      template_code: row.template_code,
      template_name: row.template_name,
      template_type: row.template_type,
      is_default: row.is_default,
      governance_status: row.governance_status ?? "draft",
      branding_profile_id: row.branding_profile_id ?? null,
      branding_profile_name: row.branding_profile?.profile_name ?? null,
      branding_profile_type: row.branding_profile?.profile_type ?? null,
      company_name: row.branding_profile?.owner_company?.legal_name_en ?? null,
      logo_url: row.branding_profile?.logo_url ?? null,
    }));

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template write actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createReportTemplate(
  input: z.infer<typeof createTemplateSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage report templates." };
    }
    const parsed = createTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: data.id,
      entity_reference: parsed.data.template_code,
      action: "create",
      new_values: parsed.data,
    });
    revalidatePath("/admin/reports");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateReportTemplate(
  input: z.infer<typeof updateTemplateSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage report templates." };
    }
    const parsed = updateTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { id, ...rest } = parsed.data;
    const db = createAdminClient();

    // BRANDING.8 guard: block in-place edits of approved/published templates
    const { data: existing } = await db
      .from("erp_report_templates")
      .select("governance_status, template_code")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (
      existing?.governance_status === "approved" ||
      existing?.governance_status === "published"
    ) {
      return {
        success: false,
        error: `Template "${existing.template_code}" is ${existing.governance_status} and cannot be edited directly. Use "Create New Version" to make a new draft with your changes.`,
      };
    }

    const { error } = await db
      .from("erp_report_templates")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_templates",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
      new_values: rest,
    });
    revalidatePath("/admin/reports");
    revalidatePath(`/admin/reports/templates/${id}`);
    return { success: true, data: { id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding profile read actions
// ─────────────────────────────────────────────────────────────────────────────

export async function listBrandingProfiles(): Promise<ActionResult<ReportBrandingProfile[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission to view branding profiles." };
    }
    const db = createAdminClient();

    const [profilesResult, assetsResult] = await Promise.all([
      db
        .from("erp_report_branding_profiles")
        .select("*")
        .is("deleted_at", null)
        .order("profile_name"),
      db
        .from("erp_branding_assets")
        .select("branding_profile_id, asset_type")
        .eq("asset_scope", "report")
        .eq("is_active", true)
        .is("deleted_at", null),
    ]);

    if (profilesResult.error) return { success: false, error: profilesResult.error.message };

    // Build per-profile asset presence map
    const assetMap = new Map<number, Set<string>>();
    for (const a of assetsResult.data ?? []) {
      if (a.branding_profile_id == null) continue;
      let types = assetMap.get(a.branding_profile_id);
      if (!types) { types = new Set(); assetMap.set(a.branding_profile_id, types); }
      types.add(a.asset_type);
    }

    const enriched = (profilesResult.data ?? []).map((p) => {
      const types = assetMap.get(p.id);
      return {
        ...(p as ReportBrandingProfile),
        has_report_logo: types?.has("report_logo") || !!p.logo_url,
        has_small_logo: types?.has("report_logo_small") || !!p.small_logo_url,
        has_stamp: types?.has("stamp") || !!p.stamp_url,
        has_signature: types?.has("signature") || !!p.signature_url,
      } as ReportBrandingProfile;
    });

    return { success: true, data: enriched };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getBrandingProfile(id: number): Promise<ActionResult<ReportBrandingProfile>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission." };
    }
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_branding_profiles")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ReportBrandingProfile };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding profile write actions
// ─────────────────────────────────────────────────────────────────────────────

export async function createBrandingProfile(
  input: z.infer<typeof createBrandingProfileSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage branding profiles." };
    }
    const parsed = createBrandingProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_branding_profiles")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_branding_profiles",
      entity_id: data.id,
      entity_reference: parsed.data.profile_code,
      action: "create",
      new_values: parsed.data,
    });
    revalidatePath("/admin/reports");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBrandingProfile(
  input: z.infer<typeof updateBrandingProfileSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "You do not have permission to manage branding profiles." };
    }
    const parsed = updateBrandingProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { id, ...rest } = parsed.data;
    const db = createAdminClient();
    const { error } = await db
      .from("erp_report_branding_profiles")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "reports",
      entity_name: "erp_report_branding_profiles",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
      new_values: rest,
    });
    revalidatePath("/admin/reports");
    revalidatePath(`/admin/reports/templates`);
    return { success: true, data: { id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template preview resolution (for UI preview panels)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a template into a client-safe ExportBrandingContext for preview/output.
 * Reports code is optional — passed for display purposes only.
 */
export async function resolveTemplatePreview(input: {
  templateId: number;
  reportCode?: string;
}): Promise<ActionResult<ExportBrandingContext>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.view")) {
      return { success: false, error: "You do not have permission." };
    }
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .select(`
        *,
        branding_profile:erp_report_branding_profiles (*)
      `)
      .eq("id", input.templateId)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };

    const tpl = data as ReportTemplate & { branding_profile: ReportBrandingProfile | null };
    const bp = tpl.branding_profile;

    const assetUrls =
      bp?.id != null
        ? await resolveReportBrandingProfileAssetUrls(bp.id, ctx)
        : {};

    const canSign = hasPermission(ctx, "reports.sign");

    const resolved: ExportBrandingContext = {
      companyNameEn: bp?.legal_name_en ?? bp?.trade_name_en ?? null,
      companyNameAr: bp?.legal_name_ar ?? bp?.trade_name_ar ?? null,
      // Logo — prefer erp_branding_assets, fall back to legacy column
      logoUrl: tpl.show_logo
        ? (assetUrls.report_logo ?? bp?.logo_url ?? null)
        : null,
      // Small logo — prefer asset, fall back to legacy
      smallLogoUrl: tpl.show_small_logo
        ? (assetUrls.report_logo_small ?? bp?.small_logo_url ?? null)
        : null,
      // Stamp — only resolve when template shows stamp AND caller has reports.sign
      stampUrl:
        tpl.show_stamp && canSign
          ? (assetUrls.stamp ?? bp?.stamp_url ?? null)
          : null,
      // Signature — only resolve when template shows signatory AND caller has reports.sign
      signatureUrl:
        tpl.show_signatory && canSign
          ? (assetUrls.signature ?? bp?.signature_url ?? null)
          : null,
      // Watermark image — prefer asset, fall back to legacy
      watermarkUrl: tpl.show_watermark
        ? (assetUrls.watermark ?? bp?.watermark_url ?? null)
        : null,
      // Letterhead background — only from new asset system
      letterheadBackgroundUrl: assetUrls.letterhead_background ?? null,
      addressBlockEn: bp?.address_block_en ?? null,
      phone: bp?.phone ?? null,
      email: bp?.email ?? null,
      website: bp?.website ?? null,
      trn: bp?.trn ?? null,
      tradeLicenseNo: bp?.trade_license_no ?? null,
      footerTextEn: bp?.footer_text_en ?? null,
      signatoryName: bp?.signatory_name ?? null,
      signatoryTitleEn: bp?.signatory_title_en ?? null,
      themePrimaryColor: bp?.theme_primary_color ?? null,
      themeHeaderBgColor: bp?.theme_header_bg_color ?? null,
      themeHeaderTextColor: bp?.theme_header_text_color ?? null,
      showLogo: tpl.show_logo,
      showAddress: tpl.show_address,
      showTrn: tpl.show_trn,
      showLicense: tpl.show_license,
      showSignatory: tpl.show_signatory,
      showStamp: tpl.show_stamp,
      showWatermark: tpl.show_watermark,
      watermarkText: tpl.watermark_text ?? bp?.watermark_text ?? null,
      reportCode: input.reportCode ?? null,
      templateName: tpl.template_name,
      isGroupProfile: bp?.is_group_profile ?? false,
      isNeutralProfile: bp?.is_neutral_profile ?? false,
      templateOrientation: tpl.default_orientation,
    };

    return { success: true, data: resolved };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-to-server resolver (for scheduled reports and background jobs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve ExportBrandingContext for a template, given a caller's permission codes.
 * Used by the schedule runner and other server-side paths that don't have a full
 * AuthContext (request cookie session) available.
 *
 * Accepts permissionCodes directly so scheduled jobs can pass the creator's
 * effective permissions.
 */
export async function resolveTemplateForExport(input: {
  templateId: number;
  reportCode?: string;
  permissionCodes: string[];
}): Promise<ExportBrandingContext | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("erp_report_templates")
      .select(`*, branding_profile:erp_report_branding_profiles (*)`)
      .eq("id", input.templateId)
      .is("deleted_at", null)
      .single();

    if (error || !data) return null;

    const tpl = data as ReportTemplate & { branding_profile: ReportBrandingProfile | null };
    const bp = tpl.branding_profile;

    const canSign = input.permissionCodes.includes("reports.sign");

    const assetUrls =
      bp?.id != null
        ? await resolveReportBrandingProfileAssetUrls(bp.id, {
            profile: null,
            email: null,
            roleCodes: [],
            permissionCodes: input.permissionCodes,
            accountStatus: "active",
            isAccountActive: true,
          } as import("@/lib/rbac/check").AuthContext)
        : {};

    return {
      companyNameEn: bp?.legal_name_en ?? bp?.trade_name_en ?? null,
      companyNameAr: bp?.legal_name_ar ?? bp?.trade_name_ar ?? null,
      logoUrl: tpl.show_logo ? (assetUrls.report_logo ?? bp?.logo_url ?? null) : null,
      smallLogoUrl: tpl.show_small_logo ? (assetUrls.report_logo_small ?? bp?.small_logo_url ?? null) : null,
      stampUrl: tpl.show_stamp && canSign ? (assetUrls.stamp ?? bp?.stamp_url ?? null) : null,
      signatureUrl: tpl.show_signatory && canSign ? (assetUrls.signature ?? bp?.signature_url ?? null) : null,
      watermarkUrl: tpl.show_watermark ? (assetUrls.watermark ?? bp?.watermark_url ?? null) : null,
      letterheadBackgroundUrl: assetUrls.letterhead_background ?? null,
      addressBlockEn: bp?.address_block_en ?? null,
      phone: bp?.phone ?? null,
      email: bp?.email ?? null,
      website: bp?.website ?? null,
      trn: bp?.trn ?? null,
      tradeLicenseNo: bp?.trade_license_no ?? null,
      footerTextEn: bp?.footer_text_en ?? null,
      signatoryName: bp?.signatory_name ?? null,
      signatoryTitleEn: bp?.signatory_title_en ?? null,
      themePrimaryColor: bp?.theme_primary_color ?? null,
      themeHeaderBgColor: bp?.theme_header_bg_color ?? null,
      themeHeaderTextColor: bp?.theme_header_text_color ?? null,
      showLogo: tpl.show_logo,
      showAddress: tpl.show_address,
      showTrn: tpl.show_trn,
      showLicense: tpl.show_license,
      showSignatory: tpl.show_signatory,
      showStamp: tpl.show_stamp,
      showWatermark: tpl.show_watermark,
      watermarkText: tpl.watermark_text ?? bp?.watermark_text ?? null,
      reportCode: input.reportCode ?? null,
      templateName: tpl.template_name,
      isGroupProfile: bp?.is_group_profile ?? false,
      isNeutralProfile: bp?.is_neutral_profile ?? false,
      templateOrientation: tpl.default_orientation,
    };
  } catch {
    return null;
  }
}
