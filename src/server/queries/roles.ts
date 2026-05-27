import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

/**
 * List all roles
 * RLS-protected query
 */
export async function listRoles(): Promise<Role[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("role_name", { ascending: true });

  if (error) {
    console.error("listRoles error", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Get a single role by ID
 * RLS-protected query
 */
export async function getRoleById(id: number): Promise<Role | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getRoleById error", error.message);
    return null;
  }

  return data;
}
