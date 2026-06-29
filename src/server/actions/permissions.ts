"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, isGlobalAdmin, assertAccountActive } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { sanitizeServerActionError } from "@/lib/audit/sanitizers";
import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Validation Schemas ───────────────────────────────────────────────────────

const rolePermissionSchema = z.object({
  roleId: z.number().int().positive("roleId must be a positive integer"),
  permissionId: z.number().int().positive("permissionId must be a positive integer"),
});

/**
 * Assign a permission to a role.
 * USERS.3 — system roles require global admin.
 */
export async function assignPermissionToRole(
  roleId: number,
  permissionId: number,
): Promise<ActionResult> {
  try {
    const { roleId: validRoleId, permissionId: validPermId } = rolePermissionSchema.parse({ roleId, permissionId });
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "role_permissions", entity_id: validRoleId,
        entity_reference: `role-${validRoleId}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "assignPermissionToRole", required_permission: "roles.manage", target_role_id: validRoleId, target_permission_id: validPermId },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();

    // Get role and permission for audit + system role check
    const { data: role } = await supabase.from("roles").select("role_code, is_system_role").eq("id", validRoleId).single();
    const { data: permission } = await supabase
      .from("permissions")
      .select("permission_code")
      .eq("id", validPermId)
      .single();

    if (!role || !permission) {
      return { success: false, error: "Role or permission not found" };
    }

    // USERS.3 — system roles: only global admin may assign/remove permissions
    if (role.is_system_role && !isGlobalAdmin(ctx)) {
      return {
        success: false,
        error: "Permissions on system roles can only be modified by a global administrator.",
      };
    }

    const { error } = await supabase
      .from("role_permissions")
      .insert({ role_id: validRoleId, permission_id: validPermId });

    if (error) {
      logger.error("assignPermissionToRole error", error);
      if (error.message.includes("duplicate key")) {
        return { success: false, error: "Permission already assigned to this role" };
      }
      return { success: false, error: sanitizeServerActionError(error) };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "role_permissions",
      entity_id: validRoleId,
      entity_reference: `${role.role_code} → ${permission.permission_code}`,
      action: "ROLE_PERMISSION_ASSIGNED",
      new_values: { role_id: validRoleId, permission_code: permission.permission_code },
    });

    revalidatePath("/admin/permissions");
    revalidatePath("/admin/roles");

    return { success: true };
  } catch (error) {
    logger.error("assignPermissionToRole exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

/**
 * Remove a permission from a role.
 * USERS.3 — system roles require global admin.
 */
export async function removePermissionFromRole(
  roleId: number,
  permissionId: number,
): Promise<ActionResult> {
  try {
    const { roleId: validRoleId, permissionId: validPermId } = rolePermissionSchema.parse({ roleId, permissionId });
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "role_permissions", entity_id: validRoleId,
        entity_reference: `role-${validRoleId}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "removePermissionFromRole", required_permission: "roles.manage", target_role_id: validRoleId, target_permission_id: validPermId },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();

    const { data: role } = await supabase.from("roles").select("role_code, is_system_role").eq("id", validRoleId).single();
    const { data: permission } = await supabase
      .from("permissions")
      .select("permission_code")
      .eq("id", validPermId)
      .single();

    if (!role || !permission) {
      return { success: false, error: "Role or permission not found" };
    }

    // USERS.3 — system roles: only global admin may remove permissions
    if (role.is_system_role && !isGlobalAdmin(ctx)) {
      return {
        success: false,
        error: "Permissions on system roles can only be modified by a global administrator.",
      };
    }

    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", validRoleId)
      .eq("permission_id", validPermId);

    if (error) {
      logger.error("removePermissionFromRole error", error);
      return { success: false, error: sanitizeServerActionError(error) };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "role_permissions",
      entity_id: validRoleId,
      entity_reference: `${role.role_code} → ${permission.permission_code}`,
      action: "ROLE_PERMISSION_REMOVED",
      old_values: { role_id: validRoleId, permission_code: permission.permission_code },
    });

    revalidatePath("/admin/permissions");
    revalidatePath("/admin/roles");

    return { success: true };
  } catch (error) {
    logger.error("removePermissionFromRole exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}
