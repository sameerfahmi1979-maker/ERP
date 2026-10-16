/**
 * ERP Branding — Permission helpers for asset access
 * Phase: BRANDING.1
 *
 * Server-side only. Used before generating signed URLs for sensitive assets.
 */

import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission, hasPermissionInScope } from "@/lib/rbac/scope";
import { isSensitiveBrandingAssetType } from "./constants";
import type { BrandingAsset, BrandingAssetScope, BrandingAssetType } from "./types";

export function canViewAppBranding(ctx: AuthContext): boolean {
  return (
    hasGlobalPermission(ctx, "branding.app.view") ||
    hasGlobalPermission(ctx, "branding.app.manage") ||
    hasGlobalPermission(ctx, "reports.manage")
  );
}

export function canManageAppBranding(ctx: AuthContext): boolean {
  return hasGlobalPermission(ctx, "branding.app.manage");
}

export function brandingPermission(ctx:AuthContext,permission:string,companyId:number|null):boolean {
  return companyId===null?hasGlobalPermission(ctx,permission):hasPermissionInScope(ctx,permission,companyId);
}

export function canUploadBrandingAssets(ctx: AuthContext,companyId:number|null=null): boolean {
  return brandingPermission(ctx, "branding.assets.upload",companyId);
}

export function canViewReportBrandingAssets(ctx: AuthContext,companyId:number|null=null): boolean {
  return brandingPermission(ctx, "reports.view",companyId) || brandingPermission(ctx, "reports.manage",companyId);
}

export function canManageReportBrandingAssets(ctx: AuthContext,companyId:number|null=null): boolean {
  return brandingPermission(ctx, "reports.manage",companyId);
}

/** Whether caller may receive a signed URL for this asset type */
export function canAccessBrandingAssetUrl(
  ctx: AuthContext,
  asset: Pick<BrandingAsset, "asset_scope" | "asset_type" | "owner_company_id">
): boolean {
  if (asset.asset_scope === "app") {
    return canViewAppBranding(ctx);
  }

  if (asset.asset_scope!=="report" || asset.owner_company_id===undefined || !canViewReportBrandingAssets(ctx,asset.owner_company_id)) {
    return false;
  }

  if (isSensitiveBrandingAssetType(asset.asset_type)) {
    return brandingPermission(ctx, "reports.sign",asset.owner_company_id);
  }

  return true;
}

export function requiredUploadPermissionForScope(scope: BrandingAssetScope): {
  upload: string;
  manage: string;
} {
  if (scope === "app") {
    return { upload: "branding.assets.upload", manage: "branding.app.manage" };
  }
  return { upload: "branding.assets.upload", manage: "reports.manage" };
}

export function validateScopeAndType(
  scope: BrandingAssetScope,
  type: BrandingAssetType
): string | null {
  const appTypes = [
    "app_logo",
    "app_logo_small",
    "favicon",
    "login_background",
    "pwa_icon_192",
    "pwa_icon_512",
  ];
  const reportTypes = [
    "report_logo",
    "report_logo_small",
    "stamp",
    "signature",
    "watermark",
    "letterhead_background",
  ];

  if (scope === "app" && !appTypes.includes(type)) {
    return `Asset type "${type}" is not valid for app scope`;
  }
  if (scope === "report" && !reportTypes.includes(type)) {
    return `Asset type "${type}" is not valid for report scope`;
  }
  return null;
}
