import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { readAllPages } from "@/server/reads/all-pages";
import type { Permission } from "@/types/domain";

/**
 * List all permissions
 * RLS-protected query with explicit USERS.1 permission guard.
 */
export async function listPermissions(context?: AuthContext): Promise<Permission[] | null> {
  const ctx = context ?? await getAuthContext();
  if (!hasPermission(ctx, "permissions.view")) {
    logger.warn("listPermissions: access denied without permissions.view");
    return null;
  }

  const supabase = await createClient();
  try {
    return await readAllPages<Permission>(
      async (from, to) => supabase
        .from("permissions")
        .select("*", { count: "exact" })
        .order("module_code")
        .order("permission_code")
        .order("id")
        .range(from, to),
      { batchSize: 250, identity: (row) => row.id },
    );
  } catch (error) {
    logger.error("listPermissions error", error);
    return null;
  }
}

/**
 * Get permissions for a specific role
 */
export async function getRolePermissions(roleId: number): Promise<number[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", roleId);

  if (error) {
    logger.error("getRolePermissions error", error.message);
    return [];
  }

  return (data ?? []).map((rp) => rp.permission_id);
}

/**
 * Get all role-permission mappings
 */
export async function getAllRolePermissions(context?: AuthContext): Promise<Array<{ role_id: number; permission_id: number }> | null> {
  const ctx = context ?? await getAuthContext();
  if (!hasPermission(ctx, "permissions.view")) {
    logger.warn("getAllRolePermissions: access denied without permissions.view");
    return null;
  }

  const supabase = await createClient();
  try {
    const rows = await readAllPages<{ id: number; role_id: number; permission_id: number }>(
      async (from, to) => supabase
        .from("role_permissions")
        .select("id, role_id, permission_id", { count: "exact" })
        .order("id")
        .range(from, to),
      { batchSize: 250, identity: (row) => row.id },
    );
    return rows.map(({ role_id, permission_id }) => ({ role_id, permission_id }));
  } catch (error) {
    logger.error("getAllRolePermissions error", error);
    return null;
  }
}
