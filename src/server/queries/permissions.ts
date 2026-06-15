import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/types/database";

/**
 * List all permissions
 * RLS-protected query
 */
export async function listPermissions(): Promise<Permission[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("permissions")
    .select("*")
    .order("module_code", { ascending: true })
    .order("permission_code", { ascending: true });

  if (error) {
    console.error("listPermissions error", error.message);
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
    console.error("getRolePermissions error", error.message);
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
    console.error("getAllRolePermissions error", error.message);
    return [];
  }

  return data ?? [];
}
