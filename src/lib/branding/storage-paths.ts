/**
 * ERP Branding — Storage path helpers
 * Phase: BRANDING.1
 */

import { mimeTypeToExtension } from "./constants";
import type { BrandingAssetScope, BrandingAssetType } from "./types";

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
