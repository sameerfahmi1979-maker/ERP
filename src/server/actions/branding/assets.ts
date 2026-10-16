"use server";

/**
 * ERP Branding — Asset Server Actions
 * Phase: BRANDING.1 — Unified Branding Assets and Storage Foundation
 *
 * Upload/replace/deactivate branding assets. No UI wiring in this phase.
 * Uses admin client for storage uploads (consistent with DMS pattern).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { saveBrandingUpload, retireBrandingAsset } from "@/server/branding-asset-save";
import type { BrandingAssetSaveContract, BrandingAssetMutationResult } from "@/lib/branding/asset-save-contract";
import {
  BRANDING_SIGNED_URL_TTL_SECONDS,
  BRANDING_STORAGE_BUCKET,
  canAccessBrandingAssetUrl,
  canViewAppBranding,
  canViewReportBrandingAssets,
  hasCanonicalBrandingStorageIdentity,
  type BrandingAsset,
  type BrandingAssetListFilters,
  type BrandingAssetScope,
  type BrandingAssetType,
  type ReportBrandingAssetType,
} from "@/lib/branding";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

function canViewAssetsForScope(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  scope: BrandingAssetScope
): boolean {
  if (scope === "app") {
    return canViewAppBranding(ctx);
  }
  return hasPermission(ctx, "reports.view") || hasPermission(ctx, "reports.manage");
}

const listFiltersSchema = z.object({
  assetScope: z.enum(["app", "report"]),
  appSettingsId: z.number().int().positive().optional(),
  brandingProfileId: z.number().int().positive().optional(),
  assetType: z.string().optional(),
  activeOnly: z.boolean().optional(),
});

export async function listBrandingAssets(
  filters: BrandingAssetListFilters
): Promise<ActionResult<BrandingAsset[]>> {
  try {
    const parsed = listFiltersSchema.safeParse(filters);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAssetsForScope(ctx, parsed.data.assetScope)) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    if (parsed.data.assetScope === "report") {
      if (!parsed.data.brandingProfileId || parsed.data.appSettingsId) return {success:false,error:"Select a report branding profile."};
      const parent = await supabase.from("erp_report_branding_profiles_safe")
        .select("id,owner_company_id").eq("id",parsed.data.brandingProfileId).maybeSingle();
      if (parent.error) return {success:false,error:"Branding profile could not be loaded."};
      if (!parent.data || !canViewReportBrandingAssets(ctx,parent.data.owner_company_id)) {
        return {success:false,error:"Branding profile is unavailable or not authorized."};
      }
    } else if (parsed.data.brandingProfileId) return {success:false,error:"Select application branding settings."};
    let query = supabase
      .from("erp_branding_assets")
      .select("*")
      .eq("asset_scope", parsed.data.assetScope)
      .is("deleted_at", null)
      .order("version_no", { ascending: false });

    if (parsed.data.appSettingsId) {
      query = query.eq("app_settings_id", parsed.data.appSettingsId);
    }
    if (parsed.data.brandingProfileId) {
      query = query.eq("branding_profile_id", parsed.data.brandingProfileId);
    }
    if (parsed.data.assetType) {
      query = query.eq("asset_type", parsed.data.assetType);
    }
    if (parsed.data.activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: "Branding assets could not be loaded." };

    const assets = (data ?? []) as BrandingAsset[];

    // Filter sensitive assets if caller lacks reports.sign
    const filtered = assets.filter((asset) => canAccessBrandingAssetUrl(ctx, asset));
    if (filtered.some(asset=>!hasCanonicalBrandingStorageIdentity(asset))) {
      return {success:false,error:"Branding asset ownership or version requires reconciliation."};
    }

    return { success: true, data: filtered };
  } catch {
    return { success: false, error: "Branding assets could not be loaded." };
  }
}

export async function getActiveBrandingAsset(params: {
  assetScope: BrandingAssetScope;
  assetType: BrandingAssetType;
  appSettingsId?: number;
  brandingProfileId?: number;
}): Promise<ActionResult<BrandingAsset | null>> {
  const result = await listBrandingAssets({
    assetScope: params.assetScope,
    appSettingsId: params.appSettingsId,
    brandingProfileId: params.brandingProfileId,
    assetType: params.assetType,
    activeOnly: true,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }
  if ((result.data?.length ?? 0) > 1) return {success:false,error:"Conflicting active branding assets require reconciliation."};
  return { success: true, data: result.data?.[0] ?? null };
}

export async function uploadBrandingAsset(formData: FormData): Promise<BrandingAssetMutationResult> {
  return saveBrandingUpload(formData);
}

export async function deactivateBrandingAsset(assetId: number, contract?: BrandingAssetSaveContract): Promise<BrandingAssetMutationResult> {
  return retireBrandingAsset(assetId, "deactivate", contract);
}

export async function softDeleteBrandingAsset(assetId: number, contract?: BrandingAssetSaveContract): Promise<BrandingAssetMutationResult> {
  return retireBrandingAsset(assetId, "retire", contract);
}

export type ReportBrandingAssetView = {
  id: number;
  workspaceRevision: string;
  assetType: ReportBrandingAssetType;
  originalFilename: string | null;
  mimeType: string;
  fileSizeBytes: number | null;
  versionNo: number;
  updatedAt: string;
  signedUrl: string | null;
};

export async function getReportBrandingProfileAssets(
  brandingProfileId: number
): Promise<ActionResult<ReportBrandingAssetView[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAssetsForScope(ctx, "report")) {
      return { success: false, error: "Permission denied" };
    }

    const listResult = await listBrandingAssets({
      assetScope: "report",
      brandingProfileId,
      activeOnly: true,
    });
    if (!listResult.success) {
      return { success: false, error: listResult.error };
    }

    const admin = createAdminClient();
    const views: ReportBrandingAssetView[] = [];
    const types = new Set<string>();
    for (const asset of listResult.data ?? []) {
      if (types.has(asset.asset_type)) return {success:false,error:"Conflicting active branding assets require reconciliation."};
      types.add(asset.asset_type);
    }

    for (const asset of listResult.data ?? []) {
      let signedUrl: string | null = null;
      if (canAccessBrandingAssetUrl(ctx, asset)) {
        const { data, error } = await admin.storage
          .from(BRANDING_STORAGE_BUCKET)
          .createSignedUrl(
            asset.storage_path as string,
            BRANDING_SIGNED_URL_TTL_SECONDS
          );
        if (!error && data?.signedUrl) {
          signedUrl = data.signedUrl;
        } else return {success:false,error:"A selected branding asset is unavailable. Retry before replacing it."};
      }

      views.push({
        id: asset.id,
        workspaceRevision: String(asset.workspace_revision),
        assetType: asset.asset_type as ReportBrandingAssetView["assetType"],
        originalFilename: asset.original_filename,
        mimeType: asset.mime_type,
        fileSizeBytes: asset.file_size_bytes,
        versionNo: asset.version_no,
        updatedAt: asset.updated_at,
        signedUrl,
      });
    }

    return { success: true, data: views };
  } catch {
    return { success: false, error: "Branding assets could not be loaded." };
  }
}

export async function getBrandingAssetSignedUrl(
  assetId: number
): Promise<ActionResult<{ signedUrl: string; expiresIn: number }>> {
  try {
    if (!Number.isSafeInteger(assetId) || assetId < 1) return {success:false,error:"Branding asset is unavailable or not authorized."};
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();
    const { data: asset, error: fetchError } = await supabase
      .from("erp_branding_assets")
      .select("*")
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) return { success: false, error: "Branding asset could not be loaded." };
    if (!asset || !asset.is_active) return { success: false, error: "Branding asset is unavailable or not authorized." };

    if (!canAccessBrandingAssetUrl(ctx, asset as BrandingAsset)) {
      return {
        success: false,
        error: "Branding asset is unavailable or not authorized.",
      };
    }
    if (!hasCanonicalBrandingStorageIdentity(asset as BrandingAsset)) {
      return {success:false,error:"Branding asset ownership or version requires reconciliation."};
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(BRANDING_STORAGE_BUCKET)
      .createSignedUrl(asset.storage_path as string, BRANDING_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return { success: false, error: "A selected branding asset is unavailable." };
    }

    return {
      success: true,
      data: { signedUrl: data.signedUrl, expiresIn: BRANDING_SIGNED_URL_TTL_SECONDS },
    };
  } catch {
    return { success: false, error: "A selected branding asset is unavailable." };
  }
}
