"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, isGlobalAdmin, assertAccountActive } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import { sanitizeServerActionError } from "@/lib/audit/sanitizers";
import { batchSafeAuthMetadata } from "@/lib/users/auth-metadata";
import {
  createRoleSchema,
  updateRoleSchema,
  cloneRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
  type CloneRoleInput,
} from "@/features/roles/role-schema";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function getRoleById(id: number): Promise<ActionResult<import("@/types/database").Role>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "roles.view")) {
      return { success: false, error: "You do not have permission to view roles" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .eq("id", id)
      .single();
    if (error) { logger.error("getRoleById error", error); return { success: false, error: error.message }; }
    if (!data) return { success: false, error: "Role not found" };
    return { success: true, data: data as import("@/types/database").Role };
  } catch (error) {
    logger.error("getRoleById exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createRole(input: CreateRoleInput): Promise<ActionResult<{ id: number }>> {
  try {
    const validated = createRoleSchema.parse(input);
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "roles", entity_id: 0,
        entity_reference: "new_role", action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "createRole", required_permission: "roles.manage" },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();

    // USERS.3 — force all new roles to be custom, never system
    const dataToInsert = {
      role_code: validated.role_code,
      role_name: validated.role_name,
      display_name: validated.display_name || null,
      description: validated.description || null,
      role_category: validated.role_category || null,
      role_level: validated.role_level || null,
      is_assignable: validated.is_assignable ?? true,
      notes: validated.notes || null,
      is_active: validated.is_active ?? true,
      is_system_role: false, // always custom — never allow client to set
    };

    const { data, error } = await supabase
      .from("roles")
      .insert(dataToInsert)
      .select("id, role_code")
      .single();

    if (error) {
      logger.error("createRole error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: data.id,
      entity_reference: data.role_code,
      action: "ROLE_CREATED",
      new_values: {
        role_code: dataToInsert.role_code,
        role_name: dataToInsert.role_name,
        role_category: dataToInsert.role_category,
        is_assignable: dataToInsert.is_assignable,
        is_system_role: false,
      },
    });

    revalidatePath("/admin/roles");
    return { success: true, data: { id: data.id } };
  } catch (error) {
    logger.error("createRole exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateRole(input: UpdateRoleInput): Promise<ActionResult> {
  try {
    const validated = updateRoleSchema.parse(input);
    const { id, ...updates } = validated;
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "roles", entity_id: id,
        entity_reference: `role-${id}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "updateRole", required_permission: "roles.manage", target_entity_id: id },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("roles").select("*").eq("id", id).single();

    if (!oldData) return { success: false, error: "Role not found" };

    // USERS.3 — system roles: only global admin may edit
    if (oldData.is_system_role && !isGlobalAdmin(ctx)) {
      return { success: false, error: "System roles can only be modified by a global administrator." };
    }

    // Never allow role_code or is_system_role mutation
    const dataToUpdate: Record<string, unknown> = {};
    if (updates.role_name !== undefined) dataToUpdate.role_name = updates.role_name;
    if (updates.display_name !== undefined) dataToUpdate.display_name = updates.display_name === "" ? null : updates.display_name;
    if (updates.description !== undefined) dataToUpdate.description = updates.description === "" ? null : updates.description;
    if (updates.role_category !== undefined) dataToUpdate.role_category = updates.role_category === "" ? null : updates.role_category;
    if (updates.role_level !== undefined) dataToUpdate.role_level = updates.role_level === "" ? null : updates.role_level;
    if (updates.is_assignable !== undefined) {
      // system_admin assignability should not be changed to false
      if (oldData.role_code === "system_admin" && updates.is_assignable === false) {
        await logAudit({
          module_code: "roles", entity_name: "roles", entity_id: id,
          entity_reference: oldData.role_code, action: "LAST_ADMIN_GUARD_TRIGGERED",
          new_values: { target_role_code: "system_admin", attempted_action: "set_is_assignable_false", reason: "system_admin_must_remain_assignable" },
        }).catch(() => {});
        return { success: false, error: "The system_admin role must always remain assignable." };
      }
      dataToUpdate.is_assignable = updates.is_assignable;
    }
    if (updates.notes !== undefined) dataToUpdate.notes = updates.notes === "" ? null : updates.notes;
    if (updates.is_active !== undefined) dataToUpdate.is_active = updates.is_active;

    if (Object.keys(dataToUpdate).length === 0) {
      return { success: true }; // nothing to update
    }

    const { error } = await supabase.from("roles").update(dataToUpdate).eq("id", id);

    if (error) {
      logger.error("updateRole error", error);
      return { success: false, error: error.message };
    }

    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: id,
      entity_reference: oldData.role_code,
      action: "ROLE_UPDATED",
      old_values,
      new_values,
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    logger.error("updateRole exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteRole(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "roles", entity_id: id,
        entity_reference: `role-${id}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "deleteRole", required_permission: "roles.manage", target_entity_id: id },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("roles").select("*").eq("id", id).single();

    if (!oldData) return { success: false, error: "Role not found" };

    if (oldData.is_system_role) {
      return { success: false, error: "System roles cannot be deleted. Deactivate instead." };
    }

    const { error } = await supabase.from("roles").delete().eq("id", id);

    if (error) {
      logger.error("deleteRole error", error);
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
      action: "ROLE_DELETED",
      old_values: { role_code: oldData.role_code, role_name: oldData.role_name },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    logger.error("deleteRole exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function updateRoleStatus(id: number, isActive: boolean): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "roles", entity_id: id,
        entity_reference: `role-${id}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "updateRoleStatus", required_permission: "roles.manage", target_entity_id: id },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();
    const { data: oldData } = await supabase.from("roles").select("*").eq("id", id).single();

    if (!oldData) return { success: false, error: "Role not found" };

    // USERS.3 — never deactivate system_admin role
    if (oldData.role_code === "system_admin" && !isActive) {
      await logAudit({
        module_code: "roles", entity_name: "roles", entity_id: id,
        entity_reference: "system_admin", action: "LAST_ADMIN_GUARD_TRIGGERED",
        new_values: { target_role_code: "system_admin", attempted_action: "deactivate_role", reason: "system_admin_role_cannot_be_deactivated" },
      }).catch(() => {});
      return { success: false, error: "The system_admin role cannot be deactivated. Doing so would lock out all administrators." };
    }

    // System roles: only global admin may change status
    if (oldData.is_system_role && !isGlobalAdmin(ctx)) {
      return { success: false, error: "System role status can only be changed by a global administrator." };
    }

    const { error } = await supabase
      .from("roles")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      logger.error("updateRoleStatus error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: id,
      entity_reference: oldData.role_code,
      action: "ROLE_STATUS_CHANGED",
      old_values: { is_active: oldData.is_active },
      new_values: { is_active: isActive },
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    logger.error("updateRoleStatus exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLONE
// ─────────────────────────────────────────────────────────────────────────────

export async function cloneRole(
  sourceRoleId: number,
  input: CloneRoleInput,
): Promise<ActionResult<{ id: number; role_code: string }>> {
  try {
    const validated = cloneRoleSchema.parse(input);
    const ctx = await getAuthContext();
    assertAccountActive(ctx);

    if (!hasPermission(ctx, "roles.manage")) {
      await logAudit({
        module_code: "roles", entity_name: "roles", entity_id: sourceRoleId,
        entity_reference: `clone-role-${sourceRoleId}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "cloneRole", required_permission: "roles.manage", source_role_id: sourceRoleId },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    const supabase = await createClient();

    // 1. Load source role
    const { data: sourceRole, error: sourceErr } = await supabase
      .from("roles")
      .select("*")
      .eq("id", sourceRoleId)
      .single();

    if (sourceErr || !sourceRole) {
      return { success: false, error: "Source role not found" };
    }

    // 2. Check new role_code uniqueness
    const { data: existing } = await supabase
      .from("roles")
      .select("id")
      .eq("role_code", validated.role_code)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Role code "${validated.role_code}" is already in use` };
    }

    // 3. Create new custom role
    const { data: newRole, error: insertErr } = await supabase
      .from("roles")
      .insert({
        role_code: validated.role_code,
        role_name: validated.role_name,
        display_name: validated.display_name || null,
        description: validated.description || null,
        role_category: validated.role_category || null,
        role_level: validated.role_level || null,
        notes: validated.notes || null,
        is_system_role: false,  // always custom
        is_assignable: true,
        is_active: true,
      })
      .select("id, role_code")
      .single();

    if (insertErr || !newRole) {
      logger.error("cloneRole insert error", insertErr);
      return { success: false, error: insertErr?.message ?? "Failed to create cloned role" };
    }

    // 4. Copy active permissions from source role
    const { data: sourcePerms } = await supabase
      .from("role_permissions")
      .select("permission_id, permissions!permission_id(is_active)")
      .eq("role_id", sourceRoleId);

    let permissionsCopiedCount = 0;

    if (sourcePerms && sourcePerms.length > 0) {
      const activePerms = sourcePerms.filter((sp) => {
        const perm = sp.permissions as { is_active?: boolean } | null;
        return perm?.is_active !== false; // copy active permissions only
      });

      if (activePerms.length > 0) {
        const permInserts = activePerms.map((sp) => ({
          role_id: newRole.id,
          permission_id: sp.permission_id,
        }));

        const { error: permErr } = await supabase
          .from("role_permissions")
          .insert(permInserts);

        if (permErr) {
          // Best-effort cleanup: delete the new role so we don't leave orphaned record
          await supabase.from("roles").delete().eq("id", newRole.id);
          logger.error("cloneRole permission copy error", permErr);
          return { success: false, error: "Failed to copy permissions — role creation rolled back" };
        }

        permissionsCopiedCount = activePerms.length;
      }
    }

    // 5. Audit
    await logAudit({
      module_code: "roles",
      entity_name: "roles",
      entity_id: newRole.id,
      entity_reference: newRole.role_code,
      action: "ROLE_CLONED",
      new_values: {
        source_role_code: sourceRole.role_code,
        new_role_code: newRole.role_code,
        permissions_copied_count: permissionsCopiedCount,
        is_system_role: false,
      },
    });

    revalidatePath("/admin/roles");
    return { success: true, data: { id: newRole.id, role_code: newRole.role_code } };
  } catch (error) {
    logger.error("cloneRole exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNED USERS — USERS.3: fix assigned_at bug, add assigned_by, email
// ─────────────────────────────────────────────────────────────────────────────

export type AssignedUserRow = {
  user_role_id: number;
  user_profile_id: number;
  user_code: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  status: string | null;
  owner_company_id: number | null;
  branch_id: number | null;
  company_code: string | null;
  company_name: string | null;
  branch_code: string | null;
  branch_name: string | null;
  scope_label: string;
  assigned_at: string;
  assigned_by_name: string | null;
  is_active: boolean;
};

export async function getRoleWithUsersAction(
  roleId: number,
): Promise<ActionResult<{
  role: import("@/types/database").Role;
  assigned_users: AssignedUserRow[];
}>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "roles.view")) {
      return { success: false, error: "You do not have permission to view roles" };
    }

    const supabase = await createClient();

    // 1. Get role
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .single();

    if (roleError || !role) {
      return { success: false, error: "Role not found" };
    }

    // 2. Get user_roles — USERS.3: use assigned_at (not created_at), include assigned_by
    const { data: userRoles, error: userRolesError } = await supabase
      .from("user_roles")
      .select("id, user_profile_id, owner_company_id, branch_id, is_active, assigned_at, assigned_by")
      .eq("role_id", roleId)
      .order("assigned_at", { ascending: false });

    if (userRolesError) {
      logger.error("getRoleWithUsersAction user_roles error", userRolesError.message);
      return { success: true, data: { role, assigned_users: [] } };
    }

    if (!userRoles || userRoles.length === 0) {
      return { success: true, data: { role, assigned_users: [] } };
    }

    // 3. Get user profiles
    const userProfileIds = userRoles.map((ur) => ur.user_profile_id);
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, user_code, full_name, display_name, status, auth_user_id, owner_company_id, branch_id")
      .in("id", userProfileIds);

    // 4. Get companies
    const companyIds = [...new Set(userRoles.map((ur) => ur.owner_company_id).filter((id): id is number => id !== null))];
    const { data: companies } = companyIds.length > 0
      ? await supabase.from("owner_companies").select("id, company_code, legal_name_en").in("id", companyIds)
      : { data: [] };

    // 5. Get branches
    const branchIds = [...new Set(userRoles.map((ur) => ur.branch_id).filter((id): id is number => id !== null))];
    const { data: branches } = branchIds.length > 0
      ? await supabase.from("branches").select("id, branch_code, branch_name_en").in("id", branchIds)
      : { data: [] };

    // 6. Get assigned_by names
    const assignedByIds = [...new Set(userRoles.map((ur) => ur.assigned_by).filter((id): id is number => id !== null))];
    const { data: assignedByProfiles } = assignedByIds.length > 0
      ? await supabase.from("user_profiles").select("id, full_name, display_name").in("id", assignedByIds)
      : { data: [] };

    // 7. Batch-fetch emails for assigned users (server-only auth metadata)
    const authUserIds = (profiles ?? [])
      .map((p) => p.auth_user_id)
      .filter((id): id is string => Boolean(id));
    const emailMap = authUserIds.length > 0
      ? await batchSafeAuthMetadata(authUserIds)
      : new Map();

    // 8. Build rows
    const assigned_users: AssignedUserRow[] = userRoles.map((ur) => {
      const profile = profiles?.find((p) => p.id === ur.user_profile_id);
      const company = companies?.find((c) => c.id === ur.owner_company_id) ?? null;
      const branch = branches?.find((b) => b.id === ur.branch_id) ?? null;
      const assignedByProfile = assignedByProfiles?.find((p) => p.id === ur.assigned_by) ?? null;

      const authMeta = profile?.auth_user_id ? emailMap.get(profile.auth_user_id) : undefined;

      let scope_label = "Global";
      if (branch) scope_label = `Branch: ${branch.branch_name_en}`;
      else if (company) scope_label = `Company: ${company.legal_name_en}`;

      return {
        user_role_id: ur.id,
        user_profile_id: ur.user_profile_id,
        user_code: profile?.user_code ?? null,
        full_name: profile?.full_name ?? null,
        display_name: profile?.display_name ?? null,
        email: authMeta?.email ?? null,
        status: profile?.status ?? null,
        owner_company_id: ur.owner_company_id,
        branch_id: ur.branch_id,
        company_code: company?.company_code ?? null,
        company_name: company?.legal_name_en ?? null,
        branch_code: branch?.branch_code ?? null,
        branch_name: branch?.branch_name_en ?? null,
        scope_label,
        assigned_at: ur.assigned_at,   // USERS.3 fix
        assigned_by_name: assignedByProfile
          ? (assignedByProfile.display_name ?? assignedByProfile.full_name ?? null)
          : null,
        is_active: ur.is_active,
      };
    });

    return { success: true, data: { role, assigned_users } };
  } catch (error) {
    logger.error("getRoleWithUsersAction exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSIONS FOR ROLE RECORD (USERS.3)
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionGroupRow = {
  module_code: string;
  permissions: Array<{
    id: number;
    permission_code: string;
    permission_name: string;
    action_code: string;
    description: string | null;
    is_active: boolean;
    assigned: boolean;
  }>;
};

export async function getRolePermissionsAction(
  roleId: number,
): Promise<ActionResult<{ groups: PermissionGroupRow[]; is_system_role: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "roles.view")) {
      return { success: false, error: "You do not have permission to view roles" };
    }

    const supabase = await createClient();

    // Get role to know if it is a system role
    const { data: role } = await supabase.from("roles").select("is_system_role").eq("id", roleId).single();

    // Get all permissions
    const { data: allPerms, error: permsError } = await supabase
      .from("permissions")
      .select("id, permission_code, permission_name, action_code, description, is_active, module_code, sort_order")
      .order("module_code")
      .order("sort_order", { ascending: true })
      .order("permission_code");

    if (permsError) {
      logger.error("getRolePermissionsAction perms error", permsError.message);
      return { success: false, error: permsError.message };
    }

    // Get assigned permission ids for this role
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleId);

    const assignedIds = new Set((rolePerms ?? []).map((rp) => rp.permission_id));

    // Group by module_code
    const groupMap = new Map<string, PermissionGroupRow["permissions"]>();
    for (const perm of allPerms ?? []) {
      if (!groupMap.has(perm.module_code)) groupMap.set(perm.module_code, []);
      groupMap.get(perm.module_code)!.push({
        id: perm.id,
        permission_code: perm.permission_code,
        permission_name: perm.permission_name,
        action_code: perm.action_code,
        description: perm.description ?? null,
        is_active: perm.is_active ?? true,
        assigned: assignedIds.has(perm.id),
      });
    }

    const groups: PermissionGroupRow[] = Array.from(groupMap.entries()).map(([module_code, permissions]) => ({
      module_code,
      permissions,
    }));

    return {
      success: true,
      data: { groups, is_system_role: role?.is_system_role ?? false },
    };
  } catch (error) {
    logger.error("getRolePermissionsAction exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}
