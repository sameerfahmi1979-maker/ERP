import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { readAllPages } from "@/server/reads/all-pages";
import type { Role } from "@/types/domain";

/**
 * List all roles.
 * USERS.1 — Explicit permission guard; defense-in-depth on top of RLS.
 */
export async function listRoles(context?: AuthContext): Promise<Role[]> {
  const ctx = context ?? await getAuthContext();
  if (!hasPermission(ctx, "roles.view")) {
    logger.warn("listRoles: access denied — missing roles.view");
    return [];
  }

  const supabase = await createClient();

  return readAllPages<Role>(
    async (from, to) => supabase.from("roles")
      .select("*", { count: "exact" })
      .order("role_name")
      .order("id")
      .range(from, to),
    { identity: row => row.id },
  );
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
export async function getRoleById(id: number, context?: AuthContext): Promise<Role | null> {
  const ctx = context ?? await getAuthContext();
  if (!hasPermission(ctx, "roles.view")) {
    logger.warn("getRoleById: access denied — missing roles.view");
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error("getRoleById error", error.message);
    throw Error("Role could not be loaded.");
  }

  return data;
}
