/**
 * ERP Branding — Runtime context types (client-safe)
 * Phase: BRANDING.2
 */

import type { AppBrandingAssetType } from "./types";

/** Serializable app branding consumed by login, sidebar, and layout */
export interface RuntimeAppBranding {
  settingsId: number;
  appName: string;
  appShortName: string;
  tagline: string | null;
  loginTitle: string | null;
  loginSubtitle: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  footerText: string | null;
  themePrimaryColor: string | null;
  themeSecondaryColor: string | null;
  themeAccentColor: string | null;
  /** Fallback initials when no logo image (max 2 chars) */
  initials: string;
  /** Expanded sidebar title line 1 */
  sidebarTitle: string;
  /** Expanded sidebar title line 2 */
  sidebarSubtitle: string | null;
  assets: Partial<Record<AppBrandingAssetType, RuntimeAppBrandingAsset>>;
}

export interface RuntimeAppBrandingAsset {
  id: number;
  assetType: AppBrandingAssetType;
  publicUrl: string;
  originalFilename: string | null;
  mimeType: string;
  fileSizeBytes: number | null;
  versionNo: number;
  updatedAt: string;
}

export const PUBLIC_APP_ASSET_TYPES: readonly AppBrandingAssetType[] = [
  "app_logo",
  "app_logo_small",
  "favicon",
  "login_background",
  "pwa_icon_192",
  "pwa_icon_512",
] as const;

export function isPublicAppAssetType(type: string): type is AppBrandingAssetType {
  return (PUBLIC_APP_ASSET_TYPES as readonly string[]).includes(type);
}
