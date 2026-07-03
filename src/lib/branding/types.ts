/**
 * ERP Branding — Type Definitions
 * Phase: BRANDING.1 — Unified Branding Assets and Storage Foundation
 */

export type BrandingAssetScope = "app" | "report";

export type AppBrandingAssetType =
  | "app_logo"
  | "app_logo_small"
  | "favicon"
  | "login_background"
  | "pwa_icon_192"
  | "pwa_icon_512";

export type ReportBrandingAssetType =
  | "report_logo"
  | "report_logo_small"
  | "stamp"
  | "signature"
  | "watermark"
  | "letterhead_background";

export type BrandingAssetType = AppBrandingAssetType | ReportBrandingAssetType;

export interface AppBrandingSettings {
  id: number;
  settings_code: string;
  app_name: string;
  app_short_name: string | null;
  tagline: string | null;
  support_email: string | null;
  support_phone: string | null;
  footer_text: string | null;
  theme_primary_color: string | null;
  theme_secondary_color: string | null;
  theme_accent_color: string | null;
  login_title: string | null;
  login_subtitle: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
}

export interface BrandingAsset {
  id: number;
  asset_scope: BrandingAssetScope;
  app_settings_id: number | null;
  branding_profile_id: number | null;
  owner_company_id: number | null;
  asset_type: BrandingAssetType;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  width_px: number | null;
  height_px: number | null;
  version_no: number;
  is_active: boolean;
  replaced_by_asset_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
}

export interface BrandingAssetListFilters {
  assetScope: BrandingAssetScope;
  appSettingsId?: number;
  brandingProfileId?: number;
  assetType?: BrandingAssetType;
  activeOnly?: boolean;
}

export interface UploadBrandingAssetInput {
  assetScope: BrandingAssetScope;
  assetType: BrandingAssetType;
  appSettingsId?: number;
  brandingProfileId?: number;
  ownerCompanyId?: number | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx?: number | null;
  heightPx?: number | null;
}
