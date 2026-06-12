"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  createBranchSchema,
  updateBranchSchema,
  type CreateBranchInput,
  type UpdateBranchInput,
} from "@/features/branches/branch-schema";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Create a new branch
 * Server action with RLS and audit logging
 */
export async function createBranch(
  input: CreateBranchInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createBranchSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "branches.manage")) {
      return { success: false, error: "You do not have permission to create branches" };
    }

    // 3. Create branch
    const supabase = await createClient();
    
    // Transform empty strings to null for optional fields
    const dataToInsert = {
      ...validated,
      branch_name_ar: validated.branch_name_ar || null,
      emirate: validated.emirate || null,
      area: validated.area || null,
      address_line_1: validated.address_line_1 || null,
      address_line_2: validated.address_line_2 || null,
      po_box: validated.po_box || null,
      phone: validated.phone || null,
      email: validated.email || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("branches")
      .insert(dataToInsert)
      .select("id, branch_code, owner_company_id")
      .single();

    if (error) {
      console.error("createBranch error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "branches",
      entity_name: "branches",
      entity_id: data.id,
      entity_reference: data.branch_code,
      action: "create",
      new_values: validated,
      owner_company_id: data.owner_company_id,
    });

    // 5. Revalidate
    revalidatePath("/admin/branches");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createBranch exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing branch
 * Server action with RLS and audit logging
 */
export async function updateBranch(
  input: UpdateBranchInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateBranchSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "branches.manage")) {
      return { success: false, error: "You do not have permission to update branches" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("branches")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Branch not found" };
    }

    // 4. Update branch
    // Transform empty strings to null for optional fields
    const dataToUpdate = {
      ...updates,
      branch_name_ar: updates.branch_name_ar === "" ? null : updates.branch_name_ar,
      emirate: updates.emirate === "" ? null : updates.emirate,
      area: updates.area === "" ? null : updates.area,
      address_line_1: updates.address_line_1 === "" ? null : updates.address_line_1,
      address_line_2: updates.address_line_2 === "" ? null : updates.address_line_2,
      po_box: updates.po_box === "" ? null : updates.po_box,
      phone: updates.phone === "" ? null : updates.phone,
      email: updates.email === "" ? null : updates.email,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("branches")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updateBranch error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "branches",
      entity_name: "branches",
      entity_id: id,
      entity_reference: oldData.branch_code,
      action: "update",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id,
      branch_id: id,
    });

    // 6. Revalidate
    revalidatePath("/admin/branches");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateBranch exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a branch
 * Server action with RLS and audit logging
 * Note: Likely to fail if there are related users (CASCADE/RESTRICT)
 */
export async function deleteBranch(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "branches.manage")) {
      return { success: false, error: "You do not have permission to delete branches" };
    }

    // 2. Get branch for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("branches")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Branch not found" };
    }

    // 3. Delete branch
    const { error } = await supabase.from("branches").delete().eq("id", id);

    if (error) {
      console.error("deleteBranch error", error);
      return {
        success: false,
        error: error.message.includes("violates foreign key constraint")
          ? "Cannot delete branch with existing users. Deactivate instead."
          : error.message,
      };
    }

    // 4. Log audit
    await logAudit({
      module_code: "branches",
      entity_name: "branches",
      entity_id: id,
      entity_reference: oldData.branch_code,
      action: "delete",
      old_values: oldData,
      owner_company_id: oldData.owner_company_id,
      branch_id: id,
    });

    // 5. Revalidate
    revalidatePath("/admin/branches");

    return { success: true };
  } catch (error) {
    console.error("deleteBranch exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Change branch status (activate/deactivate/suspend)
 * Server action with RLS and audit logging
 */
export async function updateBranchStatus(
  id: number,
  status: "active" | "inactive" | "suspended",
): Promise<ActionResult> {
  try {
    // 1. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "branches.manage")) {
      return { success: false, error: "You do not have permission to update branch status" };
    }

    // 2. Get old status for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("branches")
      .select("status, branch_code, owner_company_id")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Branch not found" };
    }

    // 3. Update status
    const { error } = await supabase
      .from("branches")
      .update({ status, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) {
      console.error("updateBranchStatus error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "branches",
      entity_name: "branches",
      entity_id: id,
      entity_reference: oldData.branch_code,
      action: "status_change",
      old_values: { status: oldData.status },
      new_values: { status },
      owner_company_id: oldData.owner_company_id,
      branch_id: id,
    });

    // 5. Revalidate
    revalidatePath("/admin/branches");

    return { success: true };
  } catch (error) {
    console.error("updateBranchStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
