/** Server-only resolution. Business-record authorization remains the caller's duty. */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/rbac/check";
import { BRANDING_SIGNED_URL_TTL_SECONDS, BRANDING_STORAGE_BUCKET } from "./constants";
import { canAccessBrandingAssetUrl, canViewReportBrandingAssets } from "./asset-permissions";
import { hasCanonicalBrandingStorageIdentity } from "./storage-paths";
import type { BrandingAsset, ReportBrandingAssetType } from "./types";
import { requireBrandingRevision } from "./issuance-provenance";

export type ReportBrandingAssetUrlMap = Partial<Record<ReportBrandingAssetType, string>>;

/** No unsigned fallback, arbitrary bucket, ambiguous version or anonymous principal. */
export async function resolveReportBrandingProfileAssetUrls(
  brandingProfileId: number,
  ctx: AuthContext | null
): Promise<ReportBrandingAssetUrlMap> {
  return (await resolveReportBrandingProfileAssets(brandingProfileId, ctx)).urls;
}

/** Returns identity and URLs from the same validated selection, server-side only. */
export async function resolveReportBrandingProfileAssets(
  brandingProfileId: number,
  ctx: AuthContext | null,
  expectedRevision?: string
): Promise<{ urls: ReportBrandingAssetUrlMap; assets: BrandingAsset[] }> {
  if (!ctx || !Number.isSafeInteger(brandingProfileId) || brandingProfileId < 1) {
    throw new Error("Branding authority is unavailable.");
  }
  const admin = createAdminClient();
  const profile = await admin.from("erp_report_branding_profiles")
    .select("id,owner_company_id,is_active,workspace_revision").eq("id", brandingProfileId).is("deleted_at", null).maybeSingle();
  if (profile.error || !profile.data?.is_active || !canViewReportBrandingAssets(ctx, profile.data.owner_company_id)) {
    throw new Error("The selected branding profile is unavailable or not authorized.");
  }
  if (expectedRevision !== undefined && requireBrandingRevision(profile.data.workspace_revision) !== expectedRevision) {
    throw new Error("Branding changed while resolving its assets.");
  }
  const { data, error } = await admin.from("erp_branding_assets").select("*")
    .eq("asset_scope", "report").eq("branding_profile_id", brandingProfileId)
    .eq("is_active", true).is("deleted_at", null);
  if (error) throw new Error("Branding assets could not be loaded.");
  const assets = (data ?? []) as BrandingAsset[];
  const types = new Set<string>();
  // Validate the entire selection before issuing even one signed capability.
  for (const asset of assets) {
    if (asset.asset_scope !== "report" || asset.branding_profile_id !== brandingProfileId ||
        asset.owner_company_id !== profile.data.owner_company_id || !asset.is_active || asset.deleted_at !== null ||
        !hasCanonicalBrandingStorageIdentity(asset) || types.has(asset.asset_type)) {
      throw new Error("Branding asset ownership or version requires reconciliation.");
    }
    types.add(asset.asset_type);
  }
  const urls: ReportBrandingAssetUrlMap = {};
  const permitted: BrandingAsset[] = [];
  for (const asset of assets) {
    if (!canAccessBrandingAssetUrl(ctx, asset)) continue;
    if (expectedRevision !== undefined) requireBrandingRevision(asset.workspace_revision);
    try {
      const signed = await admin.storage.from(BRANDING_STORAGE_BUCKET)
        .createSignedUrl(asset.storage_path, BRANDING_SIGNED_URL_TTL_SECONDS);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Unavailable");
      urls[asset.asset_type as ReportBrandingAssetType] = signed.data.signedUrl;
      permitted.push(asset);
    } catch {
      throw new Error("A selected branding asset is unavailable.");
    }
  }
  if (expectedRevision !== undefined) {
    // F06 asset replacement/retirement advances the parent revision. Do not
    // pair old display values with a newly replaced asset set after I/O.
    const current = await admin.from("erp_report_branding_profiles")
      .select("id,owner_company_id,is_active,workspace_revision").eq("id", brandingProfileId).is("deleted_at", null).maybeSingle();
    if (current.error || !current.data?.is_active || current.data.owner_company_id !== profile.data.owner_company_id ||
        requireBrandingRevision(current.data.workspace_revision) !== expectedRevision) {
      throw new Error("Branding changed while resolving its assets.");
    }
  }
  return { urls, assets: permitted };
}
