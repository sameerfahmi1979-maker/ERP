/**
 * ERP Branding — Resolve report-scoped asset signed URLs
 * Server-side only.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/rbac/check";
import {
  BRANDING_SIGNED_URL_TTL_SECONDS,
  BRANDING_STORAGE_BUCKET,
} from "./constants";
import { canAccessBrandingAssetUrl } from "./asset-permissions";
import type { BrandingAsset, ReportBrandingAssetType } from "./types";

export type ReportBrandingAssetUrlMap = Partial<
  Record<ReportBrandingAssetType, string>
>;

async function signedUrlForAsset(
  asset: Pick<BrandingAsset, "storage_bucket" | "storage_path">
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from((asset.storage_bucket as string) || BRANDING_STORAGE_BUCKET)
    .createSignedUrl(
      asset.storage_path as string,
      BRANDING_SIGNED_URL_TTL_SECONDS
    );

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Load active report branding assets for a profile and return signed URLs.
 * When ctx is provided, stamp/signature are omitted unless caller has reports.sign.
 */
export async function resolveReportBrandingProfileAssetUrls(
  brandingProfileId: number,
  ctx?: AuthContext | null
): Promise<ReportBrandingAssetUrlMap> {
  const admin = createAdminClient();
  const { data: assets, error } = await admin
    .from("erp_branding_assets")
    .select("*")
    .eq("asset_scope", "report")
    .eq("branding_profile_id", brandingProfileId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error || !assets?.length) return {};

  const urls: ReportBrandingAssetUrlMap = {};

  for (const row of assets) {
    const asset = row as BrandingAsset;
    if (ctx && !canAccessBrandingAssetUrl(ctx, asset)) continue;

    const signedUrl = await signedUrlForAsset(asset);
    if (signedUrl) {
      urls[asset.asset_type as ReportBrandingAssetType] = signedUrl;
    }
  }

  return urls;
}
