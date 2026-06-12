"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import {
  createCustomerAddressSchema,
  updateCustomerAddressSchema,
  type CreateCustomerAddressInput,
  type UpdateCustomerAddressInput,
} from "@/features/master-data/customers/validation";
import type { CustomerAddress, ActionResult } from "@/features/master-data/customers/types";

export async function getCustomerAddresses(customerId: number): Promise<ActionResult<CustomerAddress[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.view")) {
      return { success: false, error: "You do not have permission to view customer addresses" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customerId)
      .order("is_primary", { ascending: false })
      .order("id");

    if (error) {
      console.error("getCustomerAddresses error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as CustomerAddress[] };
  } catch (error) {
    console.error("getCustomerAddresses exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createCustomerAddress(input: CreateCustomerAddressInput): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createCustomerAddressSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to create customer addresses" };
    }

    const supabase = await createClient();

    if (validated.is_primary) {
      await supabase
        .from("customer_addresses")
        .update({ is_primary: false })
        .eq("customer_id", validated.customer_id)
        .eq("is_primary", true);
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        ...validated,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("createCustomerAddress error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_addresses",
      entity_id: data.id,
      entity_reference: `Address ${data.id}`,
      action: "create",
      new_values: validated,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCustomerAddress exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCustomerAddress(input: UpdateCustomerAddressInput): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateCustomerAddressSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to update customer addresses" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Address not found" };
    }

    if (existing.is_locked && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Address is locked and cannot be modified" };
    }

    if (validated.is_primary && !existing.is_primary) {
      await supabase
        .from("customer_addresses")
        .update({ is_primary: false })
        .eq("customer_id", existing.customer_id)
        .eq("is_primary", true)
        .neq("id", validated.id);
    }

    const { id, ...updateData } = validated;
    const { error: updateError } = await supabase
      .from("customer_addresses")
      .update({
        ...updateData,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("updateCustomerAddress error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_addresses",
      entity_id: id,
      entity_reference: `Address ${id}`,
      action: "update",
      old_values: existing,
      new_values: updateData,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCustomerAddress exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deactivateCustomerAddress(id: number, reason?: string): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to deactivate customer addresses" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_addresses")
      .select("is_locked")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Address not found" };
    }

    if (existing.is_locked && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Address is locked and cannot be deactivated" };
    }

    const { error: updateError } = await supabase
      .from("customer_addresses")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: ctx.profile?.id ?? null,
        deactivation_reason: reason ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("deactivateCustomerAddress error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_addresses",
      entity_id: id,
      entity_reference: `Address ${id}`,
      action: "deactivate",
      new_values: { is_active: false, deactivation_reason: reason },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deactivateCustomerAddress exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteCustomerAddress(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to delete customer addresses" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_addresses")
      .select("is_system")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Address not found" };
    }

    if (existing.is_system) {
      return { success: false, error: "System address cannot be deleted" };
    }

    const { error: deleteError } = await supabase.from("customer_addresses").delete().eq("id", id);

    if (deleteError) {
      console.error("deleteCustomerAddress error", deleteError);
      return { success: false, error: deleteError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_addresses",
      entity_id: id,
      entity_reference: `Address ${id}`,
      action: "delete",
      old_values: existing,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deleteCustomerAddress exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
