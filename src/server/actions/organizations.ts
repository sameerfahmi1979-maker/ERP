"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
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
};

export async function getOrganizationById(id: number): Promise<ActionResult<import("@/types/database").OwnerCompany>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.view")) {
      return { success: false, error: "You do not have permission to view organizations" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("owner_companies")
      .select("*")
      .eq("id", id)
      .single();
    if (error) { logger.error("getOrganizationById error", error); return { success: false, error: error.message }; }
    if (!data) return { success: false, error: "Organization not found" };
    return { success: true, data: data as import("@/types/database").OwnerCompany };
  } catch (error) {
    logger.error("getOrganizationById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create a new organization (owner company)
 * Server action with RLS and audit logging
 */
export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createOrganizationSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.manage")) {
      return { success: false, error: "You do not have permission to create organizations" };
    }

    // 3. Create Supabase client for geography resolution and insert
    const supabase = await createClient();
    
    // 4. Resolve geography names from FK IDs to sync legacy text fields
    let resolvedCountry: string | null = null;
    let resolvedEmirate: string | null = null;
    let resolvedCity: string | null = null;
    let resolvedArea: string | null = null;
    
    if (validated.country_id) {
      const { data: countryData } = await supabase
        .from("countries")
        .select("name_en")
        .eq("id", validated.country_id)
        .single();
      resolvedCountry = countryData?.name_en ?? null;
    }
    
    if (validated.emirate_id) {
      const { data: emirateData } = await supabase
        .from("emirates")
        .select("name_en")
        .eq("id", validated.emirate_id)
        .single();
      resolvedEmirate = emirateData?.name_en ?? null;
    }
    
    if (validated.city_id) {
      const { data: cityData } = await supabase
        .from("cities")
        .select("name_en")
        .eq("id", validated.city_id)
        .single();
      resolvedCity = cityData?.name_en ?? null;
    }
    
    if (validated.area_zone_id) {
      const { data: areaData } = await supabase
        .from("areas_zones")
        .select("name_en")
        .eq("id", validated.area_zone_id)
        .single();
      resolvedArea = areaData?.name_en ?? null;
    }
    
    // 5. Create organization
    
    // Transform empty strings to null for optional fields
    const dataToInsert = {
      ...validated,
      legal_name_ar: validated.legal_name_ar || null,
      short_name: validated.short_name || null,
      legal_form: validated.legal_form || null,
      country: resolvedCountry || validated.country || null,
      emirate: resolvedEmirate || validated.emirate || null,
      city: resolvedCity || null,
      area: resolvedArea || null,
      trade_license_no: validated.trade_license_no || null,
      trn: validated.trn || null,
      corporate_tax_no: validated.corporate_tax_no || null,
      primary_email: validated.primary_email || null,
      primary_phone: validated.primary_phone || null,
      website: validated.website || null,
      logo_url: validated.logo_url || null,
      // Geography FK fields (Phase 002F.3C.1B.1)
      country_id: validated.country_id ?? null,
      emirate_id: validated.emirate_id ?? null,
      city_id: validated.city_id ?? null,
      area_zone_id: validated.area_zone_id ?? null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("owner_companies")
      .insert(dataToInsert)
      .select("id, company_code")
      .single();

    if (error) {
      logger.error("createOrganization error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    await logAudit({
      module_code: "organizations",
      entity_name: "owner_companies",
      entity_id: data.id,
      entity_reference: data.company_code,
      action: "create",
      new_values: validated,
      owner_company_id: data.id,
    });

    // 6. Revalidate
    revalidatePath("/admin/organizations");

    // 7. REPORT.3: Ensure report branding/templates for the new company.
    // Non-blocking: if this fails, company creation still succeeds.
    ensureReportBrandingForOwnerCompany(data.id).catch((err) => {
      logger.warn(
        `[createOrganization] Report branding onboarding failed for company ${data.id}:`,
        err
      );
    });

    return { success: true, data: { id: data.id } };
  } catch (error) {
    logger.error("createOrganization exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing organization
 * Server action with RLS and audit logging
 */
export async function updateOrganization(
  input: UpdateOrganizationInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateOrganizationSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.manage")) {
      return { success: false, error: "You do not have permission to update organizations" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("owner_companies")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Organization not found" };
    }

    // 4. Resolve geography names from FK IDs to sync legacy text fields
    let resolvedCountry: string | null = null;
    let resolvedEmirate: string | null = null;
    let resolvedCity: string | null = null;
    let resolvedArea: string | null = null;
    
    if (updates.country_id !== undefined) {
      if (updates.country_id === null) {
        resolvedCountry = null;
      } else {
        const { data: countryData } = await supabase
          .from("countries")
          .select("name_en")
          .eq("id", updates.country_id)
          .single();
        resolvedCountry = countryData?.name_en ?? null;
      }
    }
    
    if (updates.emirate_id !== undefined) {
      if (updates.emirate_id === null) {
        resolvedEmirate = null;
      } else {
        const { data: emirateData } = await supabase
          .from("emirates")
          .select("name_en")
          .eq("id", updates.emirate_id)
          .single();
        resolvedEmirate = emirateData?.name_en ?? null;
      }
    }
    
    if (updates.city_id !== undefined) {
      if (updates.city_id === null) {
        resolvedCity = null;
      } else {
        const { data: cityData } = await supabase
          .from("cities")
          .select("name_en")
          .eq("id", updates.city_id)
          .single();
        resolvedCity = cityData?.name_en ?? null;
      }
    }
    
    if (updates.area_zone_id !== undefined) {
      if (updates.area_zone_id === null) {
        resolvedArea = null;
      } else {
        const { data: areaData } = await supabase
          .from("area_zones")
          .select("name_en")
          .eq("id", updates.area_zone_id)
          .single();
        resolvedArea = areaData?.name_en ?? null;
      }
    }
    
    // 5. Update organization
    // Transform empty strings to null for optional fields
    const dataToUpdate = {
      ...updates,
      legal_name_ar: updates.legal_name_ar === "" ? null : updates.legal_name_ar,
      short_name: updates.short_name === "" ? null : updates.short_name,
      legal_form: updates.legal_form === "" ? null : updates.legal_form,
      country: updates.country_id !== undefined ? resolvedCountry : (updates.country === "" ? null : updates.country),
      emirate: updates.emirate_id !== undefined ? resolvedEmirate : (updates.emirate === "" ? null : updates.emirate),
      city: updates.city_id !== undefined ? resolvedCity : undefined,
      area: updates.area_zone_id !== undefined ? resolvedArea : undefined,
      trade_license_no: updates.trade_license_no === "" ? null : updates.trade_license_no,
      trn: updates.trn === "" ? null : updates.trn,
      corporate_tax_no: updates.corporate_tax_no === "" ? null : updates.corporate_tax_no,
      primary_email: updates.primary_email === "" ? null : updates.primary_email,
      primary_phone: updates.primary_phone === "" ? null : updates.primary_phone,
      website: updates.website === "" ? null : updates.website,
      logo_url: updates.logo_url === "" ? null : updates.logo_url,
      // Geography FK fields (Phase 002F.3C.1B.1) — allow explicit null to clear FKs
      country_id: updates.country_id !== undefined ? updates.country_id : undefined,
      emirate_id: updates.emirate_id !== undefined ? updates.emirate_id : undefined,
      city_id: updates.city_id !== undefined ? updates.city_id : undefined,
      area_zone_id: updates.area_zone_id !== undefined ? updates.area_zone_id : undefined,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("owner_companies")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      logger.error("updateOrganization error", error);
      return { success: false, error: error.message };
    }

    // 6. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "organizations",
      entity_name: "owner_companies",
      entity_id: id,
      entity_reference: oldData.company_code,
      action: "update",
      old_values,
      new_values,
      owner_company_id: id,
    });

    // 7. Revalidate
    revalidatePath("/admin/organizations");

    // 8. BRANDING.3: Sync identity fields to default report branding profile.
    // Non-blocking — org update always succeeds even if sync fails.
    syncReportBrandingProfileFromOrganization(id).catch((err) => {
      logger.warn(
        `[updateOrganization] Branding profile sync failed for company ${id}:`,
        err
      );
    });

    return { success: true, data: { id } };
  } catch (error) {
    logger.error("updateOrganization exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete an organization
 * Server action with RLS and audit logging
 * Note: Likely to fail if there are related branches/users (CASCADE/RESTRICT)
 */
export async function deleteOrganization(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.manage")) {
      return { success: false, error: "You do not have permission to delete organizations" };
    }

    // 2. Get organization for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("owner_companies")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Organization not found" };
    }

    // 3. Delete organization
    const { error } = await supabase.from("owner_companies").delete().eq("id", id);

    if (error) {
      logger.error("deleteOrganization error", error);
      return {
        success: false,
        error: error.message.includes("violates foreign key constraint")
          ? "Cannot delete organization with existing branches or users. Deactivate instead."
          : error.message,
      };
    }

    // 4. Log audit
    await logAudit({
      module_code: "organizations",
      entity_name: "owner_companies",
      entity_id: id,
      entity_reference: oldData.company_code,
      action: "delete",
      old_values: oldData,
      owner_company_id: id,
    });

    // 5. Revalidate
    revalidatePath("/admin/organizations");

    return { success: true };
  } catch (error) {
    logger.error("deleteOrganization exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Change organization status (activate/deactivate/suspend)
 * Server action with RLS and audit logging
 */
export async function updateOrganizationStatus(
  id: number,
  status: "active" | "inactive" | "suspended",
): Promise<ActionResult> {
  try {
    // 1. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.manage")) {
      return { success: false, error: "You do not have permission to update organization status" };
    }

    // 2. Get old status for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("owner_companies")
      .select("status, company_code")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Organization not found" };
    }

    // 3. Update status
    const { error } = await supabase
      .from("owner_companies")
      .update({ status, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) {
      logger.error("updateOrganizationStatus error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "organizations",
      entity_name: "owner_companies",
      entity_id: id,
      entity_reference: oldData.company_code,
      action: "status_change",
      old_values: { status: oldData.status },
      new_values: { status },
      owner_company_id: id,
    });

    // 5. Revalidate
    revalidatePath("/admin/organizations");

    return { success: true };
  } catch (error) {
    logger.error("updateOrganizationStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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
    stamp: boolean;
    signature: boolean;
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
    if (!hasPermission(ctx, "organizations.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data: profile, error: profileError } = await supabase
      .from("erp_report_branding_profiles")
      .select("id, profile_code, profile_name, is_default_for_company")
      .eq("owner_company_id", ownerCompanyId)
      .eq("is_default_for_company", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (profileError) return { success: false, error: profileError.message };
    if (!profile) return { success: true, data: null };

    const { data: assets } = await supabase
      .from("erp_branding_assets")
      .select("asset_type")
      .eq("asset_scope", "report")
      .eq("branding_profile_id", profile.id)
      .eq("is_active", true)
      .is("deleted_at", null);

    const uploadedTypes = new Set((assets ?? []).map((a) => a.asset_type as string));

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
          stamp: uploadedTypes.has("stamp"),
          signature: uploadedTypes.has("signature"),
          watermark: uploadedTypes.has("watermark"),
          letterhead_background: uploadedTypes.has("letterhead_background"),
        },
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Ensure a default report branding profile exists for the given company.
 * Exposed as an admin action callable from the org workspace branding section.
 */
export async function ensureOrgBrandingProfile(
  ownerCompanyId: number
): Promise<ActionResult<{ profileId: number; wasNew: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "Requires reports.manage permission" };
    }

    const { ensureReportBrandingForOwnerCompany } = await import(
      "@/lib/report-center/company-onboarding"
    );

    const result = await ensureReportBrandingForOwnerCompany(ownerCompanyId);
    if (!result.success) return { success: false, error: result.error };

    return {
      success: true,
      data: {
        profileId: result.brandingProfileId!,
        wasNew: !result.wasAlreadyPresent,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Backfill default report branding profiles for ALL active owner companies.
 * Requires reports.manage. Non-destructive and idempotent.
 */
export async function backfillAllOrgBrandingProfiles(): Promise<
  ActionResult<{ total: number; created: number; skipped: number; errors: string[] }>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "reports.manage")) {
      return { success: false, error: "Requires reports.manage permission" };
    }

    const { ensureReportBrandingForAllOwnerCompanies } = await import(
      "@/lib/report-center/company-onboarding"
    );

    const result = await ensureReportBrandingForAllOwnerCompanies();

    await logAudit({
      module_code: "BRANDING",
      entity_name: "erp_report_branding_profiles",
      entity_id: 0,
      entity_reference: "BACKFILL_ALL",
      action: "backfill",
      new_values: {
        total: result.total,
        created: result.created,
        skipped: result.skipped,
      },
    });

    revalidatePath("/admin/reports/templates");

    return {
      success: result.success,
      data: {
        total: result.total,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
      },
      error: result.errors.length > 0 ? `${result.errors.length} companies failed` : undefined,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
