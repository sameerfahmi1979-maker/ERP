"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

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
      logger.error("createRole error", error);
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
    logger.error("createRole exception", error);
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

    if (oldData.is_system_role && !isGlobalAdmin(ctx)) {
      return { success: false, error: "System roles can only be modified by a global administrator." };
    }

    const dataToUpdate = {
      ...updates,
      description: updates.description === "" ? null : updates.description,
    };

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
      action: "update",
      old_values,
      new_values,
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    logger.error("updateRole exception", error);
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
      action: "delete",
      old_values: oldData,
    });

    revalidatePath("/admin/roles");
    return { success: true };
  } catch (error) {
    logger.error("deleteRole exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get role with assigned users (Phase 002D)
 * Server action for client-side usage
 */
export async function getRoleWithUsersAction(
  roleId: number
): Promise<ActionResult<{
  role: import("@/types/database").Role;
  assigned_users: Array<{
    user_role_id: number;
    user_profile: import("@/types/database").UserProfile;
    owner_company: import("@/types/database").OwnerCompany | null;
    branch: import("@/types/database").Branch | null;
    assigned_at: string;
    is_active: boolean;
  }>;
}>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "roles.view")) {
      return { success: false, error: "You do not have permission to view roles" };
    }

    const supabase = await createClient();

    // 1. Get role details
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .single();

    if (roleError || !role) {
      logger.error("getRoleWithUsersAction role error", roleError?.message);
      return { success: false, error: "Role not found" };
    }

    // 2. Get all user_roles for this role
    const { data: userRoles, error: userRolesError } = await supabase
      .from("user_roles")
      .select("id, user_profile_id, owner_company_id, branch_id, is_active, created_at")
      .eq("role_id", roleId)
      .order("created_at", { ascending: false });

    if (userRolesError) {
      logger.error("getRoleWithUsersAction user_roles error", userRolesError.message);
      return { success: true, data: { role, assigned_users: [] } };
    }

    if (!userRoles || userRoles.length === 0) {
      return { success: true, data: { role, assigned_users: [] } };
    }

    // 3. Get user profiles for all assigned users
    const userProfileIds = userRoles.map((ur) => ur.user_profile_id);
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("*")
      .in("id", userProfileIds);

    // 4. Get companies if any
    const companyIds = userRoles
      .map((ur) => ur.owner_company_id)
      .filter((id): id is number => id !== null);
    const { data: companies } = companyIds.length > 0
      ? await supabase
          .from("owner_companies")
          .select("*")
          .in("id", companyIds)
      : { data: [] };

    // 5. Get branches if any
    const branchIds = userRoles
      .map((ur) => ur.branch_id)
      .filter((id): id is number => id !== null);
    const { data: branches } = branchIds.length > 0
      ? await supabase
          .from("branches")
          .select("*")
          .in("id", branchIds)
      : { data: [] };

    // 6. Build assigned_users array
    const assigned_users = userRoles.map((ur) => {
      const profile = profiles?.find((p) => p.id === ur.user_profile_id);
      const company = companies?.find((c) => c.id === ur.owner_company_id) || null;
      const branch = branches?.find((b) => b.id === ur.branch_id) || null;

      return {
        user_role_id: ur.id,
        user_profile: profile!,
        owner_company: company,
        branch: branch,
        assigned_at: ur.created_at,
        is_active: ur.is_active,
      };
    });

    return {
      success: true,
      data: {
        role,
        assigned_users,
      },
    };
  } catch (error) {
    logger.error("getRoleWithUsersAction exception", error);
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
      logger.error("updateRoleStatus error", error);
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
    logger.error("updateRoleStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
