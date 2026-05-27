"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
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

/**
 * Create a new organization (owner company)
 * Server action with RLS and audit logging
 */
export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const validated = createOrganizationSchema.parse(input);

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "organizations.manage")) {
      return { success: false, error: "You do not have permission to create organizations" };
    }

    // 3. Create organization
    const supabase = await createClient();
    
    // Transform empty strings to null for optional fields
    const dataToInsert = {
      ...validated,
      legal_name_ar: validated.legal_name_ar || null,
      short_name: validated.short_name || null,
      legal_form: validated.legal_form || null,
      country: validated.country || null,
      emirate: validated.emirate || null,
      trade_license_no: validated.trade_license_no || null,
      trn: validated.trn || null,
      corporate_tax_no: validated.corporate_tax_no || null,
      primary_email: validated.primary_email || null,
      primary_phone: validated.primary_phone || null,
      website: validated.website || null,
      logo_url: validated.logo_url || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("owner_companies")
      .insert(dataToInsert)
      .select("id, company_code")
      .single();

    if (error) {
      console.error("createOrganization error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "organizations",
      entity_name: "owner_companies",
      entity_id: data.id,
      entity_reference: data.company_code,
      action: "create",
      new_values: validated,
      owner_company_id: data.id,
    });

    // 5. Revalidate
    revalidatePath("/admin/organizations");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createOrganization exception", error);
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
    const validated = updateOrganizationSchema.parse(input);
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

    // 4. Update organization
    // Transform empty strings to null for optional fields
    const dataToUpdate = {
      ...updates,
      legal_name_ar: updates.legal_name_ar === "" ? null : updates.legal_name_ar,
      short_name: updates.short_name === "" ? null : updates.short_name,
      legal_form: updates.legal_form === "" ? null : updates.legal_form,
      country: updates.country === "" ? null : updates.country,
      emirate: updates.emirate === "" ? null : updates.emirate,
      trade_license_no: updates.trade_license_no === "" ? null : updates.trade_license_no,
      trn: updates.trn === "" ? null : updates.trn,
      corporate_tax_no: updates.corporate_tax_no === "" ? null : updates.corporate_tax_no,
      primary_email: updates.primary_email === "" ? null : updates.primary_email,
      primary_phone: updates.primary_phone === "" ? null : updates.primary_phone,
      website: updates.website === "" ? null : updates.website,
      logo_url: updates.logo_url === "" ? null : updates.logo_url,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("owner_companies")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updateOrganization error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
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

    // 6. Revalidate
    revalidatePath("/admin/organizations");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateOrganization exception", error);
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
      console.error("deleteOrganization error", error);
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
    console.error("deleteOrganization exception", error);
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
      console.error("updateOrganizationStatus error", error);
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
    console.error("updateOrganizationStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
