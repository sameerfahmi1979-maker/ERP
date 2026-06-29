import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import type { Permission } from "@/types/database";

/**
 * List all permissions
 * RLS-protected query with explicit USERS.1 permission guard.
 */
export async function listPermissions(): Promise<Permission[]> {
  // USERS.1 — Explicit permission guard; defense-in-depth on top of RLS.
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "permissions.view")) {
    logger.warn("listPermissions: access denied — missing permissions.view");
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("permissions")
    .select("*")
    .order("module_code", { ascending: true })
    .order("permission_code", { ascending: true });

  if (error) {
    logger.error("listPermissions error", error.message);
    return [];
  }

  return data ?? [];
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
export async function getAllRolePermissions(): Promise<Array<{ role_id: number; permission_id: number }>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_id, permission_id");

  if (error) {
    logger.error("getAllRolePermissions error", error.message);
    return [];
  }

  return data ?? [];
}
