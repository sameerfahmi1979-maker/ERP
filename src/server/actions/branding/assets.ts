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
import { logAudit } from "@/server/actions/audit";
import {
  ALLOWED_APP_BRANDING_MIME_TYPES,
  ALLOWED_BRANDING_MIME_TYPES,
  BRANDING_SIGNED_URL_TTL_SECONDS,
  BRANDING_STORAGE_BUCKET,
  DEFAULT_APP_BRANDING_SETTINGS_CODE,
  MAX_BRANDING_FILE_SIZE_BYTES,
  buildBrandingStoragePath,
  canAccessBrandingAssetUrl,
  validateScopeAndType,
  type BrandingAsset,
  type BrandingAssetListFilters,
  type BrandingAssetScope,
  type BrandingAssetType,
  type ReportBrandingAssetType,
} from "@/lib/branding";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

function canUploadForScope(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  scope: BrandingAssetScope
): boolean {
  if (!hasPermission(ctx, "branding.assets.upload")) return false;
  if (scope === "app") return hasPermission(ctx, "branding.app.manage");
  return hasPermission(ctx, "reports.manage");
}

function canViewAssetsForScope(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  scope: BrandingAssetScope
): boolean {
  if (scope === "app") {
    return (
      hasPermission(ctx, "branding.app.view") ||
      hasPermission(ctx, "reports.manage")
    );
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

const uploadSchema = z.object({
  assetScope: z.enum(["app", "report"]),
  assetType: z.string(),
  appSettingsId: z.number().int().positive().optional(),
  brandingProfileId: z.number().int().positive().optional(),
  ownerCompanyId: z.number().int().positive().nullable().optional(),
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
    if (error) return { success: false, error: error.message };

    const assets = (data ?? []) as BrandingAsset[];

    // Filter sensitive assets if caller lacks reports.sign
    const filtered = assets.filter((asset) => canAccessBrandingAssetUrl(ctx, asset));

    return { success: true, data: filtered };
  } catch (err) {
    return { success: false, error: String(err) };
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
  return { success: true, data: result.data?.[0] ?? null };
}

export async function uploadBrandingAsset(
  formData: FormData
): Promise<ActionResult<BrandingAsset>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const metaRaw = formData.get("metadata");
    const file = formData.get("file");

    if (!metaRaw || typeof metaRaw !== "string") {
      return { success: false, error: "Missing metadata" };
    }
    if (!(file instanceof File)) {
      return { success: false, error: "Missing file" };
    }

    let meta: z.infer<typeof uploadSchema>;
    try {
      meta = uploadSchema.parse(JSON.parse(metaRaw));
    } catch {
      return { success: false, error: "Invalid metadata JSON" };
    }

    const scopeError = validateScopeAndType(
      meta.assetScope,
      meta.assetType as BrandingAssetType
    );
    if (scopeError) return { success: false, error: scopeError };

    if (!canUploadForScope(ctx, meta.assetScope)) {
      return { success: false, error: "Permission denied" };
    }

    const allowedMimeTypes =
      meta.assetScope === "app"
        ? (ALLOWED_APP_BRANDING_MIME_TYPES as readonly string[])
        : (ALLOWED_BRANDING_MIME_TYPES as readonly string[]);

    if (!allowedMimeTypes.includes(file.type)) {
      const hint =
        meta.assetScope === "app" && file.type === "image/svg+xml"
          ? "SVG uploads are not allowed for app branding assets."
          : `Unsupported file type: ${file.type || "unknown"}`;
      return { success: false, error: hint };
    }

    if (file.size > MAX_BRANDING_FILE_SIZE_BYTES) {
      return { success: false, error: "File exceeds maximum size of 10 MB" };
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    let appSettingsId = meta.appSettingsId ?? null;
    let brandingProfileId = meta.brandingProfileId ?? null;
    let ownerCompanyId = meta.ownerCompanyId ?? null;

    if (meta.assetScope === "app") {
      if (!appSettingsId) {
        const { data: settings } = await supabase
          .from("erp_app_branding_settings")
          .select("id")
          .eq("settings_code", DEFAULT_APP_BRANDING_SETTINGS_CODE)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle();
        if (!settings) {
          return { success: false, error: "Active app branding settings not found" };
        }
        appSettingsId = settings.id as number;
      }
    } else {
      if (!brandingProfileId) {
        return { success: false, error: "brandingProfileId is required for report assets" };
      }

      const { data: profile } = await supabase
        .from("erp_report_branding_profiles")
        .select("id, owner_company_id")
        .eq("id", brandingProfileId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!profile) {
        return { success: false, error: "Branding profile not found" };
      }

      ownerCompanyId = (profile.owner_company_id as number | null) ?? ownerCompanyId;
    }

    const { data: existingActive } = await supabase
      .from("erp_branding_assets")
      .select("id, version_no")
      .eq("asset_scope", meta.assetScope)
      .eq("asset_type", meta.assetType)
      .eq("is_active", true)
      .is("deleted_at", null)
      .match(
        meta.assetScope === "app"
          ? { app_settings_id: appSettingsId }
          : { branding_profile_id: brandingProfileId }
      )
      .maybeSingle();

    const nextVersion = existingActive
      ? ((existingActive.version_no as number) ?? 0) + 1
      : 1;

    const storagePath = buildBrandingStoragePath({
      assetScope: meta.assetScope,
      assetType: meta.assetType as BrandingAssetType,
      versionNo: nextVersion,
      mimeType: file.type,
      appSettingsId,
      ownerCompanyId,
      brandingProfileId,
    });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(BRANDING_STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    const now = new Date().toISOString();

    // Deactivate the prior active asset BEFORE insert — partial unique index
    // uq_erp_branding_assets_*_active allows only one is_active=true per type.
    if (existingActive) {
      const { error: deactivateError } = await supabase
        .from("erp_branding_assets")
        .update({
          is_active: false,
          updated_at: now,
          updated_by: ctx.profile.id,
        })
        .eq("id", existingActive.id as number);

      if (deactivateError) {
        await admin.storage.from(BRANDING_STORAGE_BUCKET).remove([storagePath]);
        return { success: false, error: deactivateError.message };
      }
    }

    const insertRow = {
      asset_scope: meta.assetScope,
      app_settings_id: meta.assetScope === "app" ? appSettingsId : null,
      branding_profile_id: meta.assetScope === "report" ? brandingProfileId : null,
      owner_company_id: meta.assetScope === "report" ? ownerCompanyId : null,
      asset_type: meta.assetType,
      storage_bucket: BRANDING_STORAGE_BUCKET,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      version_no: nextVersion,
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: ctx.profile.id,
      updated_by: ctx.profile.id,
    };

    const { data: created, error: insertError } = await supabase
      .from("erp_branding_assets")
      .insert(insertRow)
      .select("*")
      .single();

    if (insertError) {
      await admin.storage.from(BRANDING_STORAGE_BUCKET).remove([storagePath]);
      if (existingActive) {
        await supabase
          .from("erp_branding_assets")
          .update({
            is_active: true,
            updated_at: now,
            updated_by: ctx.profile.id,
          })
          .eq("id", existingActive.id as number);
      }
      return { success: false, error: insertError.message };
    }

    if (existingActive) {
      await supabase
        .from("erp_branding_assets")
        .update({
          replaced_by_asset_id: created.id as number,
          updated_at: now,
          updated_by: ctx.profile.id,
        })
        .eq("id", existingActive.id as number);
    }

    await logAudit({
      module_code: "BRANDING",
      entity_name: "erp_branding_assets",
      entity_id: created.id as number,
      entity_reference: `${meta.assetScope}:${meta.assetType}:v${nextVersion}`,
      action: "upload",
      new_values: {
        asset_scope: meta.assetScope,
        asset_type: meta.assetType,
        storage_path: storagePath,
        version_no: nextVersion,
      },
      owner_company_id: ownerCompanyId,
    });

    return { success: true, data: created as BrandingAsset };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deactivateBrandingAsset(
  assetId: number
): Promise<ActionResult<BrandingAsset>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();
    const { data: asset, error: fetchError } = await supabase
      .from("erp_branding_assets")
      .select("*")
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!asset) return { success: false, error: "Asset not found" };

    if (!canUploadForScope(ctx, asset.asset_scope as BrandingAssetScope)) {
      return { success: false, error: "Permission denied" };
    }

    const { data, error } = await supabase
      .from("erp_branding_assets")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        updated_by: ctx.profile.id,
      })
      .eq("id", assetId)
      .select("*")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "BRANDING",
      entity_name: "erp_branding_assets",
      entity_id: assetId,
      entity_reference: `${asset.asset_scope}:${asset.asset_type}`,
      action: "deactivate",
      old_values: { is_active: true },
      new_values: { is_active: false },
      owner_company_id: (asset.owner_company_id as number | null) ?? null,
    });

    return { success: true, data: data as BrandingAsset };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function softDeleteBrandingAsset(
  assetId: number
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();
    const { data: asset, error: fetchError } = await supabase
      .from("erp_branding_assets")
      .select("*")
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!asset) return { success: false, error: "Asset not found" };

    if (!canUploadForScope(ctx, asset.asset_scope as BrandingAssetScope)) {
      return { success: false, error: "Permission denied" };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_branding_assets")
      .update({
        is_active: false,
        deleted_at: now,
        deleted_by: ctx.profile.id,
        updated_at: now,
        updated_by: ctx.profile.id,
      })
      .eq("id", assetId);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "BRANDING",
      entity_name: "erp_branding_assets",
      entity_id: assetId,
      entity_reference: `${asset.asset_scope}:${asset.asset_type}`,
      action: "soft_delete",
      owner_company_id: (asset.owner_company_id as number | null) ?? null,
    });

    return { success: true, data: { id: assetId } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export type ReportBrandingAssetView = {
  id: number;
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

    for (const asset of listResult.data ?? []) {
      let signedUrl: string | null = null;
      if (canAccessBrandingAssetUrl(ctx, asset)) {
        const { data, error } = await admin.storage
          .from((asset.storage_bucket as string) || BRANDING_STORAGE_BUCKET)
          .createSignedUrl(
            asset.storage_path as string,
            BRANDING_SIGNED_URL_TTL_SECONDS
          );
        if (!error && data?.signedUrl) {
          signedUrl = data.signedUrl;
        }
      }

      views.push({
        id: asset.id,
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
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getBrandingAssetSignedUrl(
  assetId: number
): Promise<ActionResult<{ signedUrl: string; expiresIn: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const supabase = await createClient();
    const { data: asset, error: fetchError } = await supabase
      .from("erp_branding_assets")
      .select("*")
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!asset) return { success: false, error: "Asset not found" };

    if (!canAccessBrandingAssetUrl(ctx, asset as BrandingAsset)) {
      return {
        success: false,
        error: "Permission denied: stamp/signature requires reports.sign",
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from((asset.storage_bucket as string) || BRANDING_STORAGE_BUCKET)
      .createSignedUrl(asset.storage_path as string, BRANDING_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message ?? "Failed to create signed URL" };
    }

    return {
      success: true,
      data: { signedUrl: data.signedUrl, expiresIn: BRANDING_SIGNED_URL_TTL_SECONDS },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
