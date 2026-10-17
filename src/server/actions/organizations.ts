"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import {brandingPermission,canViewReportBrandingAssets} from "@/lib/branding/asset-permissions";
import { revalidatePath } from "next/cache";
import {saveAdministrationRecord} from '@/server/administration-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import { ensureReportBrandingForOwnerCompany, syncReportBrandingProfileFromOrganization } from "@/lib/report-center/company-onboarding";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from "@/features/organizations/organization-schema";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
  errorCode?: 'invalid' | 'denied' | 'not_found' | 'unavailable';
};

export async function getOrganizationById(id: number): Promise<ActionResult<import("@/types/domain").OwnerCompany>> {
  if (!Number.isSafeInteger(id) || id < 1) return {success:false,errorCode:'invalid',error:'Invalid organization reference.'};
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.view")) {
      return { success: false, errorCode:'denied', error: "You do not have permission to view organizations" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("owner_companies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return {success:false,errorCode:'unavailable',error:'The organization could not be loaded. Please retry.'};
    if (!data) return { success: false, errorCode:'not_found', error: "Organization not found" };
    if (data.id !== id) return {success:false,errorCode:'unavailable',error:'The organization response could not be verified. Please retry.'};
    return { success: true, data: data as import("@/types/domain").OwnerCompany };
  } catch {
    return { success: false, errorCode:'unavailable', error:'The organization could not be loaded. Please retry.' };
  }
}

/** Atomic record/audit/receipt save; branding remains a separate reported step. */
export async function createOrganization(input: CreateOrganizationInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult & {warning?:string}> {
  const parsed=createOrganizationSchema.safeParse(input);
  if(!parsed.success)return {success:false,error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')};
  const saved=await saveAdministrationRecord('owner_companies',null,parsed.data,contract);
  if(saved.success&&saved.data){
    try{const branding=await ensureReportBrandingForOwnerCompany(saved.data.id);
      if(!branding.success)return {...saved,warning:'Organization saved. Report branding setup requires review in Templates & Branding.'};
    }catch{return {...saved,warning:'Organization saved. Report branding setup requires review in Templates & Branding.'};}
  }
  return saved;
}

export async function updateOrganization(input: UpdateOrganizationInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult & {warning?:string}> {
  const parsed=updateOrganizationSchema.safeParse(input);
  if(!parsed.success)return {success:false,error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')};
  const {id,...data}=parsed.data;
  const saved=await saveAdministrationRecord('owner_companies',id,data,contract);
  if(saved.success&&saved.data?.changed){
    try{const branding=await syncReportBrandingProfileFromOrganization(id);
      if(!branding.success)return {...saved,warning:'Organization saved. Branding enrichment requires review; existing branding was preserved.'};
    }catch{return {...saved,warning:'Organization saved. Branding enrichment requires review; existing branding was preserved.'};}
  }
  return saved;
}

/** Compatibility name: retire without deleting referenced records or history. */
export async function deleteOrganization(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  return saveAdministrationRecord('owner_companies',id,{status:'inactive'},contract);
}

/** Revision-safe, replayable lifecycle change with atomic audit. */
export async function updateOrganizationStatus(id: number, status: 'active'|'inactive'|'suspended', contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if(!['active','inactive','suspended'].includes(status))return {success:false,error:'Choose a valid record status.'};
  return saveAdministrationRecord('owner_companies',id,{status},contract);
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANDING.3 — Organization branding summary
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgBrandingProfileSummary {
  profileId: number;
  profileCode: string;
  profileName: string;
  isDefault: boolean;
  assetStatus: {
    report_logo: boolean;
    report_logo_small: boolean;
    stamp: boolean | null;
    signature: boolean | null;
    watermark: boolean;
    letterhead_background: boolean;
  };
}

/**
 * Load the default report branding profile and asset status for an owner company.
 * Used by the Organization workspace branding section.
 */
export async function getOrganizationBrandingProfile(
  ownerCompanyId: number
): Promise<ActionResult<OrgBrandingProfileSummary | null>> {
  try {
    const ctx = await getAuthContext();
    if (!Number.isSafeInteger(ownerCompanyId) || ownerCompanyId < 1 || !brandingPermission(ctx, "organizations.view", ownerCompanyId) || !canViewReportBrandingAssets(ctx, ownerCompanyId)) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data: profile, error: profileError } = await supabase
      .from("erp_report_branding_profiles_safe")
      .select("id, profile_code, profile_name, is_default_for_company")
      .eq("owner_company_id", ownerCompanyId)
      .eq("is_default_for_company", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (profileError) return { success: false, error: "Company branding could not be loaded. Retry before making changes." };
    if (!profile) return { success: true, data: null };

    const { data: assets, error: assetError } = await supabase
      .from("erp_branding_assets")
      .select("asset_type")
      .eq("asset_scope", "report")
      .eq("branding_profile_id", profile.id)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (assetError) return {success:false,error:"Branding asset availability could not be loaded."};
    const uploadedTypes = new Set((assets ?? []).map((a) => a.asset_type as string));
    const canSign = brandingPermission(ctx,"reports.sign",ownerCompanyId);

    return {
      success: true,
      data: {
        profileId: profile.id,
        profileCode: profile.profile_code,
        profileName: profile.profile_name,
        isDefault: profile.is_default_for_company,
        assetStatus: {
          report_logo: uploadedTypes.has("report_logo"),
          report_logo_small: uploadedTypes.has("report_logo_small"),
          stamp: canSign ? uploadedTypes.has("stamp") : null,
          signature: canSign ? uploadedTypes.has("signature") : null,
          watermark: uploadedTypes.has("watermark"),
          letterhead_background: uploadedTypes.has("letterhead_background"),
        },
      },
    };
  } catch {
    return { success: false, error: "Company branding could not be loaded. Retry before making changes." };
  }
}

/**
 * Ensure a default report branding profile exists for the given company.
 * Exposed as an admin action callable from the org workspace branding section.
 */
export async function ensureOrgBrandingProfile(
  ownerCompanyId: number, operationId?: string
): Promise<ActionResult<{ profileId: number; wasNew: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!Number.isSafeInteger(ownerCompanyId) || ownerCompanyId < 1 || !brandingPermission(ctx, "reports.manage", ownerCompanyId) || !brandingPermission(ctx,"organizations.manage",ownerCompanyId)) {
      return { success: false, error: "Requires reports.manage permission" };
    }

    const { ensureReportBrandingForOwnerCompany } = await import(
      "@/lib/report-center/company-onboarding"
    );

    const result = await ensureReportBrandingForOwnerCompany(ownerCompanyId,operationId);
    if (!result.success) return { success: false, error: result.error };

    // The database receipt is authoritative. Refresh failure must not report a
    // committed setup as failed and invite another company/profile creation.
    let warning: string | undefined;
    try {
      revalidatePath("/admin/reports/templates");
      revalidatePath("/admin/organizations");
      revalidatePath(`/admin/organizations/record/${ownerCompanyId}`);
    } catch { warning = "Branding setup is saved. Reload its summary before making further changes."; }

    return {
      success: true,
      warning,
      data: {
        profileId: result.brandingProfileId!,
        wasNew: !result.wasAlreadyPresent,
      },
    };
  } catch {
    return { success: false, error: "Branding setup is unconfirmed. Retry the same operation." };
  }
}

/**
 * Backfill default report branding profiles for ALL active owner companies.
 * Requires global organization and branding management. Per-company atomic.
 */
export async function backfillAllOrgBrandingProfiles(): Promise<
  ActionResult<{ total: number; created: number; skipped: number; errors: string[] }>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "reports.manage") || !hasGlobalPermission(ctx,"organizations.manage")) {
      return { success: false, error: "Requires reports.manage permission" };
    }

    const { ensureReportBrandingForAllOwnerCompanies } = await import(
      "@/lib/report-center/company-onboarding"
    );

    const result = await ensureReportBrandingForAllOwnerCompanies();

    // Each company's changes and audit are committed in its own transaction.

    let warning: string | undefined;
    try {
      revalidatePath("/admin/reports/templates");
      revalidatePath("/admin/organizations");
    } catch { warning = "Completed company setups remain saved. Reload the branding catalogue before continuing."; }

    return {
      success: result.success,
      warning,
      data: {
        total: result.total,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
      },
      error: result.errors.length > 0 ? `${result.errors.length} companies failed` : undefined,
    };
  } catch {
    return { success: false, error: "Company branding setup could not be completed. Reconcile saved companies before retrying." };
  }
}
