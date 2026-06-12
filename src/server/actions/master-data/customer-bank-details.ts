"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import {
  createCustomerBankDetailSchema,
  updateCustomerBankDetailSchema,
  type CreateCustomerBankDetailInput,
  type UpdateCustomerBankDetailInput,
} from "@/features/master-data/customers/validation";
import type { CustomerBankDetail, ActionResult } from "@/features/master-data/customers/types";

export async function getCustomerBankDetails(customerId: number): Promise<ActionResult<CustomerBankDetail[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.view")) {
      return { success: false, error: "You do not have permission to view customer bank details" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customer_bank_details")
      .select("*")
      .eq("customer_id", customerId)
      .order("is_primary", { ascending: false })
      .order("id");

    if (error) {
      console.error("getCustomerBankDetails error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as CustomerBankDetail[] };
  } catch (error) {
    console.error("getCustomerBankDetails exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createCustomerBankDetail(
  input: CreateCustomerBankDetailInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createCustomerBankDetailSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to create customer bank details" };
    }

    const supabase = await createClient();

    // Note: customer_bank_details does NOT have is_locked or is_system fields
    if (validated.is_primary) {
      await supabase
        .from("customer_bank_details")
        .update({ is_primary: false })
        .eq("customer_id", validated.customer_id)
        .eq("is_primary", true);
    }

    const { data, error } = await supabase
      .from("customer_bank_details")
      .insert({
        ...validated,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("createCustomerBankDetail error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_bank_details",
      entity_id: data.id,
      entity_reference: validated.account_number,
      action: "create",
      new_values: validated,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCustomerBankDetail exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCustomerBankDetail(
  input: UpdateCustomerBankDetailInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateCustomerBankDetailSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to update customer bank details" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_bank_details")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Bank detail not found" };
    }

    // Note: customer_bank_details does NOT have is_locked or is_system fields - no lock check needed

    if (validated.is_primary && !existing.is_primary) {
      await supabase
        .from("customer_bank_details")
        .update({ is_primary: false })
        .eq("customer_id", existing.customer_id)
        .eq("is_primary", true)
        .neq("id", validated.id);
    }

    const { id, ...updateData } = validated;
    const { error: updateError } = await supabase
      .from("customer_bank_details")
      .update({
        ...updateData,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("updateCustomerBankDetail error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_bank_details",
      entity_id: id,
      entity_reference: existing.account_number,
      action: "update",
      old_values: existing,
      new_values: updateData,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCustomerBankDetail exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deactivateCustomerBankDetail(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to deactivate customer bank details" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_bank_details")
      .select("account_number")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Bank detail not found" };
    }

    const { error: updateError } = await supabase
      .from("customer_bank_details")
      .update({
        is_active: false,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("deactivateCustomerBankDetail error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_bank_details",
      entity_id: id,
      entity_reference: existing.account_number,
      action: "deactivate",
      new_values: { is_active: false },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deactivateCustomerBankDetail exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteCustomerBankDetail(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to delete customer bank details" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_bank_details")
      .select("account_number")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Bank detail not found" };
    }

    // Note: customer_bank_details does NOT have is_system field - no system check needed

    const { error: deleteError } = await supabase.from("customer_bank_details").delete().eq("id", id);

    if (deleteError) {
      console.error("deleteCustomerBankDetail error", deleteError);
      return { success: false, error: deleteError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_bank_details",
      entity_id: id,
      entity_reference: existing.account_number,
      action: "delete",
      old_values: existing,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deleteCustomerBankDetail exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
