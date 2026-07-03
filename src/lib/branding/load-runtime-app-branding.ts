import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_APP_BRANDING_SETTINGS_CODE } from "./constants";
import type { AppBrandingAssetType, AppBrandingSettings, BrandingAsset } from "./types";
import { getPublicAppAssetUrl } from "./public-asset-url";
import type { RuntimeAppBranding, RuntimeAppBrandingAsset } from "./runtime-types";

const FALLBACK_APP_NAME = "ALGT ERP";
const FALLBACK_SHORT_NAME = "ALGT";
const FALLBACK_INITIALS = "AG";
const FALLBACK_SIDEBAR_TITLE = "Alliance Gulf";
const FALLBACK_SIDEBAR_SUBTITLE = "Transport ERP";

function computeInitials(appName: string, appShortName: string | null): string {
  if (appShortName && appShortName.trim().length >= 1) {
    return appShortName.trim().slice(0, 2).toUpperCase();
  }
  const parts = appName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return appName.trim().slice(0, 2).toUpperCase() || FALLBACK_INITIALS;
}

function splitSidebarTitle(appName: string, tagline: string | null): {
  sidebarTitle: string;
  sidebarSubtitle: string | null;
} {
  if (tagline?.trim()) {
    return { sidebarTitle: appName, sidebarSubtitle: tagline.trim() };
  }
  const parts = appName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return {
      sidebarTitle: parts.slice(0, -1).join(" "),
      sidebarSubtitle: parts[parts.length - 1],
    };
  }
  return { sidebarTitle: appName, sidebarSubtitle: null };
}

function buildFallbackRuntime(): RuntimeAppBranding {
  return {
    settingsId: 0,
    appName: FALLBACK_APP_NAME,
    appShortName: FALLBACK_SHORT_NAME,
    tagline: null,
    loginTitle: null,
    loginSubtitle: null,
    supportEmail: null,
    supportPhone: null,
    footerText: null,
    themePrimaryColor: null,
    themeSecondaryColor: null,
    themeAccentColor: null,
    initials: FALLBACK_INITIALS,
    sidebarTitle: FALLBACK_SIDEBAR_TITLE,
    sidebarSubtitle: FALLBACK_SIDEBAR_SUBTITLE,
    assets: {},
  };
}

/**
 * Load tenant-global app branding for runtime UI (login, sidebar, metadata).
 * Uses admin client — server-only. Cached per request via React cache().
 * Does not require user authentication.
 */
export const loadRuntimeAppBranding = cache(async (): Promise<RuntimeAppBranding> => {
  try {
    const admin = createAdminClient();

    const { data: settingsRow, error: settingsError } = await admin
      .from("erp_app_branding_settings")
      .select("*")
      .eq("settings_code", DEFAULT_APP_BRANDING_SETTINGS_CODE)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (settingsError || !settingsRow) {
      return buildFallbackRuntime();
    }

    const settings = settingsRow as AppBrandingSettings;
    const appName = settings.app_name?.trim() || FALLBACK_APP_NAME;
    const appShortName = settings.app_short_name?.trim() || FALLBACK_SHORT_NAME;
    const { sidebarTitle, sidebarSubtitle } = splitSidebarTitle(
      appName,
      settings.tagline
    );

    const { data: assetRows } = await admin
      .from("erp_branding_assets")
      .select("*")
      .eq("asset_scope", "app")
      .eq("app_settings_id", settings.id)
      .eq("is_active", true)
      .is("deleted_at", null);

    const assets: Partial<Record<AppBrandingAssetType, RuntimeAppBrandingAsset>> =
      {};

    for (const row of (assetRows ?? []) as BrandingAsset[]) {
      const assetType = row.asset_type as AppBrandingAssetType;
      assets[assetType] = {
        id: row.id,
        assetType,
        publicUrl: getPublicAppAssetUrl(assetType, row.version_no),
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        fileSizeBytes: row.file_size_bytes,
        versionNo: row.version_no,
        updatedAt: row.updated_at,
      };
    }

    return {
      settingsId: settings.id,
      appName,
      appShortName,
      tagline: settings.tagline,
      loginTitle: settings.login_title,
      loginSubtitle: settings.login_subtitle,
      supportEmail: settings.support_email,
      supportPhone: settings.support_phone,
      footerText: settings.footer_text,
      themePrimaryColor: settings.theme_primary_color,
      themeSecondaryColor: settings.theme_secondary_color,
      themeAccentColor: settings.theme_accent_color,
      initials: computeInitials(appName, settings.app_short_name),
      sidebarTitle,
      sidebarSubtitle,
      assets,
    };
  } catch {
    return buildFallbackRuntime();
  }
});
