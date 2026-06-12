"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@/features/master-data/customers/validation";
import type { Customer, ActionResult } from "@/features/master-data/customers/types";

/**
 * Get all customers with RLS
 */
export async function getCustomers(): Promise<ActionResult<Customer[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.view")) {
      return { success: false, error: "You do not have permission to view customers" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("customer_name_en");

    if (error) {
      console.error("getCustomers error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Customer[] };
  } catch (error) {
    console.error("getCustomers exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get customer by ID
 */
export async function getCustomerById(id: number): Promise<ActionResult<Customer>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.view")) {
      return { success: false, error: "You do not have permission to view customers" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getCustomerById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Customer };
  } catch (error) {
    console.error("getCustomerById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create a new customer with auto-generated customer_code
 */
export async function createCustomer(
  input: CreateCustomerInput
): Promise<ActionResult<{ id: number; customer_code: string }>> {
  try {
    // 1. Validate input
    const result = createCustomerSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to create customers" };
    }

    // 3. Generate customer code using global numbering
    const numberingResult = await generateNextReference({
      documentTypeCode: "CUSTOMER",
      targetTableName: "customers",
      generationReason: "Customer creation",
    });

    if (!numberingResult.success || !numberingResult.data) {
      return { success: false, error: "Failed to generate customer code" };
    }

    const customerCode = numberingResult.data.generatedReferenceNumber;

    // 4. Create Supabase client and insert
    const supabase = await createClient();

    const dataToInsert = {
      customer_code: customerCode,
      customer_name_en: validated.customer_name_en,
      customer_name_ar: validated.customer_name_ar ?? null,
      customer_type_code: validated.customer_type_code,
      industry_type_code: validated.industry_type_code ?? null,
      customer_segment_code: validated.customer_segment_code ?? null,
      lead_source_code: validated.lead_source_code ?? null,
      trn: validated.trn ?? null,
      trade_license_number: validated.trade_license_number ?? null,
      license_expiry_date: validated.license_expiry_date ?? null,
      website_url: validated.website_url ?? null,
      primary_email: validated.primary_email ?? null,
      primary_phone: validated.primary_phone ?? null,
      primary_mobile: validated.primary_mobile ?? null,
      country_id: validated.country_id ?? null,
      emirate_id: validated.emirate_id ?? null,
      city_id: validated.city_id ?? null,
      area_zone_id: validated.area_zone_id ?? null,
      address_line_1: validated.address_line_1 ?? null,
      address_line_2: validated.address_line_2 ?? null,
      po_box: validated.po_box ?? null,
      makani_number: validated.makani_number ?? null,
      currency_id: validated.currency_id ?? null,
      payment_term_id: validated.payment_term_id ?? null,
      tax_type_id: validated.tax_type_id ?? null,
      credit_limit: validated.credit_limit ?? null,
      credit_days: validated.credit_days ?? null,
      sales_owner_user_profile_id: validated.sales_owner_user_profile_id ?? null,
      icv_certificate_number: validated.icv_certificate_number ?? null,
      icv_score_percentage: validated.icv_score_percentage ?? null,
      icv_issue_date: validated.icv_issue_date ?? null,
      icv_expiry_date: validated.icv_expiry_date ?? null,
      icv_company_type: validated.icv_company_type ?? null,
      icv_financial_year_end_date: validated.icv_financial_year_end_date ?? null,
      icv_certification_body: validated.icv_certification_body ?? null,
      icv_version: validated.icv_version ?? null,
      icv_status_code: validated.icv_status_code ?? null,
      cicpa_registration_number: validated.cicpa_registration_number ?? null,
      notes: validated.notes ?? null,
      status_code: validated.status_code,
      sort_order: validated.sort_order,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("customers")
      .insert(dataToInsert)
      .select("id, customer_code")
      .single();

    if (error) {
      console.error("createCustomer error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: data.id,
      entity_reference: data.customer_code,
      action: "create",
      new_values: validated,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/customers");

    return { success: true, data: { id: data.id, customer_code: data.customer_code } };
  } catch (error) {
    console.error("createCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing customer
 */
export async function updateCustomer(input: UpdateCustomerInput): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateCustomerSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to update customers" };
    }

    const supabase = await createClient();

    // 3. Get existing record
    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Customer not found" };
    }

    // 4. Check if locked or system
    if (existing.is_locked && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Customer is locked and cannot be modified" };
    }

    if (existing.is_system && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "System customer cannot be modified" };
    }

    // 5. Prepare update data (exclude id and customer_code)
    const { id, ...updateData } = validated;
    const dataToUpdate = {
      ...updateData,
      updated_by: ctx.profile?.id ?? null,
    };

    // 6. Update customer
    const { error: updateError } = await supabase
      .from("customers")
      .update(dataToUpdate)
      .eq("id", id);

    if (updateError) {
      console.error("updateCustomer error", updateError);
      return { success: false, error: updateError.message };
    }

    // 7. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: id,
      entity_reference: existing.customer_code,
      action: "update",
      old_values: existing,
      new_values: dataToUpdate,
    });

    // 8. Revalidate
    revalidatePath("/admin/master-data/customers");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Deactivate a customer
 */
export async function deactivateCustomer(
  id: number,
  reason?: string
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to deactivate customers" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("customer_code, is_locked, is_system")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Customer not found" };
    }

    if (existing.is_locked && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Customer is locked and cannot be deactivated" };
    }

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: ctx.profile?.id ?? null,
        deactivation_reason: reason ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("deactivateCustomer error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: id,
      entity_reference: existing.customer_code,
      action: "deactivate",
      new_values: { is_active: false, deactivation_reason: reason },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deactivateCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reactivate a customer
 */
export async function reactivateCustomer(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to reactivate customers" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("customer_code")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Customer not found" };
    }

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("reactivateCustomer error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: id,
      entity_reference: existing.customer_code,
      action: "reactivate",
      new_values: { is_active: true },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("reactivateCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Lock a customer
 */
export async function lockCustomer(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Only system administrators can lock customers" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("customer_code")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Customer not found" };
    }

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        is_locked: true,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("lockCustomer error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: id,
      entity_reference: existing.customer_code,
      action: "lock",
      new_values: { is_locked: true },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("lockCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Unlock a customer
 */
export async function unlockCustomer(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Only system administrators can unlock customers" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("customer_code")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Customer not found" };
    }

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        is_locked: false,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("unlockCustomer error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: id,
      entity_reference: existing.customer_code,
      action: "unlock",
      new_values: { is_locked: false },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("unlockCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a customer (system_admin only)
 */
export async function deleteCustomer(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Only system administrators can delete customers" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("customer_code, is_system")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Customer not found" };
    }

    if (existing.is_system) {
      return { success: false, error: "System customer cannot be deleted" };
    }

    const { error: deleteError } = await supabase.from("customers").delete().eq("id", id);

    if (deleteError) {
      console.error("deleteCustomer error", deleteError);
      return { success: false, error: deleteError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customers",
      entity_id: id,
      entity_reference: existing.customer_code,
      action: "delete",
      old_values: existing,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deleteCustomer exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
