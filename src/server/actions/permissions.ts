"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, isGlobalAdmin, assertAccountActive } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { sanitizeServerActionError } from "@/lib/audit/sanitizers";
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PermissionDraftChangeInput = {
  permissionId: number;
  permissionCode: string;
  permissionName: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  action: "grant" | "revoke";
};

export type BatchChangeResult = {
  permissionId: number;
  roleId: number;
  action: "grant" | "revoke";
  success: boolean;
  error?: string;
};

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

/**
 * Batch-apply draft permission changes (grants + revokes) from the
 * Permission Command Center Review & Save dialog.
 *
 * USERS.6A — Applies each change through the same security layer as the
 * individual actions.  Returns per-change success/failure so the UI can
 * show exactly what failed and keep failed items pending.
 */
export async function saveRolePermissionDraftChanges(
  changes: PermissionDraftChangeInput[],
): Promise<{ success: boolean; results: BatchChangeResult[]; error?: string }> {
  if (!changes || changes.length === 0) {
    return { success: true, results: [] };
  }

  try {
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles",
        entity_name: "role_permissions",
        entity_id: 0,
        entity_reference: "batch",
        action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: {
          attempted_action: "saveRolePermissionDraftChanges",
          required_permission: "roles.manage",
          change_count: changes.length,
        },
      }).catch(() => {});
      return { success: false, results: [], error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();
    const results: BatchChangeResult[] = [];

    for (const change of changes) {
      const { permissionId, roleId, action, roleCode, permissionCode } = change;

      // Validate role and permission exist + check system role constraint
      const { data: role } = await supabase
        .from("roles")
        .select("role_code, is_system_role")
        .eq("id", roleId)
        .single();

      if (!role) {
        results.push({ permissionId, roleId, action, success: false, error: "Role not found" });
        continue;
      }

      if (role.is_system_role && !isGlobalAdmin(ctx)) {
        results.push({
          permissionId, roleId, action, success: false,
          error: "Permissions on system roles can only be modified by a global administrator.",
        });
        continue;
      }

      if (action === "grant") {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: roleId, permission_id: permissionId });

        if (error) {
          const isDuplicate = error.message.includes("duplicate key");
          results.push({
            permissionId, roleId, action, success: isDuplicate,
            error: isDuplicate ? undefined : sanitizeServerActionError(error),
          });
        } else {
          results.push({ permissionId, roleId, action, success: true });
          await logAudit({
            module_code: "roles",
            entity_name: "role_permissions",
            entity_id: roleId,
            entity_reference: `${roleCode} → ${permissionCode}`,
            action: "ROLE_PERMISSION_ASSIGNED",
            new_values: { role_id: roleId, permission_code: permissionCode, via: "batch_draft_save" },
          }).catch(() => {});
        }
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", roleId)
          .eq("permission_id", permissionId);

        if (error) {
          results.push({ permissionId, roleId, action, success: false, error: sanitizeServerActionError(error) });
        } else {
          results.push({ permissionId, roleId, action, success: true });
          await logAudit({
            module_code: "roles",
            entity_name: "role_permissions",
            entity_id: roleId,
            entity_reference: `${roleCode} → ${permissionCode}`,
            action: "ROLE_PERMISSION_REMOVED",
            old_values: { role_id: roleId, permission_code: permissionCode, via: "batch_draft_save" },
          }).catch(() => {});
        }
      }
    }

    // Single batch audit event with aggregate metadata
    const grantCount = results.filter((r) => r.action === "grant" && r.success).length;
    const revokeCount = results.filter((r) => r.action === "revoke" && r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    await logAudit({
      module_code: "roles",
      entity_name: "role_permissions",
      entity_id: 0,
      entity_reference: "batch_draft_save",
      action: "ROLE_PERMISSION_BATCH_UPDATED",
      new_values: {
        grant_count: grantCount,
        revoke_count: revokeCount,
        fail_count: failCount,
        role_count: [...new Set(changes.map((c) => c.roleId))].length,
        permission_count: [...new Set(changes.map((c) => c.permissionId))].length,
        affected_role_codes: [...new Set(changes.map((c) => c.roleCode))],
        affected_permission_codes: [...new Set(changes.map((c) => c.permissionCode))],
      },
    }).catch(() => {});

    revalidatePath("/admin/permissions");
    revalidatePath("/admin/roles");

    const allSuccess = results.every((r) => r.success);
    return { success: allSuccess, results };
  } catch (error) {
    logger.error("saveRolePermissionDraftChanges exception", error);
    return { success: false, results: [], error: sanitizeServerActionError(error) };
  }
}
