import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContextForProfileId, hasPermission, hasPermissionInScope, hasGlobalPermission } from "@/lib/rbac/check";
import type { ReportTemplate, ReportBrandingProfile } from "@/lib/report-center/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { resolveReportBrandingProfileAssetUrls } from "@/lib/branding/resolve-report-branding-assets";

// Trusted server callers supply a principal ID, never caller-provided permission claims.
export async function resolveTemplateForExport(input: {
  templateId: number;
  reportCode?: string;
  principalId: number;
}): Promise<ExportBrandingContext | null> {
  try {
    const principal = await getAuthContextForProfileId(input.principalId);
    if (!hasPermission(principal, "reports.view") && !hasPermission(principal, "reports.manage")) return null;
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

    const companyId = bp?.owner_company_id;
    const scoped = (permission: string) => companyId != null
      ? hasPermissionInScope(principal, permission, companyId)
      : hasGlobalPermission(principal, permission);
    if (!scoped("reports.view") && !scoped("reports.manage")) return null;
    const canSign = scoped("reports.sign");

    const assetUrls =
      bp?.id != null
        ? await resolveReportBrandingProfileAssetUrls(bp.id, principal)
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
