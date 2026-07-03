/**
 * ERP Branding — Public asset URL helper (no signed Supabase URLs in HTML)
 * Phase: BRANDING.2
 */

import type { AppBrandingAssetType } from "./types";

export function getPublicAppAssetUrl(
  assetType: AppBrandingAssetType,
  versionNo?: number
): string {
  const base = `/api/branding/public/${assetType}`;
  if (versionNo && versionNo > 0) {
    return `${base}?v=${versionNo}`;
  }
  return base;
}
