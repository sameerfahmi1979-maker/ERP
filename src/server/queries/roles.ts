import { createClient } from "@/lib/supabase/server";
import type { Role, UserProfile, OwnerCompany, Branch } from "@/types/database";

type RoleWithUsers = Role & {
  assigned_users: Array<{
    user_role_id: number;
    user_profile: UserProfile;
    owner_company: OwnerCompany | null;
    branch: Branch | null;
    assigned_at: string;
    is_active: boolean;
  }>;
};

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

/**
 * Get role with assigned users (Phase 002D)
 * Shows all users who have this role assigned
 * RLS-protected query
 */
export async function getRoleWithUsers(id: number): Promise<RoleWithUsers | null> {
  const supabase = await createClient();

  // 1. Get role details
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("*")
    .eq("id", id)
    .single();

  if (roleError || !role) {
    console.error("getRoleWithUsers role error", roleError?.message);
    return null;
  }

  // 2. Get all user_roles for this role
  const { data: userRoles, error: userRolesError } = await supabase
    .from("user_roles")
    .select("id, user_profile_id, owner_company_id, branch_id, is_active, created_at")
    .eq("role_id", id)
    .order("created_at", { ascending: false });

  if (userRolesError) {
    console.error("getRoleWithUsers user_roles error", userRolesError.message);
    return { ...role, assigned_users: [] };
  }

  if (!userRoles || userRoles.length === 0) {
    return { ...role, assigned_users: [] };
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
    ...role,
    assigned_users,
  };
}

// Export type
export type { RoleWithUsers };
