"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createCustomerContactSchema,
  updateCustomerContactSchema,
  type CreateCustomerContactInput,
  type UpdateCustomerContactInput,
} from "@/features/master-data/customers/validation";
import type { CustomerContact, ActionResult } from "@/features/master-data/customers/types";

/**
 * Get all contacts for a customer
 */
export async function getCustomerContacts(customerId: number): Promise<ActionResult<CustomerContact[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.view")) {
      return { success: false, error: "You do not have permission to view customer contacts" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customer_contacts")
      .select("*")
      .eq("customer_id", customerId)
      .order("is_primary", { ascending: false })
      .order("contact_name_en");

    if (error) {
      console.error("getCustomerContacts error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as CustomerContact[] };
  } catch (error) {
    console.error("getCustomerContacts exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create a new customer contact
 */
export async function createCustomerContact(
  input: CreateCustomerContactInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createCustomerContactSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to create customer contacts" };
    }

    const supabase = await createClient();

    // Generate contact code using global numbering system
    const numberingResult = await generateNextReference({
      documentTypeCode: "CUSTOMER_CONTACT",
      targetTableName: "customer_contacts",
      generationReason: "Customer contact creation",
    });

    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: numberingResult.error ?? "Failed to generate contact code" };
    }

    const contact_code = numberingResult.data.generatedReferenceNumber;

    // If this contact is marked as primary, unset existing primary contact
    if (validated.is_primary) {
      await supabase
        .from("customer_contacts")
        .update({ is_primary: false })
        .eq("customer_id", validated.customer_id)
        .eq("is_primary", true);
    }

    const { data, error } = await supabase
      .from("customer_contacts")
      .insert({
        ...validated,
        contact_code,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, contact_code")
      .single();

    if (error) {
      console.error("createCustomerContact error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_contacts",
      entity_id: data.id,
      entity_reference: data.contact_code,
      action: "create",
      new_values: validated,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCustomerContact exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update a customer contact
 */
export async function updateCustomerContact(input: UpdateCustomerContactInput): Promise<ActionResult<{ id: number }>> {
  try {
    const result = updateCustomerContactSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = result.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to update customer contacts" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_contacts")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Contact not found" };
    }

    if (existing.is_locked && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Contact is locked and cannot be modified" };
    }

    // If this contact is being marked as primary, unset existing primary contact
    if (validated.is_primary && !existing.is_primary) {
      await supabase
        .from("customer_contacts")
        .update({ is_primary: false })
        .eq("customer_id", existing.customer_id)
        .eq("is_primary", true)
        .neq("id", validated.id);
    }

    const { id, ...updateData } = validated;
    const { error: updateError } = await supabase
      .from("customer_contacts")
      .update({
        ...updateData,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("updateCustomerContact error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_contacts",
      entity_id: id,
      entity_reference: existing.contact_code,
      action: "update",
      old_values: existing,
      new_values: updateData,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCustomerContact exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Deactivate a customer contact
 */
export async function deactivateCustomerContact(id: number, reason?: string): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to deactivate customer contacts" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_contacts")
      .select("contact_code, is_locked")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Contact not found" };
    }

    if (existing.is_locked && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Contact is locked and cannot be deactivated" };
    }

    const { error: updateError } = await supabase
      .from("customer_contacts")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: ctx.profile?.id ?? null,
        deactivation_reason: reason ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("deactivateCustomerContact error", updateError);
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_contacts",
      entity_id: id,
      entity_reference: existing.contact_code,
      action: "deactivate",
      new_values: { is_active: false, deactivation_reason: reason },
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deactivateCustomerContact exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a customer contact
 */
export async function deleteCustomerContact(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "You do not have permission to delete customer contacts" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("customer_contacts")
      .select("contact_code, is_system")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Contact not found" };
    }

    if (existing.is_system) {
      return { success: false, error: "System contact cannot be deleted" };
    }

    const { error: deleteError } = await supabase.from("customer_contacts").delete().eq("id", id);

    if (deleteError) {
      console.error("deleteCustomerContact error", deleteError);
      return { success: false, error: deleteError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "customer_contacts",
      entity_id: id,
      entity_reference: existing.contact_code,
      action: "delete",
      old_values: existing,
    });

    revalidatePath("/admin/master-data/customers");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("deleteCustomerContact exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
