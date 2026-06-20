"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Assign permission to role
 */
export async function assignPermissionToRole(
  roleId: number,
  permissionId: number,
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "roles.manage")) {
      return { success: false, error: "You do not have permission to manage role permissions" };
    }

    const supabase = await createClient();

    // Get role and permission for audit
    const { data: role } = await supabase.from("roles").select("role_code").eq("id", roleId).single();
    const { data: permission } = await supabase
      .from("permissions")
      .select("permission_code")
      .eq("id", permissionId)
      .single();

    if (!role || !permission) {
      return { success: false, error: "Role or permission not found" };
    }

    // Insert role-permission assignment
    const { error } = await supabase
      .from("role_permissions")
      .insert({ role_id: roleId, permission_id: permissionId });

    if (error) {
      logger.error("assignPermissionToRole error", error);
      if (error.message.includes("duplicate key")) {
        return { success: false, error: "Permission already assigned to this role" };
      }
      return { success: false, error: error.message };
    }

    // Log audit
    await logAudit({
      module_code: "roles",
      entity_name: "role_permissions",
      entity_id: roleId,
      entity_reference: `${role.role_code} → ${permission.permission_code}`,
      action: "assign_permission",
      new_values: { role_id: roleId, permission_id: permissionId },
    });

    revalidatePath("/admin/permissions");
    revalidatePath("/admin/roles");

    return { success: true };
  } catch (error) {
    logger.error("assignPermissionToRole exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Remove permission from role
 */
export async function removePermissionFromRole(
  roleId: number,
  permissionId: number,
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "roles.manage")) {
      return { success: false, error: "You do not have permission to manage role permissions" };
    }

    const supabase = await createClient();

    // Get role and permission for audit
    const { data: role } = await supabase.from("roles").select("role_code").eq("id", roleId).single();
    const { data: permission } = await supabase
      .from("permissions")
      .select("permission_code")
      .eq("id", permissionId)
      .single();

    if (!role || !permission) {
      return { success: false, error: "Role or permission not found" };
    }

    // Delete role-permission assignment
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .eq("permission_id", permissionId);

    if (error) {
      logger.error("removePermissionFromRole error", error);
      return { success: false, error: error.message };
    }

    // Log audit
    await logAudit({
      module_code: "roles",
      entity_name: "role_permissions",
      entity_id: roleId,
      entity_reference: `${role.role_code} → ${permission.permission_code}`,
      action: "remove_permission",
      old_values: { role_id: roleId, permission_id: permissionId },
    });

    revalidatePath("/admin/permissions");
    revalidatePath("/admin/roles");

    return { success: true };
  } catch (error) {
    logger.error("removePermissionFromRole exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
