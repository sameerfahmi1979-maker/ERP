/**
 * ERP Branding — Storage path helpers
 * Phase: BRANDING.1
 */

import { ALLOWED_BRANDING_MIME_TYPES, BRANDING_STORAGE_BUCKET, assetTypeMatchesScope, mimeTypeToExtension } from "./constants";
import type { BrandingAsset, BrandingAssetScope, BrandingAssetType } from "./types";

export function buildBrandingStoragePath(params: {
  assetScope: BrandingAssetScope;
  assetType: BrandingAssetType;
  versionNo: number;
  mimeType: string;
  appSettingsId?: number | null;
  ownerCompanyId?: number | null;
  brandingProfileId?: number | null;
}): string {
  const ext = mimeTypeToExtension(params.mimeType);

  if (params.assetScope === "app") {
    const settingsId = params.appSettingsId ?? 0;
    return `app/settings-${settingsId}/${params.assetType}/v${params.versionNo}.${ext}`;
  }

  const companyId = params.ownerCompanyId ?? 0;
  const profileId = params.brandingProfileId ?? 0;
  return `report/company-${companyId}/profile-${profileId}/${params.assetType}/v${params.versionNo}.${ext}`;
}

export function isBrandingStoragePathSensitive(storagePath: string): boolean {
  return storagePath.includes("/stamp/") || storagePath.includes("/signature/");
}

/** Persisted metadata is not authority to sign an arbitrary storage object. */
export function hasCanonicalBrandingStorageIdentity(asset: Pick<BrandingAsset,
  "asset_scope" | "asset_type" | "app_settings_id" | "branding_profile_id" | "owner_company_id" |
  "version_no" | "mime_type" | "storage_bucket" | "storage_path"
>): boolean {
  const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
  if (asset.storage_bucket !== BRANDING_STORAGE_BUCKET || !positiveId(asset.version_no) ||
      !["app", "report"].includes(asset.asset_scope) || !assetTypeMatchesScope(asset.asset_scope, asset.asset_type) ||
      !(ALLOWED_BRANDING_MIME_TYPES as readonly string[]).includes(asset.mime_type)) return false;
  if (asset.asset_scope === "app") {
    if (!positiveId(asset.app_settings_id) || asset.branding_profile_id !== null || asset.owner_company_id !== null) return false;
  } else if (!positiveId(asset.branding_profile_id) || asset.app_settings_id !== null ||
      (asset.owner_company_id !== null && !positiveId(asset.owner_company_id))) return false;
  return asset.storage_path === buildBrandingStoragePath({
    assetScope: asset.asset_scope, assetType: asset.asset_type, versionNo: asset.version_no,
    mimeType: asset.mime_type, appSettingsId: asset.app_settings_id,
    ownerCompanyId: asset.owner_company_id, brandingProfileId: asset.branding_profile_id,
  });
}
