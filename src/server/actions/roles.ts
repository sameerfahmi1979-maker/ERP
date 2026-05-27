"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from "@/features/roles/role-schema";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function createRole(input: CreateRoleInput): Promise<ActionResult<{ id: number }>> {
  try {
    const validated = createRoleSchema.parse(input);
    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "roles.manage")) {
      return { success: false, error: "You do not have permission to create roles" };
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      description: validated.description || null,
    };

    const { data, error } = await supabase
      .from("roles")
      .insert(dataToInsert)
      .select("id, role_code")
      .single();

    if (error) {
      console.error("createRole error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: data.id,
      entity_reference: data.role_code,
      action: "create",
      new_values: validated,
    });

    revalidatePath("/admin/roles");
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createRole exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateRole(input: UpdateRoleInput): Promise<ActionResult> {
  try {
    const validated = updateRoleSchema.parse(input);
    const { id, ...updates } = validated;
    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "roles.manage")) {
      return { success: false, error: "You do not have permission to update roles" };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("roles").select("*").eq("id", id).single();

    if (!oldData) {
      return { success: false, error: "Role not found" };
    }

    if (oldData.is_system_role && !hasPermission(ctx, "system.admin")) {
      return { success: false, error: "Only system admins can modify system roles" };
    }

    const dataToUpdate = {
      ...updates,
      description: updates.description === "" ? null : updates.description,
    };

    const { error } = await supabase.from("roles").update(dataToUpdate).eq("id", id);

    if (error) {
      console.error("updateRole error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: id,
      entity_reference: oldData.role_code,
      action: "update",
      old_values,
      new_values,
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    console.error("updateRole exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteRole(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "roles.manage")) {
      return { success: false, error: "You do not have permission to delete roles" };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("roles").select("*").eq("id", id).single();

    if (!oldData) {
      return { success: false, error: "Role not found" };
    }

    if (oldData.is_system_role) {
      return { success: false, error: "System roles cannot be deleted. Deactivate instead." };
    }

    const { error } = await supabase.from("roles").delete().eq("id", id);

    if (error) {
      console.error("deleteRole error", error);
      return {
        success: false,
        error: error.message.includes("violates foreign key constraint")
          ? "Cannot delete role with existing assignments. Deactivate instead."
          : error.message,
      };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: id,
      entity_reference: oldData.role_code,
      action: "delete",
      old_values: oldData,
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    console.error("deleteRole exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateRoleStatus(id: number, isActive: boolean): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "roles.manage")) {
      return { success: false, error: "You do not have permission to update role status" };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("roles").select("*").eq("id", id).single();

    if (!oldData) {
      return { success: false, error: "Role not found" };
    }

    const { error } = await supabase
      .from("roles")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      console.error("updateRoleStatus error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: id,
      entity_reference: oldData.role_code,
      action: "status_change",
      old_values: { is_active: oldData.is_active },
      new_values: { is_active: isActive },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    console.error("updateRoleStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
