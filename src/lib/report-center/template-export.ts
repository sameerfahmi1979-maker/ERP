import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContextForProfileId, hasPermission, hasPermissionInScope, hasGlobalPermission } from "@/lib/rbac/check";
import type { ReportTemplate, ReportBrandingProfile } from "@/lib/report-center/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { resolveReportBrandingProfileAssetUrls, resolveReportBrandingProfileAssets } from "@/lib/branding/resolve-report-branding-assets";
import { requireBrandingRevision } from "@/lib/branding/issuance-provenance";
import type { IssuedBrandingProvenance, ReportBrandingAssetType } from "@/lib/branding/types";

// Trusted server callers supply a principal ID, never caller-provided permission claims.
export async function resolveTemplateForExport(input: {
  templateId: number;
  reportCode?: string;
  principalId: number;
  /** Official issuance requires exact historical identity; ordinary exports retain their contract. */
  forIssuance?: boolean;
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

    let provenance: IssuedBrandingProvenance | undefined;
    let assetUrls;
    if (input.forIssuance) {
      if (!tpl.is_active || !bp?.is_active || bp.id !== tpl.branding_profile_id ||
          !Number.isSafeInteger(tpl.version_no) || tpl.version_no < 1) return null;
      const templateRevision = requireBrandingRevision(tpl.workspace_revision);
      const brandingRevision = requireBrandingRevision(bp.workspace_revision);
      const visible: Record<ReportBrandingAssetType, boolean> = {
        report_logo: tpl.show_logo, report_logo_small: tpl.show_small_logo,
        stamp: tpl.show_stamp && canSign, signature: tpl.show_signatory && canSign,
        watermark: tpl.show_watermark, letterhead_background: true,
      };
      const selected = await resolveReportBrandingProfileAssets(bp.id, principal, brandingRevision,
        (Object.keys(visible) as ReportBrandingAssetType[]).filter(type => visible[type]));
      assetUrls = selected.urls;
      // Legacy mutable URLs have no governed version; don't invent provenance.
      for (const [type, url] of Object.entries({report_logo:bp.logo_url,report_logo_small:bp.small_logo_url,stamp:bp.stamp_url,signature:bp.signature_url,watermark:bp.watermark_url})) {
        if (visible[type as ReportBrandingAssetType] && url && !assetUrls[type as ReportBrandingAssetType]) return null;
      }
      const current = await db.from("erp_report_templates").select("id,workspace_revision,is_active,branding_profile_id")
        .eq("id",tpl.id).is("deleted_at",null).maybeSingle();
      if (current.error || !current.data?.is_active || current.data.branding_profile_id !== bp.id ||
          requireBrandingRevision(current.data.workspace_revision) !== templateRevision) return null;
      const fresh = await getAuthContextForProfileId(input.principalId);
      const allowed = (permission:string) => companyId != null ? hasPermissionInScope(fresh,permission,companyId) : hasGlobalPermission(fresh,permission);
      if ((!allowed("reports.view") && !allowed("reports.manage")) ||
          (selected.assets.some(a => visible[a.asset_type as ReportBrandingAssetType] && ["stamp","signature"].includes(a.asset_type)) && !allowed("reports.sign"))) return null;
      provenance = {
        schemaVersion:1,templateId:tpl.id,templateRevision,templateVersion:tpl.version_no,
        brandingProfileId:bp.id,brandingRevision,ownerCompanyId:bp.owner_company_id,
        assets:selected.assets.filter(a=>visible[a.asset_type as ReportBrandingAssetType]).map(a=>({
          id:a.id,type:a.asset_type as ReportBrandingAssetType,version:a.version_no,revision:requireBrandingRevision(a.workspace_revision),
        })).sort((a,b)=>a.id-b.id),
      };
    } else {
      assetUrls = bp?.id != null ? await resolveReportBrandingProfileAssetUrls(bp.id, principal) : {};
    }

    return {
      ...(provenance ? { provenance } : {}),
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
