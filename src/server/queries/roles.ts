import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import type { Role } from "@/types/database";

/**
 * List all roles.
 * USERS.1 — Explicit permission guard; defense-in-depth on top of RLS.
 */
export async function listRoles(): Promise<Role[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "roles.view")) {
    logger.warn("listRoles: access denied — missing roles.view");
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("role_name", { ascending: true });

  if (error) {
    logger.error("listRoles error", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * List only active + assignable roles.
 * USERS.3 — used to populate Assign Role dialog and server-side enforcement.
 */
export async function listAssignableRoles(): Promise<Role[]> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "roles.view")) {
    logger.warn("listAssignableRoles: access denied — missing roles.view");
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("is_active", true)
    .neq("is_assignable", false)
    .order("role_name", { ascending: true });

  if (error) {
    logger.error("listAssignableRoles error", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Get a single role by ID.
 * USERS.3: explicit roles.view guard added (defense-in-depth).
 */
export async function getRoleById(id: number): Promise<Role | null> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "roles.view")) {
    logger.warn("getRoleById: access denied — missing roles.view");
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    logger.error("getRoleById error", error.message);
    return null;
  }

  return data;
}
