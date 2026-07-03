/**
 * ERP Branding — Constants
 * Phase: BRANDING.1
 */

import type {
  AppBrandingAssetType,
  BrandingAssetScope,
  BrandingAssetType,
  ReportBrandingAssetType,
} from "./types";

export const BRANDING_STORAGE_BUCKET = "erp-branding-assets";

export const DEFAULT_APP_BRANDING_SETTINGS_CODE = "DEFAULT_APP_BRANDING";

export const APP_BRANDING_ASSET_TYPES: readonly AppBrandingAssetType[] = [
  "app_logo",
  "app_logo_small",
  "favicon",
  "login_background",
  "pwa_icon_192",
  "pwa_icon_512",
] as const;

export const REPORT_BRANDING_ASSET_TYPES: readonly ReportBrandingAssetType[] = [
  "report_logo",
  "report_logo_small",
  "stamp",
  "signature",
  "watermark",
  "letterhead_background",
] as const;

/** Stamp and signature require reports.sign for signed URL access */
export const SENSITIVE_BRANDING_ASSET_TYPES: readonly BrandingAssetType[] = [
  "stamp",
  "signature",
] as const;

export const ALLOWED_BRANDING_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
] as const;

/** App branding uploads — SVG disallowed in BRANDING.2 (XSS risk). Report scope may still accept SVG for soak. */
export const ALLOWED_APP_BRANDING_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
] as const;

export const MAX_BRANDING_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — matches bucket limit

export const BRANDING_SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

export function isAppAssetType(type: BrandingAssetType): type is AppBrandingAssetType {
  return (APP_BRANDING_ASSET_TYPES as readonly string[]).includes(type);
}

export function isReportAssetType(type: BrandingAssetType): type is ReportBrandingAssetType {
  return (REPORT_BRANDING_ASSET_TYPES as readonly string[]).includes(type);
}

export function isSensitiveBrandingAssetType(type: BrandingAssetType): boolean {
  return (SENSITIVE_BRANDING_ASSET_TYPES as readonly string[]).includes(type);
}

export function assetTypeMatchesScope(
  scope: BrandingAssetScope,
  type: BrandingAssetType
): boolean {
  return scope === "app" ? isAppAssetType(type) : isReportAssetType(type);
}

export function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ico";
    default:
      return "bin";
  }
}
